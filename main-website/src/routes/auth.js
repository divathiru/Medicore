// src/routes/auth.js
// POST /auth/signup  — patients self-register (public)
// POST /auth/login   — any role, returns JWT
// GET  /auth/me      — returns decoded JWT claims (requires valid JWT)
'use strict';
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db/pool');
const requireRole = require('../middleware/requireRole');
const router = express.Router();
// ─── Zod schemas ──────────────────────────────────────────────────────────────
const signupSchema = z.object({
    email: z.string().email('Invalid email address.'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters.')
        .max(72, 'Password too long.'),   // bcrypt max is 72 bytes
    full_name: z.string().min(1, 'full_name is required.').max(255),
    dob: z.string().optional(),         // ISO date string
    phone: z.string().optional(),
});
const loginSchema = z.object({
    email: z.string().email('Invalid email address.'),
    password: z.string().min(1, 'Password is required.'),
});
// ─── Helper: issue JWT ────────────────────────────────────────────────────────
function issueToken(user) {
    return jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '8h' }
    );
}
// ─── POST /auth/signup ────────────────────────────────────────────────────────
// Public route — patients only.
// Creates a row in auth.users (role='patient') and patients.patients.
router.post('/signup', async (req, res) => {
    // 1. Validate input
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { email, password, full_name, dob, phone } = result.data;
    try {
        // 2. Check for duplicate email
        const existing = await pool.query(
            'SELECT id FROM auth.users WHERE email = $1',
            [email]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email is already registered.' });
        }
        // 3. Hash password
        const password_hash = await bcrypt.hash(password, 12);
        // 4. Insert auth.users + patients.patients in one transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const userRes = await client.query(
                `INSERT INTO auth.users (email, password_hash, role)
         VALUES ($1, $2, 'patient')
         RETURNING id, email, role, created_at`,
                [email, password_hash]
            );
            const user = userRes.rows[0];
            await client.query(
                `INSERT INTO patients.patients (id, full_name, dob, phone)
         VALUES ($1, $2, $3, $4)`,
                [user.id, full_name, dob || null, phone || null]
            );
            await client.query('COMMIT');
            // 5. Issue JWT
            const token = issueToken(user);
            return res.status(201).json({
                id: user.id,
                email: user.email,
                role: user.role,
                full_name,
                created_at: user.created_at,
                token,
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[POST /auth/signup]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});
// ─── POST /auth/login ─────────────────────────────────────────────────────────
// Public route — any role.
router.post('/login', async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { email, password } = result.data;
    try {
        const userRes = await pool.query(
            'SELECT id, email, password_hash, role FROM auth.users WHERE email = $1',
            [email]
        );
        if (userRes.rows.length === 0) {
            // Use a generic message to avoid user-enumeration attacks.
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const user = userRes.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const token = issueToken(user);
        return res.status(200).json({
            id: user.id,
            email: user.email,
            role: user.role,
            token,
        });
    } catch (err) {
        console.error('[POST /auth/login]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});
// ─── GET /auth/me ─────────────────────────────────────────────────────────────
// Protected — any authenticated role.
router.get('/me', requireRole('patient', 'doctor', 'cashier'), (req, res) => {
    // req.user is set by requireRole middleware.
    return res.status(200).json(req.user);
});
module.exports = router;
