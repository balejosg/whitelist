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

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Structured logging with Winston
import logger from './dist/lib/logger.js';

import requestsRouter from './dist/routes/requests.js';
import healthReportsRouter from './dist/routes/health-reports.js';
import authRouter from './dist/routes/auth.js';
import usersRouter from './dist/routes/users.js';
import pushRouter from './dist/routes/push.js';
import classroomsRouter from './dist/routes/classrooms.js';
import schedulesRouter from './dist/routes/schedules.js';
import healthcheckRouter from './dist/routes/healthcheck.js';

// Error tracking and request ID middleware
import { requestIdMiddleware, errorTrackingMiddleware } from './dist/lib/error-tracking.js';

// Swagger/OpenAPI (optional - only load if dependencies installed)
let swaggerUi;
let getSwaggerSpec;
try {
    swaggerUi = (await import('swagger-ui-express')).default;
    getSwaggerSpec = (await import('./dist/lib/swagger.js')).getSwaggerSpec;
} catch {
    // Swagger dependencies not installed - skip
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// =============================================================================
// Security Middleware
// =============================================================================

// Helmet - Security headers (OWASP recommended)
// Adds: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
//       Strict-Transport-Security, Content-Security-Policy, etc.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.github.com']
        }
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for Swagger UI
    crossOriginResourcePolicy: { policy: 'cross-origin' } // Allow cross-origin for API
}));

// =============================================================================
// CORS Configuration
// =============================================================================

// CORS configuration - SECURITY: Default to restrictive origins in production
// Set CORS_ORIGINS env var to comma-separated list of allowed origins
// Example: CORS_ORIGINS=https://myapp.com,https://admin.myapp.com
const DEFAULT_CORS_ORIGINS = process.env.NODE_ENV === 'production'
    ? 'https://balejosg.github.io'  // Default to GitHub Pages in production
    : 'http://localhost:3000,http://localhost:5500,http://127.0.0.1:3000';

const corsOrigins = process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS;

// Warn if using wildcard CORS in production
if (corsOrigins === '*' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  SECURITY WARNING: CORS_ORIGINS is set to "*" in production. This allows requests from any origin.');
}

app.use(cors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true  // Allow cookies for authenticated requests
}));

// Global rate limiter - protection against DDoS and abuse
// Individual routes may have stricter limits
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

// Request ID middleware (adds X-Request-ID header)
app.use(requestIdMiddleware);

// Request logging with Winston (structured logging)
app.use(logger.requestMiddleware);

// =============================================================================
// Routes
// =============================================================================

// Health check endpoints (liveness/readiness probes)
app.use('/health', healthcheckRouter);

// Swagger/OpenAPI documentation (if dependencies installed)
if (swaggerUi && getSwaggerSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(), {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'OpenPath API Documentation'
    }));
    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(getSwaggerSpec());
    });
}

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

// Global error handler with structured logging
app.use(errorTrackingMiddleware);

// =============================================================================
// Start Server
// =============================================================================

// Only start server if this file is run directly (not imported)
let server;

// =============================================================================
// Graceful Shutdown (defined at module level for ESLint compliance)
// =============================================================================

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds max for graceful shutdown

/**
 * Gracefully shutdown the server on termination signals
 * @param {string} signal - The signal that triggered shutdown
 */
const gracefulShutdown = (signal) => {
    if (isShuttingDown) {
        logger.warn(`Shutdown already in progress, ignoring ${signal}`);
        return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
        server.close((err) => {
            if (err) {
                logger.error('Error during server close', { error: err.message });
                process.exit(1);
            }
            logger.info('Server closed, no longer accepting connections');
        });
    }

    // Set a timeout to force shutdown if graceful shutdown takes too long
    const forceShutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    // Clean up any resources (add database/redis cleanup here if needed)
    // Promise.all([db.close(), redis.quit()]).then(...)

    logger.info('Graceful shutdown completed successfully');
    clearTimeout(forceShutdownTimeout);
    process.exit(0);
};

// Check if this is the main module (ESM equivalent of require.main === module)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
    server = app.listen(PORT, HOST, () => {
        logger.info('Server started', {
            host: HOST,
            port: PORT,
            env: process.env.NODE_ENV || 'development',
            endpoints: {
                health: '/health',
                api: '/api',
                docs: '/api-docs'
            }
        });

        // Log startup banner
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║       🛡️  OpenPath Request API Server                 ║');
        console.log('╠═══════════════════════════════════════════════════════╣');
        console.log(`║  Running on: http://${HOST}:${PORT}                      ║`);
        console.log('║  Health:     /health                                  ║');
        console.log('║  API Docs:   /api-docs                                ║');
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');

        // Check configuration
        if (!process.env.ADMIN_TOKEN) {
            logger.warn('ADMIN_TOKEN not set - admin endpoints will fail');
        }
        if (!process.env.GITHUB_TOKEN) {
            logger.warn('GITHUB_TOKEN not set - approval will fail to push to GitHub');
        }
    });

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception', {
            error: err.message,
            stack: err.stack
        });
        gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, _promise) => {
        logger.error('Unhandled rejection', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : undefined
        });
        // Log but don't shutdown for unhandled rejections
        // as they may not be fatal
    });
}

// Export both app and server for testing (ESM exports)
export { app, server };
