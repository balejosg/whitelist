/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * PostgreSQL Database Connection Pool
 */

import pg, { type QueryResult, type QueryResultRow } from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// =============================================================================
// Database Configuration
// =============================================================================

const config = {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'openpath',
    user: process.env.DB_USER ?? 'openpath',
    password: process.env.DB_PASSWORD ?? 'openpath_dev',
    max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Create the pool
const pool = new Pool(config);

// Log pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a query with automatic connection management
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const client = await pool.connect();
    try {
        return await client.query<T>(text, params);
    } finally {
        client.release();
    }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
    try {
        const result = await query('SELECT NOW()');
        console.log('✓ Database connection successful:', result.rows[0]);
        return true;
    } catch (error) {
        console.error('✗ Database connection failed:', error);
        return false;
    }
}

/**
 * Perform operations within a transaction
 */
export async function transaction<T>(
    fn: (query: typeof pool.query) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client.query.bind(client));
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Close the pool (for testing/shutdown)
 */
export async function close(): Promise<void> {
    await pool.end();
    console.log('Database pool closed');
}

export default {
    query,
    testConnection,
    transaction,
    close,
};
