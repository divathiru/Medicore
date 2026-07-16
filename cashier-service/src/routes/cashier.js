// src/routes/cashier.js
// ─────────────────────────────────────────────────────────────────────────────
// Cashier-service endpoints.
//
// POST /cashier/payments             — process payment, assign queue_position
// GET  /cashier/queue/:doctorId?date= — masked queue view (privacy requirement)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const paymentSchema = z.object({
    appointment_id: z.string().uuid('appointment_id must be a valid UUID.'),
    amount: z
        .number({ invalid_type_error: 'amount must be a number.' })
        .positive('amount must be positive.')
        .max(999999.99, 'amount is unreasonably large.'),
});

// ─── POST /cashier/payments ───────────────────────────────────────────────────
// 1. Insert into cashier.payments
// 2. Update appointment status → 'paid'
// 3. Assign next queue_position for that doctor+date (max + 1, or 1 if none)
// 4. Update appointment status → 'in_queue'
// All four writes happen in a single transaction.
router.post('/payments', requireRole('cashier'), async (req, res) => {
    const result = paymentSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { appointment_id, amount } = result.data;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch the appointment — lock it to prevent concurrent queue-position races.
        const apptRes = await client.query(
            `SELECT id, doctor_id, scheduled_date, status
             FROM appointments.appointments
             WHERE id = $1
             FOR UPDATE`,
            [appointment_id]
        );

        if (apptRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Appointment not found.' });
        }

        const appt = apptRes.rows[0];

        // Only allow payment on a 'booked' appointment.
        if (appt.status !== 'booked') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: `Appointment is already '${appt.status}'. Only 'booked' appointments can be paid.`,
            });
        }

        // Insert payment record.
        const paymentRes = await client.query(
            `INSERT INTO cashier.payments (appointment_id, amount, paid_at)
             VALUES ($1, $2, now())
             RETURNING id, appointment_id, amount, paid_at`,
            [appointment_id, amount]
        );

        // Update status → 'paid' first (intermediate state for audit trail).
        await client.query(
            `UPDATE appointments.appointments SET status = 'paid' WHERE id = $1`,
            [appointment_id]
        );

        // Determine next queue_position for this doctor+date.
        // The transaction-level lock on the appointment row above (FOR UPDATE)
        // is sufficient to prevent concurrent races on queue_position.
        // PostgreSQL does not allow FOR UPDATE on aggregate queries.
        const queueRes = await client.query(
            `SELECT COALESCE(MAX(queue_position), 0) AS max_pos
             FROM appointments.appointments
             WHERE doctor_id      = $1
               AND scheduled_date = $2
               AND status         IN ('in_queue', 'completed')`,
            [appt.doctor_id, appt.scheduled_date]
        );
        const nextPos = parseInt(queueRes.rows[0].max_pos, 10) + 1;

        // Assign queue_position and flip status → 'in_queue'.
        await client.query(
            `UPDATE appointments.appointments
             SET queue_position = $1,
                 status         = 'in_queue'
             WHERE id = $2`,
            [nextPos, appointment_id]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            payment: paymentRes.rows[0],
            appointment_id,
            queue_position: nextPos,
            status: 'in_queue',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[POST /cashier/payments]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// ─── GET /cashier/queue/:doctorId?date= ──────────────────────────────────────
// Privacy requirement: never expose real patient names in this shared view.
// Returns masked identifiers ("Patient 3 of 8") ordered by queue_position.
// Accessible by any authenticated user (patient, doctor, cashier).
router.get(
    '/queue/:doctorId',
    requireRole('patient', 'doctor', 'cashier'),
    async (req, res) => {
        const { doctorId } = req.params;
        const date = req.query.date || 'today';

        try {
            const { rows } = await pool.query(
                `SELECT a.id,
                        a.queue_position,
                        a.status,
                        a.scheduled_date
                 FROM appointments.appointments a
                 WHERE a.doctor_id      = $1
                   AND a.scheduled_date = CASE WHEN $2 = 'today' THEN CURRENT_DATE ELSE $2::date END
                   AND a.status         IN ('in_queue', 'completed', 'paid')
                 ORDER BY a.queue_position ASC NULLS LAST`,
                [doctorId, date]
            );

            const total = rows.length;

            // Build masked response — never return patient names or IDs.
            const masked = rows.map((row, idx) => ({
                position: row.queue_position,
                label: `Patient ${idx + 1} of ${total}`,
                status: row.status,
                scheduled_date: row.scheduled_date,
            }));

            return res.json({ total, queue: masked });
        } catch (err) {
            console.error('[GET /cashier/queue/:doctorId]', err.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }
);

// ─── GET /cashier/appointments?status= ───────────────────────────────────────
// Returns appointments with real IDs for cashier payment processing.
// Defaults to status=booked; cashier role required.
router.get('/appointments', requireRole('cashier'), async (req, res) => {
    const status = req.query.status || 'booked';
    const date = req.query.date || null;
    try {
        const { rows } = await pool.query(
            `SELECT a.id,
                    a.patient_id,
                    a.doctor_id,
                    a.scheduled_date,
                    a.status,
                    a.queue_position,
                    a.created_at,
                    p.full_name  AS patient_name,
                    d.full_name  AS doctor_name,
                    d.department AS doctor_department
             FROM appointments.appointments a
             JOIN patients.patients p  ON p.id = a.patient_id
             JOIN doctors.doctors   d  ON d.id = a.doctor_id
             WHERE a.status = $1
               AND ($2::date IS NULL OR a.scheduled_date = $2::date)
             ORDER BY a.scheduled_date DESC, a.created_at DESC`,
            [status, date]
        );
        return res.json(rows);
    } catch (err) {
        console.error('[GET /cashier/appointments]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;

