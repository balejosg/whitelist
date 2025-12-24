/**
 * Healthcheck Routes
 * 
 * Kubernetes-style health probes:
 * - /health/live  - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can the service handle requests?)
 * 
 * @swagger
 * tags:
 *   name: Health
 *   description: Health and readiness checks
 */

const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     description: Returns 200 if the process is running. Used by orchestrators to detect crashes.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: alive
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/live', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Returns 200 if service can handle requests. Checks storage and configuration.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: Service not ready
 */
router.get('/ready', async (req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'ready',
        service: 'openpath-api',
        version: '2.0.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Check 1: Storage health
    try {
        const storage = require('../lib/storage');
        const stats = storage.getStats();
        health.checks.storage = {
            status: 'ok',
            totalRequests: stats.total,
            pendingRequests: stats.pending
        };
    } catch (error) {
        health.checks.storage = {
            status: 'error',
            error: error.message
        };
        health.status = 'degraded';
    }

    // Check 2: GitHub configuration
    const githubConfigured = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);
    health.checks.github = {
        status: githubConfigured ? 'configured' : 'not_configured',
        details: {
            token: process.env.GITHUB_TOKEN ? 'set' : 'missing',
            owner: process.env.GITHUB_OWNER ? 'set' : 'missing',
            repo: process.env.GITHUB_REPO ? 'set' : 'missing'
        }
    };

    // Check 3: Auth configuration
    const authConfigured = !!(process.env.ADMIN_TOKEN || process.env.JWT_SECRET);
    health.checks.auth = {
        status: authConfigured ? 'configured' : 'not_configured',
        details: {
            adminToken: process.env.ADMIN_TOKEN ? 'set' : 'missing',
            jwtSecret: process.env.JWT_SECRET ? 'set' : 'using_random'
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
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        heapPercent: `${heapPercent}%`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
    };

    // Response time
    health.responseTime = `${Date.now() - startTime}ms`;

    // Set appropriate status code
    const statusCode = health.status === 'ready' ? 200 :
        health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check (alias for /health/ready)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service health status
 */
router.get('/', (req, res) => {
    // Redirect to ready endpoint for backwards compatibility
    res.redirect('/health/ready');
});

module.exports = router;
