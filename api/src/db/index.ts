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
 * Initialize database schema - creates tables if they don't exist.
 * Safe to call on every startup.
 */
export async function initializeSchema(): Promise<boolean> {
    try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');

        const __dirname = path.dirname(fileURLToPath(import.meta.url));

        // Try to find schema.sql in multiple locations
        const possiblePaths = [
            path.join(__dirname, 'schema.sql'),           // In dist/src/db/
            path.join(__dirname, '..', 'db', 'schema.sql'), // In dist/src/../db/
            path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'), // In dist/../src/db/
        ];

        let schemaPath: string | null = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                schemaPath = p;
                break;
            }
        }

        if (!schemaPath) {
            logger.warn('schema.sql not found, skipping schema initialization', {
                searchedPaths: possiblePaths
            });
            return false;
        }

        const schema = fs.readFileSync(schemaPath, 'utf-8');
        await pool.query(schema);
        logger.info('Database schema initialized successfully');
        return true;
    } catch (error) {
        logger.error('Failed to initialize database schema', {
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
