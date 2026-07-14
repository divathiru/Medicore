// src/db/pool.js
// Shared connection pool for cashier-service.
'use strict';
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
pool.on('error', (err) => {
    console.error('[db/pool] Unexpected idle client error:', err.message);
});
module.exports = pool;
