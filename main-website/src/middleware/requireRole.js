// src/middleware/requireRole.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared JWT verification + role-check middleware.
// This EXACT file is duplicated into every Node service (main-website,
// patient-service, doctor-service, cashier-service).  Do NOT vary the
// implementation between services.
//
// Usage:
//   const requireRole = require('./middleware/requireRole');
//   router.get('/protected', requireRole('doctor'), handler);
//   router.get('/multi',     requireRole('patient', 'doctor'), handler);
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const jwt = require('jsonwebtoken');
/**
 * Express middleware factory.
 * @param {...string} roles - One or more allowed role strings.
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
    return function (req, res, next) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
        }
        const token = authHeader.slice(7); // strip "Bearer "
        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token has expired.' });
            }
            return res.status(401).json({ error: 'Invalid token.' });
        }
        if (roles.length > 0 && !roles.includes(payload.role)) {
            return res.status(403).json({
                error: `Access denied. Required role(s): ${roles.join(', ')}.`,
            });
        }
        // Attach decoded claims to request for downstream handlers.
        req.user = { sub: payload.sub, role: payload.role };
        return next();
    };
}
module.exports = requireRole;
