/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Drizzle ORM Database Client
 * Main entry point for database operations.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { logger } from '../lib/logger.js';
import * as schema from './schema.js';
import * as relations from './relations.js';
import { config } from '../config.js';

const { Pool } = pg;

// =============================================================================
// Database Configuration
// =============================================================================

const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Log pool errors
pool.on('error', (err) => {
    logger.error('Unexpected error on idle database client', {
        error: err.message,
        stack: err.stack
    });
});

// =============================================================================
// Drizzle Client
// =============================================================================

export const db = drizzle(pool, {
    schema: { ...schema, ...relations },
});

// =============================================================================
// Re-export Schema and Types
// =============================================================================

export * from './schema.js';

// =============================================================================
// Legacy Compatibility Exports
// =============================================================================

// Export pool for legacy db.ts compatibility during migration
export { pool };

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
    try {
        const result = await pool.query('SELECT NOW()');
        logger.info('Database connection successful', { timestamp: result.rows[0] });
        return true;
    } catch (error) {
        logger.error('Database connection failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}

/**
 * Close the pool (for testing/shutdown)
 */
export async function closeConnection(): Promise<void> {
    await pool.end();
    logger.info('Database pool closed');
}
