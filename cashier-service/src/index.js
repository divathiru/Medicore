// cashier-service/src/index.js
// MediCore — cashier-service
// Port 4003 — payment processing, queue position assignment.
'use strict';
require('dotenv').config();
const express = require('express');
const cashierRouter = require('./routes/cashier');

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED_ENV = ['PORT', 'DATABASE_URL', 'JWT_SECRET'];
REQUIRED_ENV.forEach((key) => {
    if (!process.env[key]) {
        console.error(`[startup] Missing required env var: ${key}`);
        process.exit(1);
    }
});

const PORT = parseInt(process.env.PORT, 10) || 4003;
const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/cashier', cashierRouter);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[cashier-service] Listening on port ${PORT}`);
});
