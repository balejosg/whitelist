/**
 * Healthcheck Routes
 *
 * Kubernetes-style health probes:
 * - /health/live  - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can the service handle requests?)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as storage from '../lib/storage.js';

// =============================================================================
// Types
// =============================================================================

interface HealthCheck {
    status: 'ok' | 'degraded' | 'error';
    service: string;
    version: string;
    uptime: number;
    timestamp: string;
    checks: {
        storage?: {
            status: string;
            totalRequests?: number;
            pendingRequests?: number;
            error?: string;
        };
        github?: {
            status: string;
            details: {
                token: string;
                owner: string;
                repo: string;
            };
        };
        auth?: {
            status: string;
            details: {
                adminToken: string;
                jwtSecret: string;
            };
        };
        memory?: {
            status: string;
            heapUsed: string;
            heapTotal: string;
            heapPercent: string;
            rss: string;
        };
    };
    responseTime?: string;
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

/**
 * GET /health/live
 * Liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /health/ready
 * Readiness probe
 */
router.get('/ready', (_req: Request, res: Response) => {
    const startTime = Date.now();
    const health: HealthCheck = {
        status: 'ok',
        service: 'openpath-api',
        version: '2.0.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Check 1: Storage health
    try {
        const stats = storage.getStats();
        health.checks.storage = {
            status: 'ok',
            totalRequests: stats.total,
            pendingRequests: stats.pending
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        health.checks.storage = {
            status: 'error',
            error: message
        };
        health.status = 'degraded';
    }

    // Check 2: GitHub configuration
    const githubConfigured = (
        process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN !== '' &&
        process.env.GITHUB_OWNER !== undefined && process.env.GITHUB_OWNER !== '' &&
        process.env.GITHUB_REPO !== undefined && process.env.GITHUB_REPO !== ''
    );
    health.checks.github = {
        status: githubConfigured ? 'configured' : 'not_configured',
        details: {
            token: (process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN !== '') ? 'set' : 'missing',
            owner: (process.env.GITHUB_OWNER !== undefined && process.env.GITHUB_OWNER !== '') ? 'set' : 'missing',
            repo: (process.env.GITHUB_REPO !== undefined && process.env.GITHUB_REPO !== '') ? 'set' : 'missing'
        }
    };

    // Check 3: Auth configuration
    const authConfigured = ((process.env.ADMIN_TOKEN !== undefined && process.env.ADMIN_TOKEN !== '') || (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== ''));
    health.checks.auth = {
        status: authConfigured ? 'configured' : 'not_configured',
        details: {
            adminToken: (process.env.ADMIN_TOKEN !== undefined && process.env.ADMIN_TOKEN !== '') ? 'set' : 'missing',
            jwtSecret: (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '') ? 'set' : 'using_random'
        }
    };
    if (!authConfigured) {
        health.status = 'degraded';
    }

    // Check 4: Memory usage
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapPercent = Math.round((heapUsedMB / heapTotalMB) * 100);

    health.checks.memory = {
        status: heapPercent < 90 ? 'ok' : 'warning',
        heapUsed: `${String(heapUsedMB)}MB`,
        heapTotal: `${String(heapTotalMB)}MB`,
        heapPercent: `${String(heapPercent)}%`,
        rss: `${String(Math.round(memUsage.rss / 1024 / 1024))}MB`
    };

    health.responseTime = `${String(Date.now() - startTime)}ms`;

    const statusCode = health.status === 'ok' ? 200 :
        health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
});

/**
 * GET /health
 * Alias for /health/ready
 */
router.get('/', (_req: Request, res: Response) => {
    res.redirect('/health/ready');
});

export default router;
