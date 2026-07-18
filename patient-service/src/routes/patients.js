// src/routes/patients.js
// ─────────────────────────────────────────────────────────────────────────────
// Patient-service endpoints — all scoped to the authenticated patient's own
// sub (req.user.sub from JWT).  Never trust a client-supplied patient_id.
//
// GET  /patients/me                   — fetch own profile
// PUT  /patients/me                   — update own profile
// POST /patients/me/summaries         — upload old medical summary (multipart)
// POST /patients/me/appointments      — book an appointment (transactional)
// GET  /patients/me/appointments      — own appointment history
//
// S3 NOTE: Uploaded files are stored in S3, not on local disk.
// The bucket name is read from the S3_BUCKET_NAME environment variable.
// On ECS Fargate, the patient-service task role grants s3:PutObject/GetObject
// scoped to patient-uploads/* — no access keys in code.
// For local docker-compose testing outside AWS, set AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, and AWS_REGION env vars pointing at a real S3 bucket
// or a LocalStack endpoint. See README Known Simplifications for details.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { z } = require('zod');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────
// Maximum appointments any single doctor can have on one calendar date.
const MAX_DAILY_SLOTS = 10;

// ─── S3 client — uses default credential chain ────────────────────────────────
// In ECS: the task role is assumed automatically via the metadata endpoint.
// In local dev: set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION,
// or use AWS_PROFILE. Never put credentials in code or docker-compose.
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const S3_BUCKET = process.env.S3_BUCKET_NAME;

// ─── Multer: memory storage (buffer → S3, never touches disk) ─────────────────
// We use memoryStorage so the file buffer is available for both text extraction
// and the S3 PutObject call without writing to the (ephemeral) container disk.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (_req, file, cb) => {
        // Accept document types we can extract text from server-side
        const allowedMime = /pdf|msword|vnd\.openxmlformats|plain|markdown/i;
        const allowedExt  = /\.(pdf|docx|txt|md)$/i;
        const ok = allowedMime.test(file.mimetype) || allowedExt.test(file.originalname);
        cb(null, ok);
    },
});

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const updateProfileSchema = z.object({
    full_name: z.string().min(1).max(255).optional(),
    dob: z.string().optional(),
    phone: z.string().max(30).optional(),
});

// Note: extracted_text is intentionally NOT in this schema.
// Text is extracted server-side from the uploaded file buffer.
const summarySchema = z.object({
    source_hospital: z.string().min(1).max(255).optional(),
});

const bookAppointmentSchema = z.object({
    doctor_id: z.string().uuid('doctor_id must be a valid UUID.'),
    scheduled_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'scheduled_date must be YYYY-MM-DD.'),
});

// ─── GET /patients/me ─────────────────────────────────────────────────────────
router.get('/me', requireRole('patient'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT p.id, u.email, p.full_name, p.dob, p.phone, u.created_at
             FROM patients.patients p
             JOIN auth.users u ON u.id = p.id
             WHERE p.id = $1`,
            [req.user.sub]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Patient profile not found.' });
        }
        return res.json(rows[0]);
    } catch (err) {
        console.error('[GET /patients/me]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── PUT /patients/me ─────────────────────────────────────────────────────────
router.put('/me', requireRole('patient'), async (req, res) => {
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { full_name, dob, phone } = result.data;
    try {
        const { rows } = await pool.query(
            `UPDATE patients.patients
             SET full_name = COALESCE($1, full_name),
                 dob       = COALESCE($2::date, dob),
                 phone     = COALESCE($3, phone)
             WHERE id = $4
             RETURNING id, full_name, dob, phone`,
            [full_name ?? null, dob ?? null, phone ?? null, req.user.sub]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Patient profile not found.' });
        }
        return res.json(rows[0]);
    } catch (err) {
        console.error('[PUT /patients/me]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── POST /patients/me/summaries ─────────────────────────────────────────────
// Accepts multipart/form-data with a required `file` field.
// Workflow:
//   1. multer reads file into memory buffer (no disk write)
//   2. Extract text from buffer (PDF / DOCX / TXT / MD)
//   3. Upload original buffer to S3 under patient-uploads/{patient_id}/{uuid}-{filename}
//   4. INSERT into patients.old_summaries with the S3 key as file_url
//   5. Fire-and-forget POST to ai-service for RAG ingestion
router.post(
    '/me/summaries',
    requireRole('patient'),
    upload.single('file'),
    async (req, res) => {
        // File is required
        if (!req.file) {
            return res.status(400).json({ error: 'A file is required (PDF, DOCX, TXT, or MD).' });
        }

        // Validate optional metadata fields
        const result = summarySchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: result.error.errors[0].message });
        }
        const { source_hospital } = result.data;

        const fileBuffer   = req.file.buffer;
        const originalName = req.file.originalname.toLowerCase();
        const patientId    = req.user.sub;

        // ── Server-side text extraction from buffer ──────────────────────────
        let extracted_text;
        try {
            if (originalName.endsWith('.pdf')) {
                const parsed = await pdfParse(fileBuffer);
                extracted_text = parsed.text;
            } else if (originalName.endsWith('.docx')) {
                const extracted = await mammoth.extractRawText({ buffer: fileBuffer });
                extracted_text = extracted.value;
            } else if (originalName.endsWith('.txt') || originalName.endsWith('.md')) {
                extracted_text = fileBuffer.toString('utf8');
            } else {
                return res.status(400).json({
                    error: 'Unsupported file type. Please upload a PDF, DOCX, TXT, or MD file.',
                });
            }
        } catch (extractErr) {
            console.error('[POST /patients/me/summaries] extraction error:', extractErr.message);
            return res.status(422).json({
                error: `Could not extract text from file: ${extractErr.message}`,
            });
        }

        if (!extracted_text || !extracted_text.trim()) {
            return res.status(422).json({
                error: 'No readable text found in the uploaded file. Try a text-based PDF or plain text file.',
            });
        }

        // ── S3 upload ────────────────────────────────────────────────────────
        // Key format: patient-uploads/{patient_id}/{uuid}-{original_filename}
        // The bucket stays private — file_url stores the S3 key, not a URL.
        // Generating presigned URLs for download is out of scope for this build
        // (noted in README Known Simplifications).
        if (!S3_BUCKET) {
            console.error('[POST /patients/me/summaries] S3_BUCKET_NAME env var is not set');
            return res.status(500).json({ error: 'Storage not configured (S3_BUCKET_NAME missing).' });
        }

        const s3Key = `patient-uploads/${patientId}/${uuidv4()}-${req.file.originalname}`;
        try {
            await s3.send(new PutObjectCommand({
                Bucket:      S3_BUCKET,
                Key:         s3Key,
                Body:        fileBuffer,
                ContentType: req.file.mimetype || 'application/octet-stream',
            }));
            console.log(`[POST /patients/me/summaries] Uploaded to S3: ${s3Key}`);
        } catch (s3Err) {
            console.error('[POST /patients/me/summaries] S3 upload error:', s3Err.message);
            return res.status(500).json({ error: 'Failed to store uploaded file.' });
        }

        // ── DB insert ────────────────────────────────────────────────────────
        // file_url stores the S3 key (not a local path, not a presigned URL).
        // The key is stable and can be used server-side to generate a presigned
        // URL on demand in a future version.
        try {
            const { rows } = await pool.query(
                `INSERT INTO patients.old_summaries
                   (patient_id, source_hospital, file_url, extracted_text)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, patient_id, source_hospital, file_url, extracted_text, uploaded_at`,
                [patientId, source_hospital ?? null, s3Key, extracted_text.trim()]
            );

            // Fire-and-forget: POST extracted text to ai-service for RAG ingestion.
            const aiIngestUrl = `${process.env.AI_SERVICE_URL}/ingest/patient/${patientId}`;
            fetch(aiIngestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: extracted_text.trim(),
                    source: source_hospital || req.file.originalname,
                    source_type: 'old_summary',
                }),
            }).catch((err) =>
                console.error('[ai-service ingest] Failed to ingest patient summary:', err.message)
            );

            return res.status(201).json(rows[0]);
        } catch (err) {
            console.error('[POST /patients/me/summaries]', err.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }
);

// ─── POST /patients/me/appointments ──────────────────────────────────────────
// Books an appointment.  Uses SELECT … FOR UPDATE inside a transaction to
// prevent double-booking under concurrent requests.
router.post('/me/appointments', requireRole('patient'), async (req, res) => {
    const result = bookAppointmentSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { doctor_id, scheduled_date } = result.data;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock all existing bookings for this doctor+date to prevent races.
        const existingRes = await client.query(
            `SELECT id FROM appointments.appointments
             WHERE doctor_id = $1
               AND scheduled_date = $2::date
               AND status != 'cancelled'
             FOR UPDATE`,
            [doctor_id, scheduled_date]
        );

        if (existingRes.rows.length >= MAX_DAILY_SLOTS) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: `Doctor is fully booked for ${scheduled_date}. Maximum ${MAX_DAILY_SLOTS} appointments per day.`,
            });
        }

        // Verify the doctor exists
        const doctorCheck = await client.query(
            'SELECT id FROM doctors.doctors WHERE id = $1',
            [doctor_id]
        );
        if (doctorCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Doctor not found.' });
        }

        // Insert the new appointment with status 'booked' (no queue_position yet —
        // the cashier assigns that when payment is processed).
        const { rows } = await client.query(
            `INSERT INTO appointments.appointments
               (patient_id, doctor_id, scheduled_date, status)
             VALUES ($1, $2, $3::date, 'booked')
             RETURNING id, patient_id, doctor_id, scheduled_date, status, queue_position, created_at`,
            [req.user.sub, doctor_id, scheduled_date]
        );

        await client.query('COMMIT');
        return res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[POST /patients/me/appointments]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// ─── GET /patients/me/appointments ───────────────────────────────────────────
// Returns the patient's own appointment history joined with doctor info and,
// for completed appointments, the prescription written by the doctor.
router.get('/me/appointments', requireRole('patient'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.id,
                    a.scheduled_date,
                    a.status,
                    a.queue_position,
                    a.created_at,
                    d.full_name  AS doctor_name,
                    d.department AS doctor_department,
                    pr.doctor_summary,
                    pr.prescription_text,
                    pr.created_at AS prescription_created_at
             FROM appointments.appointments a
             JOIN doctors.doctors d ON d.id = a.doctor_id
             LEFT JOIN appointments.prescriptions pr ON pr.appointment_id = a.id
             WHERE a.patient_id = $1
             ORDER BY a.scheduled_date DESC, a.created_at DESC`,
            [req.user.sub]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[GET /patients/me/appointments]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});


module.exports = router;
