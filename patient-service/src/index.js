// patient-service/src/index.js
// MediCore — patient-service
// Port 4001 — patient profile, summaries upload, appointment booking.
'use strict';
require('dotenv').config();
const express = require('express');
const patientsRouter = require('./routes/patients');

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED_ENV = ['PORT', 'DATABASE_URL', 'JWT_SECRET'];
REQUIRED_ENV.forEach((key) => {
    if (!process.env[key]) {
        console.error(`[startup] Missing required env var: ${key}`);
        process.exit(1);
    }
});

const PORT = parseInt(process.env.PORT, 10) || 4001;
const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
// Note: multipart/form-data is handled by multer inside the route.

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/patients', patientsRouter);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[patient-service] Listening on port ${PORT}`);
});
