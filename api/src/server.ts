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
 * OpenPath Request API Server
 * 
 * Home server deployment for handling domain requests.
 * Runs on your local network, exposed via DuckDNS.
 * 
 * tRPC Routers (mounted at /trpc):
 *   auth        - Authentication (login, register, logout, refresh)
 *   users       - User management (admin only)
 *   requests    - Domain request handling
 *   classrooms  - Classroom/machine management
 *   schedules   - Schedule reservations
 *   push        - Push notification subscriptions
 *   healthReports - Client health reporting
 *   setup       - Initial setup endpoints
 *   healthcheck - Server health status
 * 
 * Other Endpoints:
 *   GET /health - Basic health check
 */

import express from 'express';
import type { Request, Response, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Structured logging with Winston
import { logger } from './lib/logger.js';

// Centralized configuration
import { config } from './config.js';

// Error tracking and request ID middleware
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';

import * as roleStorage from './lib/role-storage.js';
import * as userStorage from './lib/user-storage.js';
import { cleanupBlacklist } from './lib/auth.js';

// Swagger/OpenAPI (optional - only load if dependencies installed)
let swaggerUi: typeof import('swagger-ui-express') | undefined;
let getSwaggerSpec: (() => object) | undefined;

try {
    swaggerUi = await import('swagger-ui-express');
    const swaggerModule = await import('./lib/swagger.js');
    getSwaggerSpec = swaggerModule.getSwaggerSpec;
} catch {
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
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// =============================================================================
// CORS Configuration
// =============================================================================

const configCors = config.corsAllowedOrigins;
let corsOrigins = configCors;

// Security fix: Force safe default in production if CORS is set to wildcard
if (config.isProduction && configCors.includes('*')) {
    logger.warn('CORS_ORIGINS="*" in production - forcing safe default', {
        configured: '*',
        forced: 'https://balejosg.github.io'
    });
    corsOrigins = ['https://balejosg.github.io'];
}

app.use(cors({
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'trpc-batch-mode'],
    credentials: true
}));

// Global rate limiter (skipped in test environment for rapid test execution)
const globalLimiter = rateLimit({
    windowMs: config.globalRateLimitWindowMs,
    max: config.globalRateLimitMax,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'GLOBAL_RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || config.isTest
});
app.use(globalLimiter);

// Endpoint-specific rate limiters for sensitive operations
// Skip in test environment to allow rapid test execution

const authLimiter = rateLimit({
    windowMs: config.authRateLimitWindowMs,
    max: config.authRateLimitMax,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    skip: () => config.isTest
});

const publicRequestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5, // 5 domain requests per minute per IP
    message: {
        success: false,
        error: 'Too many domain requests, please try again later',
        code: 'REQUEST_RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    skip: () => config.isTest
});

// Apply auth rate limiter to auth endpoints
app.use('/trpc/auth.login', authLimiter);
app.use('/trpc/auth.register', authLimiter);

// Apply public request limiter to domain request creation
app.use('/trpc/requests.create', publicRequestLimiter);

// JSON body parser
app.use(express.json({ limit: '10kb' }));

// Request ID middleware
app.use(requestIdMiddleware);

// Request logging with Winston
app.use(logger.requestMiddleware);

// =============================================================================
// Routes
// =============================================================================

// Basic health check for liveness probes
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'openpath-api' });
});

// Swagger/OpenAPI documentation
if (swaggerUi && getSwaggerSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(), {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'OpenPath API Documentation'
    }));
    app.get('/api-docs.json', (_req: Request, res: Response): void => {
        res.setHeader('Content-Type', 'application/json');
        res.send(getSwaggerSpec());
    });
}

// tRPC Adapter
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';

app.use('/trpc', createExpressMiddleware({
    router: appRouter,
    createContext,
}));

// Serve SPA static files
const spaPath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '../../../spa')
    : path.join(__dirname, '../../spa');

app.use(express.static(spaPath));

// =============================================================================
// Error Handling
// =============================================================================

interface SyntaxErrorWithBody extends SyntaxError {
    status?: number;
    body?: unknown;
}

// JSON parsing error handler
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (err instanceof SyntaxError && (err as SyntaxErrorWithBody).status === 400 && 'body' in err) {
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
app.use((req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path
    });
});

// Global error handler
app.use(errorTrackingMiddleware);

// =============================================================================
// Start Server
// =============================================================================

let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000;

const gracefulShutdown = (signal: string): void => {
    if (isShuttingDown) {
        logger.warn(`Shutdown already in progress, ignoring ${signal}`);
        return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    const forceShutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    const finish = (exitCode: number): void => {
        clearTimeout(forceShutdownTimeout);
        process.exit(exitCode);
    };

    if (server === undefined) {
        logger.info('No active server instance to close');
        finish(0);
        return;
    }

    server.close((err) => {
        if (err) {
            logger.error('Error during server close', { error: err.message });
            finish(1);
            return;
        }
        logger.info('Server closed, no longer accepting connections');
        finish(0);
    });
};

// Start server when run directly
const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;

if (isMainModule) {
    const serverStartTime = new Date();
    server = app.listen(PORT, HOST, () => {
        void (async (): Promise<void> => {
            // SECURITY: Clean up expired blacklisted tokens on startup
            try {
                await cleanupBlacklist();
                logger.info('Token blacklist cleanup completed');
            } catch (error) {
                logger.warn('Token blacklist cleanup failed', { error: error instanceof Error ? error.message : String(error) });
            }

            logger.info('Server started', {
                host: HOST,
                port: String(PORT),
                env: process.env.NODE_ENV,
                apiId: process.env.API_ID,
                startup_time: {
                    start: serverStartTime.toISOString(),
                    elapsed_ms: String(Date.now() - serverStartTime.getTime())
                }
            });

            if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && !(await roleStorage.hasAnyAdmins())) {
                logger.info('Creating default admin user from environment variables...');
                try {
                    const admin = await userStorage.createUser({
                        email: process.env.ADMIN_EMAIL,
                        name: 'System Admin',
                        password: process.env.ADMIN_PASSWORD,
                    });

                    await roleStorage.assignRole({
                        userId: admin.id,
                        role: 'admin',
                        groupIds: [],
                    });
                    logger.info(`Default admin user created: ${admin.email}`);
                } catch (error) {
                    logger.error('Failed to create default admin user', { error: error instanceof Error ? error.message : String(error) });
                }
            }

            logger.info('');
            logger.info('╔═══════════════════════════════════════════════════════╗');
            logger.info('║       OpenPath Request API Server                     ║');
            logger.info('╚═══════════════════════════════════════════════════════╝');
            logger.info(`Server is running on http://${HOST}:${String(PORT)}`);
            if (swaggerUi) {
                logger.info(`API Documentation: http://${HOST}:${String(PORT)}/docs`);
            }
            logger.info(`Health Check: http://${HOST}:${String(PORT)}/health`);
            logger.info('─────────────────────────────────────────────────────────');
            logger.info('');
        })();
    });
    if (process.env.ADMIN_TOKEN === undefined || process.env.ADMIN_TOKEN === '') {
        logger.warn('ADMIN_TOKEN not set - admin endpoints will fail');
    }
    if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
        logger.warn('GITHUB_TOKEN not set - approval will fail to push to GitHub');
    }

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
