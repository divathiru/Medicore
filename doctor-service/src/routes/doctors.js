// src/routes/doctors.js
// ─────────────────────────────────────────────────────────────────────────────
// Doctor-service endpoints — all protected by requireRole('doctor').
//
// GET  /doctors/me/appointments?date=              — daily queue
// GET  /doctors/me/patients/:patientId             — patient record (appointment-scoped)
// POST /doctors/me/patients/:patientId/prescriptions — write prescription
// POST /doctors/me/patients/:patientId/ask         — AI stub (501 until Day 5)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const prescriptionSchema = z.object({
    appointment_id: z.string().uuid('appointment_id must be a valid UUID.'),
    doctor_summary: z.string().min(1, 'doctor_summary is required.').max(4000),
    prescription_text: z.string().min(1, 'prescription_text is required.').max(8000),
});

// ─── GET /doctors/me/appointments?date= ──────────────────────────────────────
// Returns the logged-in doctor's queue for a given date (defaults to today).
// Ordered by queue_position ASC.  Uses the exact join from build guide §2.
router.get('/me/appointments', requireRole('doctor'), async (req, res) => {
    const date = req.query.date || 'today'; // 'today' → CURRENT_DATE in SQL
    try {
        const { rows } = await pool.query(
            `SELECT a.id,
                    p.id             AS patient_id,
                    p.full_name      AS patient_name,
                    a.queue_position,
                    a.status,
                    a.scheduled_date,
                    a.created_at
             FROM appointments.appointments a
             JOIN patients.patients p ON p.id = a.patient_id
             WHERE a.doctor_id = $1
               AND a.scheduled_date = CASE WHEN $2 = 'today' THEN CURRENT_DATE ELSE $2::date END
             ORDER BY a.queue_position ASC NULLS LAST, a.created_at ASC`,
            [req.user.sub, date]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[GET /doctors/me/appointments]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── GET /doctors/me/patients/:patientId ─────────────────────────────────────
// Returns full patient record but ONLY if this doctor has an appointment with
// that patient.  Enforced at the SQL level with a WHERE EXISTS subquery —
// not just an application-layer check.
router.get('/me/patients/:patientId', requireRole('doctor'), async (req, res) => {
    const { patientId } = req.params;
    try {
        // 1. Verify appointment relationship exists (SQL-enforced, not app-level)
        const authCheck = await pool.query(
            `SELECT 1
             FROM appointments.appointments
             WHERE doctor_id  = $1
               AND patient_id = $2
               AND status     != 'cancelled'
             LIMIT 1`,
            [req.user.sub, patientId]
        );
        if (authCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'Access denied. No appointment relationship with this patient.',
            });
        }

        // 2. Fetch patient profile
        const profileRes = await pool.query(
            `SELECT p.id, u.email, p.full_name, p.dob, p.phone
             FROM patients.patients p
             JOIN auth.users u ON u.id = p.id
             WHERE p.id = $1`,
            [patientId]
        );
        if (profileRes.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        // 3. Fetch old summaries
        const summariesRes = await pool.query(
            `SELECT id, source_hospital, file_url, extracted_text, uploaded_at
             FROM patients.old_summaries
             WHERE patient_id = $1
             ORDER BY uploaded_at DESC`,
            [patientId]
        );

        // 4. Fetch all prescriptions this doctor wrote for this patient
        //    (via the appointments join)
        const prescriptionsRes = await pool.query(
            `SELECT pr.id,
                    pr.appointment_id,
                    pr.doctor_summary,
                    pr.prescription_text,
                    pr.created_at,
                    a.scheduled_date
             FROM appointments.prescriptions pr
             JOIN appointments.appointments a ON a.id = pr.appointment_id
             WHERE a.patient_id = $1
               AND a.doctor_id  = $2
             ORDER BY pr.created_at DESC`,
            [patientId, req.user.sub]
        );

        return res.json({
            patient: profileRes.rows[0],
            old_summaries: summariesRes.rows,
            prescriptions: prescriptionsRes.rows,
        });
    } catch (err) {
        console.error('[GET /doctors/me/patients/:patientId]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── POST /doctors/me/patients/:patientId/prescriptions ──────────────────────
// Inserts a prescription and marks the appointment as 'completed'.
// TODO (Day 5): POST to ai-service /ingest/patient/{id}
router.post('/me/patients/:patientId/prescriptions', requireRole('doctor'), async (req, res) => {
    const { patientId } = req.params;
    const result = prescriptionSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { appointment_id, doctor_summary, prescription_text } = result.data;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify this appointment belongs to the logged-in doctor + given patient.
        const apptCheck = await client.query(
            `SELECT id FROM appointments.appointments
             WHERE id         = $1
               AND doctor_id  = $2
               AND patient_id = $3
               AND status    != 'cancelled'`,
            [appointment_id, req.user.sub, patientId]
        );
        if (apptCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                error: 'Appointment not found or does not belong to this doctor/patient pair.',
            });
        }

        // Insert prescription
        const { rows } = await client.query(
            `INSERT INTO appointments.prescriptions
               (appointment_id, doctor_summary, prescription_text)
             VALUES ($1, $2, $3)
             RETURNING id, appointment_id, doctor_summary, prescription_text, created_at`,
            [appointment_id, doctor_summary, prescription_text]
        );

        // Update appointment status → completed
        await client.query(
            `UPDATE appointments.appointments
             SET status = 'completed'
             WHERE id = $1`,
            [appointment_id]
        );

        await client.query('COMMIT');

        // Fire-and-forget: POST prescription text to ai-service for RAG ingestion.
        // Non-blocking — DB write already committed; ingest failure is logged but
        // does NOT roll back the prescription.
        const aiIngestUrl = `${process.env.AI_SERVICE_URL}/ingest/patient/${patientId}`;
        fetch(aiIngestUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `${doctor_summary}\n\nPrescription:\n${prescription_text}`,
                source: 'doctor_prescription',
            }),
        }).catch((err) =>
            console.error('[ai-service ingest] Failed to ingest prescription:', err.message)
        );

        return res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[POST /doctors/me/patients/:patientId/prescriptions]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// ─── POST /doctors/me/patients/:patientId/ask ────────────────────────────────
// Proxies to ai-service POST /chat/patient.
// Auth layering:
//   1. Gateway: valid JWT required.
//   2. Here: requireRole('doctor') + appointment-relationship check (SQL WHERE EXISTS).
//   3. ai-service: SQL WHERE namespace='patient' AND patient_id=:id (cannot be overridden).
const askSchema = require('zod').object({
    question: require('zod').string().min(1, 'question is required.').max(2000),
});

router.post('/me/patients/:patientId/ask', requireRole('doctor'), async (req, res) => {
    const { patientId } = req.params;

    // Validate request body
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { question } = parsed.data;

    // Verify doctor has an appointment with this patient (same guard as GET /me/patients/:patientId)
    try {
        const authCheck = await pool.query(
            `SELECT 1
             FROM appointments.appointments
             WHERE doctor_id  = $1
               AND patient_id = $2
               AND status     != 'cancelled'
             LIMIT 1`,
            [req.user.sub, patientId]
        );
        if (authCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'Access denied. No appointment relationship with this patient.',
            });
        }
    } catch (err) {
        console.error('[POST /doctors/me/patients/:patientId/ask] DB check failed:', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }

    // Audit log (doctor_id visible here; patient_id echoed in ai-service log)
    console.log(
        `[AUDIT /ask] doctor_id=${req.user.sub} patient_id=${patientId} question=${JSON.stringify(question)}`
    );

    // Forward to ai-service
    const aiUrl = `${process.env.AI_SERVICE_URL}/chat/patient`;
    try {
        const aiRes = await fetch(aiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: patientId, question }),
        });
        const data = await aiRes.json();
        if (!aiRes.ok) {
            return res.status(aiRes.status).json({
                error: data.detail || data.error || 'ai-service error.',
            });
        }
        return res.json(data);
    } catch (err) {
        console.error('[POST /doctors/me/patients/:patientId/ask] ai-service unreachable:', err.message);
        return res.status(502).json({ error: 'AI service is currently unavailable.' });
    }
});

module.exports = router;
