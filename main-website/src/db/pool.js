// src/db/pool.js
// Shared connection pool for main-website (auth schema queries).
// All other services use their own copy of this file.
'use strict';
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Conservative pool settings for a demo deployment (≤9 concurrent users).
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
// Surface connection errors early so the container restarts cleanly.
pool.on('error', (err) => {
    console.error('[db/pool] Unexpected idle client error:', err.message);
});
module.exports = pool;