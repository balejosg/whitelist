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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
// Structured logging with Winston
import logger from './lib/logger.js';
// Route handlers
import setupRouter from './routes/setup.js';
import requestsRouter from './routes/requests.js';
import healthReportsRouter from './routes/health-reports.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import pushRouter from './routes/push.js';
import classroomsRouter from './routes/classrooms.js';
import schedulesRouter from './routes/schedules.js';
import healthcheckRouter from './routes/healthcheck.js';
// Error tracking and request ID middleware
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';
// Swagger/OpenAPI (optional - only load if dependencies installed)
let swaggerUi;
let getSwaggerSpec;
try {
    swaggerUi = await import('swagger-ui-express');
    const swaggerModule = await import('./lib/swagger.js');
    getSwaggerSpec = swaggerModule.getSwaggerSpec;
}
catch {
    // Swagger dependencies not installed - skip
}
// ES module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
// =============================================================================
// Security Middleware
// =============================================================================
// Helmet - Security headers (OWASP recommended)
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
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
// =============================================================================
// CORS Configuration
// =============================================================================
const DEFAULT_CORS_ORIGINS = process.env.NODE_ENV === 'production'
    ? 'https://balejosg.github.io'
    : 'http://localhost:3000,http://localhost:5500,http://127.0.0.1:3000';
const corsOrigins = process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS;
if (corsOrigins === '*' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  SECURITY WARNING: CORS_ORIGINS is set to "*" in production.');
}
app.use(cors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
// Global rate limiter
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '200', 10),
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'GLOBAL_RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health'
});
app.use(globalLimiter);
// JSON body parser
app.use(express.json({ limit: '10kb' }));
// Request ID middleware
app.use(requestIdMiddleware);
// Request logging with Winston
app.use(logger.requestMiddleware);
// =============================================================================
// Routes
// =============================================================================
// Health check endpoints
app.use('/health', healthcheckRouter);
// Swagger/OpenAPI documentation
if (swaggerUi && getSwaggerSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(), {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'OpenPath API Documentation'
    }));
    app.get('/api-docs.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(getSwaggerSpec());
    });
}
// API info endpoint
app.get('/api', (_req, res) => {
    res.json({
        name: 'AulaFocus Request API',
        version: '2.0.0',
        endpoints: {
            'GET /api/setup/status': 'Check if initial setup is needed (public)',
            'POST /api/setup/first-admin': 'Create first admin user (public)',
            'GET /api/setup/registration-token': 'Get registration token (admin)',
            'POST /api/setup/regenerate-token': 'Regenerate registration token (admin)',
            'POST /api/setup/validate-token': 'Validate registration token (public)',
            'POST /api/auth/register': 'Register new user',
            'POST /api/auth/login': 'Login with email/password',
            'POST /api/auth/refresh': 'Refresh access token',
            'POST /api/auth/logout': 'Logout (invalidate tokens)',
            'GET /api/auth/me': 'Get current user info',
            'GET /api/users': 'List all users',
            'POST /api/users': 'Create user',
            'PATCH /api/users/:id': 'Update user',
            'DELETE /api/users/:id': 'Delete user',
            'POST /api/requests': 'Submit a domain request (public)',
            'GET /api/requests/status/:id': 'Check request status (public)',
            'GET /api/requests': 'List all requests (admin/teacher)',
            'POST /api/requests/:id/approve': 'Approve request (admin/teacher)',
            'POST /api/requests/:id/reject': 'Reject request (admin/teacher)',
            'GET /api/push/vapid-key': 'Get VAPID public key (public)',
            'POST /api/push/subscribe': 'Register push subscription',
            'POST /api/health-reports': 'Submit health report (shared secret)',
            'GET /api/health-reports': 'List all hosts status (admin)',
            'GET /api/classrooms': 'List all classrooms (admin)',
            'POST /api/classrooms': 'Create classroom (admin)',
            'GET /api/schedules/classroom/:id': 'Get classroom schedule (auth)',
            'POST /api/schedules': 'Create reservation (teacher/admin)'
        }
    });
});
// Setup routes (before auth - must be accessible without authentication)
app.use('/api/setup', setupRouter);
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
// tRPC Adapter
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';
app.use('/trpc', createExpressMiddleware({
    router: appRouter,
    createContext,
}));
// Serve SPA static files
app.use(express.static(path.join(__dirname, '../../spa')));
// JSON parsing error handler
const jsonErrorHandler = (err, _req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        res.status(400).json({
            success: false,
            error: 'Invalid JSON in request body',
            code: 'INVALID_JSON'
        });
        return;
    }
    next(err);
};
app.use(jsonErrorHandler);
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});
// Global error handler
app.use(errorTrackingMiddleware);
// =============================================================================
// Start Server
// =============================================================================
let server;
let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000;
const gracefulShutdown = (signal) => {
    if (isShuttingDown) {
        logger.warn(`Shutdown already in progress, ignoring ${signal}`);
        return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    if (server !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        server.close((err) => {
            if (err) {
                logger.error('Error during server close', { error: err.message });
                process.exit(1);
            }
            logger.info('Server closed, no longer accepting connections');
        });
    }
    const forceShutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    logger.info('Graceful shutdown completed successfully');
    clearTimeout(forceShutdownTimeout);
    process.exit(0);
};
// Start server when run directly
const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
    server = app.listen(PORT, HOST, () => {
        logger.info('Server started', {
            host: HOST,
            port: PORT,
            env: process.env.NODE_ENV ?? 'development',
            endpoints: {
                health: '/health',
                api: '/api',
                docs: '/api-docs'
            }
        });
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║       🛡️  OpenPath Request API Server                 ║');
        console.log('╠═══════════════════════════════════════════════════════╣');
        console.log(`║  Running on: http://${HOST}:${String(PORT)}                      ║`);
        console.log('║  Health:     /health                                  ║');
        console.log('║  API Docs:   /api-docs                                ║');
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');
        if (process.env.ADMIN_TOKEN === undefined || process.env.ADMIN_TOKEN === '') {
            logger.warn('ADMIN_TOKEN not set - admin endpoints will fail');
        }
        if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
            logger.warn('GITHUB_TOKEN not set - approval will fail to push to GitHub');
        }
    });
    process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
    process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception', {
            error: err.message,
            stack: err.stack
        });
        gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled rejection', {
            reason: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined
        });
    });
}
// Export for testing
export { app, server };
//# sourceMappingURL=server.js.map