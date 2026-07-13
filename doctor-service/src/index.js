// doctor-service/src/index.js
// PLACEHOLDER — will be implemented on Day 2.
'use strict';
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4002;
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(503).json({ error: 'doctor-service not yet implemented.' }));
app.listen(PORT, () => console.log(`[doctor-service] Listening on port ${PORT} (placeholder)`));