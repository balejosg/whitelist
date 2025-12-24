/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * AulaFocus Request API Server
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
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const pushRouter = require('./routes/push');
const classroomsRouter = require('./routes/classrooms');
const schedulesRouter = require('./routes/schedules');

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
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global rate limiter - protection against DDoS and abuse
// Individual routes may have stricter limits
const rateLimit = require('express-rate-limit');
const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.RATE_LIMIT_MAX || 200, // 200 requests per minute per IP
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'GLOBAL_RATE_LIMITED'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    skip: (req) => req.path === '/health' // Don't rate limit health checks
});
app.use(globalLimiter);

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
        adminToken: process.env.ADMIN_TOKEN ? 'configured' : 'not_configured',
        jwtSecret: process.env.JWT_SECRET ? 'configured' : 'using_random'
    };
    if (!process.env.ADMIN_TOKEN && !process.env.JWT_SECRET) {
        health.status = 'degraded';
    }
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
        name: 'AulaFocus Request API',
        version: '2.0.0',
        endpoints: {
            // Authentication
            'POST /api/auth/register': 'Register new user',
            'POST /api/auth/login': 'Login with email/password',
            'POST /api/auth/refresh': 'Refresh access token',
            'POST /api/auth/logout': 'Logout (invalidate tokens)',
            'GET /api/auth/me': 'Get current user info',
            // Users (admin only)
            'GET /api/users': 'List all users',
            'POST /api/users': 'Create user',
            'PATCH /api/users/:id': 'Update user',
            'DELETE /api/users/:id': 'Delete user',
            'GET /api/users/:id/roles': 'List user roles',
            'POST /api/users/:id/roles': 'Assign role to user',
            'DELETE /api/users/:id/roles/:roleId': 'Revoke role',
            // Requests
            'POST /api/requests': 'Submit a domain request (public)',
            'GET /api/requests/status/:id': 'Check request status (public)',
            'GET /api/requests': 'List all requests (admin/teacher)',
            'GET /api/requests/:id': 'Get request details (admin/teacher)',
            'POST /api/requests/:id/approve': 'Approve request (admin/teacher)',
            'POST /api/requests/:id/reject': 'Reject request (admin/teacher)',
            'DELETE /api/requests/:id': 'Delete request (admin)',
            'GET /api/requests/groups/list': 'List whitelist groups (admin/teacher)',
            'GET /api/requests/domains/blocked': 'List blocked domains (admin)',
            'POST /api/requests/domains/check': 'Check if domain is blocked (admin/teacher)',
            // Push Notifications
            'GET /api/push/vapid-key': 'Get VAPID public key (public)',
            'GET /api/push/status': 'Check push subscription status',
            'POST /api/push/subscribe': 'Register push subscription',
            'DELETE /api/push/subscribe': 'Remove push subscription',
            // Health Reports
            'POST /api/health-reports': 'Submit health report (shared secret)',
            'GET /api/health-reports': 'List all hosts status (admin)',
            'GET /api/health-reports/:hostname': 'Get host history (admin)',
            'GET /api/health-reports/alerts/active': 'Get active alerts (admin)',
            // Classrooms
            'GET /api/classrooms': 'List all classrooms (admin)',
            'POST /api/classrooms': 'Create classroom (admin)',
            'GET /api/classrooms/:id': 'Get classroom details (admin)',
            'PUT /api/classrooms/:id': 'Update classroom (admin)',
            'PUT /api/classrooms/:id/active-group': 'Set active group (admin)',
            'DELETE /api/classrooms/:id': 'Delete classroom (admin)',
            'POST /api/classrooms/machines/register': 'Register machine (shared secret)',
            'GET /api/classrooms/machines/:hostname/whitelist-url': 'Get whitelist URL (shared secret)',
            'DELETE /api/classrooms/machines/:hostname': 'Remove machine (admin)',
            // Schedules (Classroom Reservations)
            'GET /api/schedules/classroom/:id': 'Get classroom schedule (auth)',
            'GET /api/schedules/my': 'Get my reservations (auth)',
            'POST /api/schedules': 'Create reservation (teacher/admin)',
            'PUT /api/schedules/:id': 'Update reservation (owner/admin)',
            'DELETE /api/schedules/:id': 'Delete reservation (owner/admin)',
            'GET /api/schedules/classroom/:id/current': 'Get current active schedule (auth)'
        }
    });
});

// Authentication routes
app.use('/api/auth', authRouter);

// User management routes
app.use('/api/users', usersRouter);

// Request routes
app.use('/api/requests', requestsRouter);

// Health reports from student machines
app.use('/api/health-reports', healthReportsRouter);

// Push notifications
app.use('/api/push', pushRouter);

// Classroom management
app.use('/api/classrooms', classroomsRouter);

// Schedule reservations
app.use('/api/schedules', schedulesRouter);

// Serve SPA static files
app.use(express.static(path.join(__dirname, '../spa')));

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
        console.log('║       🛡️  AulaFocus Request API Server                ║');
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

