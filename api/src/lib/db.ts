/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * PostgreSQL Database Connection Pool
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================

const config = {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'openpath',
    user: process.env.DB_USER ?? 'openpath',
    password: process.env.DB_PASSWORD ?? 'openpath_dev',
    max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

// =============================================================================
// Connection Pool
// =============================================================================

export const pool = new Pool(config);

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a query with automatic connection management
 */
export async function query<T = unknown>(
    text: string,
    params?: unknown[]
): Promise<pg.QueryResult<T>> {
    const client = await pool.connect();
    try {
        return await client.query<T>(text, params);
    } finally {
        client.release();
    }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
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
 * Close the connection pool
 */
export async function close(): Promise<void> {
    await pool.end();
}

export default {
    pool,
    query,
    transaction,
    testConnection,
    close,
};
