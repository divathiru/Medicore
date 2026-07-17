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
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { z } = require('zod');
const pool = require('../db/pool');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────
// Maximum appointments any single doctor can have on one calendar date.
const MAX_DAILY_SLOTS = 10;

// ─── Multer: store uploads in /uploads volume ─────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, '/uploads'),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, unique + path.extname(file.originalname));
    },
});
const upload = multer({
    storage,
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
// Text is extracted server-side from the uploaded file.
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
// Text is extracted SERVER-SIDE from the file — do not send extracted_text
// as a body field, it will be ignored if present.
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

        const filePath = req.file.path;
        const file_url = `/uploads/${req.file.filename}`;
        const originalName = req.file.originalname.toLowerCase();

        // ── Server-side text extraction ──────────────────────────────────────
        let extracted_text;
        try {
            if (originalName.endsWith('.pdf')) {
                const buffer = fs.readFileSync(filePath);
                const parsed = await pdfParse(buffer);
                extracted_text = parsed.text;
            } else if (originalName.endsWith('.docx')) {
                const result = await mammoth.extractRawText({ path: filePath });
                extracted_text = result.value;
            } else if (originalName.endsWith('.txt') || originalName.endsWith('.md')) {
                extracted_text = fs.readFileSync(filePath, 'utf8');
            } else {
                // Reject file types that slipped past multer
                return res.status(400).json({
                    error: `Unsupported file type. Please upload a PDF, DOCX, TXT, or MD file.`,
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

        // ── DB insert ────────────────────────────────────────────────────────
        try {
            const { rows } = await pool.query(
                `INSERT INTO patients.old_summaries
                   (patient_id, source_hospital, file_url, extracted_text)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, patient_id, source_hospital, file_url, extracted_text, uploaded_at`,
                [req.user.sub, source_hospital ?? null, file_url, extracted_text.trim()]
            );

            // Fire-and-forget: POST extracted text to ai-service for RAG ingestion.
            const aiIngestUrl = `${process.env.AI_SERVICE_URL}/ingest/patient/${req.user.sub}`;
            fetch(aiIngestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: extracted_text.trim(),
                    source: source_hospital || req.file.originalname,
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
// Returns the patient's own appointment history joined with doctor info.
router.get('/me/appointments', requireRole('patient'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.id,
                    a.scheduled_date,
                    a.status,
                    a.queue_position,
                    a.created_at,
                    d.full_name  AS doctor_name,
                    d.department AS doctor_department
             FROM appointments.appointments a
             JOIN doctors.doctors d ON d.id = a.doctor_id
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
