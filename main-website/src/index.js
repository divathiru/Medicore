'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authRouter = require('./routes/auth');
const requireRole = require('./middleware/requireRole');
const pool = require('./db/pool');
// ─── Validate required env vars early ────────────────────────────────────────
const REQUIRED_ENV = ['PORT', 'DATABASE_URL', 'JWT_SECRET'];
REQUIRED_ENV.forEach((key) => {
    if (!process.env[key]) {
        console.error(`[startup] Missing required env var: ${key}`);
        process.exit(1);
    }
});
const PORT = parseInt(process.env.PORT, 10) || 4000;
const app = express();
// ─── Global middleware ────────────────────────────────────────────────────────
// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// CORS — allow the React frontend (any localhost origin in dev, nginx in prod)
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        /^http:\/\/localhost:\d+$/,
    ],
    credentials: true,
}));

// IMPORTANT: Do NOT apply express.json() globally.
// If the gateway parses the body stream, the proxy can no longer forward it
// (the stream is already drained → "request aborted" at the upstream).
// JSON parsing is applied ONLY to the /auth router which handles its own body.
// All proxy routes forward the raw bytes directly to the upstream service.

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// ─── Public: doctor listing for marketing page (no JWT required) ──────────────
app.get('/doctors', async (_req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT d.id, d.full_name, d.department, d.experience_years, d.bio
             FROM doctors.doctors d
             ORDER BY d.full_name ASC`
        );
        return res.json(rows);
    } catch (err) {
        console.error('[GET /doctors public]', err.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});
// ─── Auth routes (public — no JWT needed for signup/login) ───────────────────
// Auth routes need body parsing — apply express.json() only here.
app.use('/auth', express.json({ limit: '2mb' }), authRouter);
// ─── Proxy helpers ────────────────────────────────────────────────────────────
// http-proxy-middleware v2: changeOrigin + onProxyReq + onError.
// onProxyReq is required to forward the Content-Type + Content-Length headers
// correctly when the upstream expects a JSON body.
function makeProxy(targetEnvVar, pathPrefix) {
    const target = process.env[targetEnvVar];
    if (!target) {
        console.warn(
            `[proxy] ${targetEnvVar} is not set — requests to ${pathPrefix}/* will return 503.`
        );
        return (_req, res) =>
            res.status(503).json({ error: `${pathPrefix} service is not available yet.` });
    }
    return createProxyMiddleware({
        target,
        changeOrigin: true,
        onError: (err, _req, res) => {
            console.error(`[proxy → ${target}]`, err.message);
            res.status(502).json({ error: 'Upstream service error.' });
        },
    });
}
// ─── Protected proxy routes ───────────────────────────────────────────────────
// Each proxy verifies the JWT before forwarding.
// The role check is intentionally permissive at the gateway level (just "is the
// token valid?") — each downstream service enforces its own role(s).
const verifyAnyRole = requireRole('patient', 'doctor', 'cashier');
app.use(
    '/patients',
    verifyAnyRole,
    makeProxy('PATIENT_SERVICE_URL', '/patients')
);
app.use(
    '/doctors',
    verifyAnyRole,
    makeProxy('DOCTOR_SERVICE_URL', '/doctors')
);
app.use(
    '/cashier',
    verifyAnyRole,
    makeProxy('CASHIER_SERVICE_URL', '/cashier')
);
// /ai/chat/public is intentionally public — no JWT required.
// /ai/chat/patient and /ai/ingest/* require a valid JWT.
// NOTE: ai-service routes are /chat/* and /ingest/* (no /ai prefix).
// pathRewrite strips the leading /ai before forwarding to the upstream.
app.use(
    '/ai/chat/public',
    createProxyMiddleware({
        target: process.env.AI_SERVICE_URL || '',
        changeOrigin: true,
        pathRewrite: { '^/ai': '' },
        onError: (err, _req, res) => {
            console.error('[proxy → ai-service]', err.message);
            res.status(502).json({ error: 'Upstream service error.' });
        },
    })
);
app.use(
    '/ai',
    verifyAnyRole,
    createProxyMiddleware({
        target: process.env.AI_SERVICE_URL || '',
        changeOrigin: true,
        pathRewrite: { '^/ai': '' },
        onError: (err, _req, res) => {
            console.error('[proxy → ai-service]', err.message);
            res.status(502).json({ error: 'Upstream service error.' });
        },
    })
);
// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[main-website] Listening on port ${PORT}`);
});
