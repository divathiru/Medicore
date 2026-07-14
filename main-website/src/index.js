// src/index.js
// MediCore — main-website
// Dual role: auth service (signup/login/me) + API gateway (proxy to downstream
// services). All downstream service stanzas are wired now; their docker-compose
// entries are commented-out. Day 2 only needs to uncomment those stanzas.
'use strict';
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authRouter = require('./routes/auth');
const requireRole = require('./middleware/requireRole');
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
    windowMs: 60 * 1000,      // 1 minute
    max: 100,
    standardHeaders: true,    // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use(limiter);
app.use(express.json({ limit: '2mb' }));
// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// ─── Auth routes (public — no JWT needed for signup/login) ───────────────────
app.use('/auth', authRouter);
// ─── Proxy helpers ────────────────────────────────────────────────────────────
// http-proxy-middleware v3 requires explicit changeOrigin + pathFilter/router.
// The proxy for each service is defined here so Day 2 only needs to uncomment
// the docker-compose stanzas — zero code changes required here.
function makeProxy(targetEnvVar, pathPrefix) {
    const target = process.env[targetEnvVar];
    if (!target) {
        console.warn(
            `[proxy] ${targetEnvVar} is not set — requests to ${pathPrefix}/* will return 503.`
        );
        // Return a stub that sends a service-unavailable response.
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
app.use('/ai/chat/public', makeProxy('AI_SERVICE_URL', '/ai/chat/public'));
app.use(
    '/ai',
    verifyAnyRole,
    makeProxy('AI_SERVICE_URL', '/ai')
);
// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[main-website] Listening on port ${PORT}`);
});
