// patient-service/src/index.js
// PLACEHOLDER — will be implemented on Day 2.
// This file exists so the monorepo skeleton is complete.
'use strict';
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4001;
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(503).json({ error: 'patient-service not yet implemented.' }));
app.listen(PORT, () => console.log(`[patient-service] Listening on port ${PORT} (placeholder)`));
