/**
 * Whitelist Request API Server
 * 
 * Home server deployment for handling domain requests.
 * Runs on your local network, exposed via DuckDNS.
 * 
 * Endpoints:
 *   POST /api/requests         - Submit domain request (public)
 *   GET  /api/requests         - List all requests (admin)
 *   POST /api/requests/:id/approve - Approve request (admin)
 *   POST /api/requests/:id/reject  - Reject request (admin)
 *   GET  /health               - Health check
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

const requestsRouter = require('./routes/requests');
const healthReportsRouter = require('./routes/health-reports');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// =============================================================================
// Middleware
// =============================================================================

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS || '*';
app.use(cors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON body parser
app.use(express.json({ limit: '10kb' }));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// =============================================================================
// Routes
// =============================================================================

// Health check endpoint - enhanced with component checks
app.get('/health', async (req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'ok',
        service: 'whitelist-request-api',
        version: '1.0.4',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Check storage health
    try {
        const storage = require('./lib/storage');
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

    // Check GitHub configuration
    health.checks.github = {
        status: process.env.GITHUB_TOKEN ? 'configured' : 'not_configured',
        owner: process.env.GITHUB_OWNER ? 'set' : 'missing',
        repo: process.env.GITHUB_REPO ? 'set' : 'missing'
    };
    if (!process.env.GITHUB_TOKEN) {
        health.status = 'degraded';
    }

    // Check admin configuration
    health.checks.auth = {
        adminToken: process.env.ADMIN_TOKEN ? 'configured' : 'not_configured'
    };
    if (!process.env.ADMIN_TOKEN) {
        health.status = 'degraded';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    health.system = {
        memory: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
        },
        nodeVersion: process.version
    };

    // Response time
    health.responseTime = Date.now() - startTime + 'ms';

    // Set appropriate status code
    const statusCode = health.status === 'ok' ? 200 :
        health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Whitelist Request API',
        version: '1.0.0',
        endpoints: {
            'POST /api/requests': 'Submit a domain request (public)',
            'GET /api/requests/status/:id': 'Check request status (public)',
            'GET /api/requests': 'List all requests (admin)',
            'GET /api/requests/:id': 'Get request details (admin)',
            'POST /api/requests/:id/approve': 'Approve request (admin)',
            'POST /api/requests/:id/reject': 'Reject request (admin)',
            'DELETE /api/requests/:id': 'Delete request (admin)',
            'GET /api/requests/groups/list': 'List whitelist groups (admin)',
            'POST /api/health-reports': 'Submit health report (shared secret)',
            'GET /api/health-reports': 'List all hosts status (admin)',
            'GET /api/health-reports/:hostname': 'Get host history (admin)',
            'GET /api/health-reports/alerts/active': 'Get active alerts (admin)'
        }
    });
});

// Request routes
app.use('/api/requests', requestsRouter);

// Health reports from student machines
app.use('/api/health-reports', healthReportsRouter);

// =============================================================================
// Error Handling
// =============================================================================

// JSON parsing error handler (must come before other error handlers)
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        // Malformed JSON
        return res.status(400).json({
            success: false,
            error: 'Invalid JSON in request body',
            code: 'INVALID_JSON'
        });
    }
    next(err);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message || err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// =============================================================================
// Start Server
// =============================================================================

// Only start server if this file is run directly (not required)
let server;
if (require.main === module) {
    server = app.listen(PORT, HOST, () => {
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║       🛡️  Whitelist Request API Server                ║');
        console.log('╠═══════════════════════════════════════════════════════╣');
        console.log(`║  Running on: http://${HOST}:${PORT}                      ║`);
        console.log('║  Health:     /health                                  ║');
        console.log('║  API Docs:   /api                                     ║');
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');

        // Check configuration
        if (!process.env.ADMIN_TOKEN) {
            console.warn('⚠️  WARNING: ADMIN_TOKEN not set. Admin endpoints will fail.');
        }
        if (!process.env.GITHUB_TOKEN) {
            console.warn('⚠️  WARNING: GITHUB_TOKEN not set. Approval will fail to push to GitHub.');
        }
    });
}

// Export both app and server for testing
module.exports = { app, server };

