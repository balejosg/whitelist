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
import type { Request, Response, ErrorRequestHandler, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Structured logging with Winston
import logger from './lib/logger.js';

// Error tracking and request ID middleware
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';

import * as roleStorage from './lib/role-storage.js';
import * as userStorage from './lib/user-storage.js';
import * as setupStorage from './lib/setup-storage.js';
import * as auth from './lib/auth.js';
import * as classroomStorage from './lib/classroom-storage.js';
import * as healthReports from './lib/health-reports.js';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'trpc-batch-mode'],
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

// Basic health check for liveness probes
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'openpath-api' });
});

// =============================================================================
// Legacy/Compatibility REST Endpoints
// =============================================================================

function parseBearerToken(req: Request): string | null {
    const header = req.header('authorization');
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1] ?? null : null;
}

async function requireAdmin(req: Request, res: Response): Promise<auth.DecodedWithRoles | null> {
    const token = parseBearerToken(req);
    if (!token) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return null;
    }

    let decoded = await auth.verifyAccessToken(token);

    // Fallback to legacy admin token
    if (!decoded && process.env.ADMIN_TOKEN !== undefined && process.env.ADMIN_TOKEN !== '' && token === process.env.ADMIN_TOKEN) {
        decoded = auth.createLegacyAdminPayload();
    }

    if (!decoded || !auth.isAdminToken(decoded)) {
        res.status(401).json({ success: false, error: 'Invalid or missing admin token' });
        return null;
    }

    return decoded;
}

function requireSharedSecret(req: Request, res: Response): boolean {
    const secret = process.env.SHARED_SECRET;
    if (secret === undefined || secret === '') {
        return true; // If not set, allow (matching trpc logic)
    }

    const token = parseBearerToken(req);
    if (!token || token !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing shared secret' });
        return false;
    }

    return true;
}

function asyncRoute(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        void handler(req, res, next).catch(next);
    };
}

// Setup REST API (used by setup.html and existing clients)
app.get('/api/setup/status', asyncRoute(async (_req: Request, res: Response) => {
    const hasAdmin = await roleStorage.hasAnyAdmins();
    res.status(200).json({
        success: true,
        needsSetup: !hasAdmin,
        hasAdmin,
    });
}));

app.post('/api/setup/first-admin', asyncRoute(async (req: Request, res: Response) => {
    if (await roleStorage.hasAnyAdmins()) {
        res.status(403).json({ success: false, error: 'Setup already completed' });
        return;
    }

    const { email, name, password } = (req.body ?? {}) as { email?: unknown; name?: unknown; password?: unknown };

    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
    }

    if (!email.includes('@') || name.trim() === '' || password.length < 8) {
        res.status(400).json({ success: false, error: 'Invalid fields' });
        return;
    }

    if (await userStorage.emailExists(email)) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
    }

    const user = await userStorage.createUser({ email, name, password });
    await roleStorage.assignRole({
        userId: user.id,
        role: 'admin',
        groupIds: [],
        createdBy: user.id,
    });

    const registrationToken = setupStorage.generateRegistrationToken();
    await setupStorage.saveSetupData({
        registrationToken,
        setupCompletedAt: new Date().toISOString(),
        setupByUserId: user.id,
    });

    res.status(201).json({
        success: true,
        registrationToken,
        redirectTo: '/login',
        user: { id: user.id, email: user.email, name: user.name },
    });
}));

app.post('/api/setup/validate-token', asyncRoute(async (req: Request, res: Response) => {
    const { token } = (req.body ?? {}) as { token?: unknown };
    if (typeof token !== 'string' || token.trim() === '') {
        res.status(400).json({ success: false, error: 'Token required' });
        return;
    }
    res.status(200).json({ success: true, valid: await setupStorage.validateRegistrationToken(token) });
}));

app.get('/api/setup/registration-token', asyncRoute(async (req: Request, res: Response) => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;

    const token = await setupStorage.getRegistrationToken();
    if (!token) {
        res.status(404).json({ success: false, error: 'Setup not completed' });
        return;
    }
    res.status(200).json({ success: true, registrationToken: token });
}));
app.post('/api/setup/regenerate-token', asyncRoute(async (req: Request, res: Response) => {
    const decoded = await requireAdmin(req, res);
    if (!decoded) return;

    const token = await setupStorage.regenerateRegistrationToken();
    if (!token) {
        res.status(404).json({ success: false, error: 'Setup not completed' });
        return;
    }
    res.status(200).json({ success: true, registrationToken: token });
}));

// =============================================================================
// Classroom/Machine compatibility endpoints for Linux clients
// =============================================================================

app.post('/api/classrooms/machines/register', asyncRoute(async (req: Request, res: Response) => {
    if (!requireSharedSecret(req, res)) return;

    const { hostname, classroom_id, classroom_name, version } = (req.body ?? {}) as {
        hostname?: unknown;
        classroom_id?: unknown;
        classroom_name?: unknown;
        version?: unknown;
    };

    if (typeof hostname !== 'string' || hostname.trim() === '') {
        res.status(400).json({ success: false, error: 'Hostname required' });
        return;
    }

    let finalClassroomId = typeof classroom_id === 'string' ? classroom_id : undefined;

    if (!finalClassroomId && typeof classroom_name === 'string' && classroom_name !== '') {
        const classroom = await classroomStorage.getClassroomByName(classroom_name);
        if (classroom) finalClassroomId = classroom.id;
    }

    if (!finalClassroomId) {
        res.status(400).json({ success: false, error: 'Valid classroom_id or classroom_name is required' });
        return;
    }

    const machine = await classroomStorage.registerMachine({
        hostname,
        classroomId: finalClassroomId,
        ...(typeof version === 'string' ? { version } : {}),
    });

    res.status(200).json({ success: true, machine });
}));

app.get('/api/classrooms/machines/:hostname/whitelist-url', asyncRoute(async (req: Request, res: Response) => {
    if (!requireSharedSecret(req, res)) return;

    const hostname = req.params.hostname ?? '';
    if (hostname === '') {
        res.status(400).json({ success: false, error: 'Hostname required' });
        return;
    }
    await classroomStorage.updateMachineLastSeen(hostname);
    const result = await classroomStorage.getWhitelistUrlForMachine(hostname);

    if (!result) {
        res.status(404).json({ success: false, error: 'Machine not found or no group configured' });
        return;
    }

    res.status(200).json({ success: true, ...result });
}));
app.post('/api/health-reports', asyncRoute(async (req: Request, res: Response) => {
    if (!requireSharedSecret(req, res)) return;

    const { hostname, status, dnsmasqRunning, dnsResolving, failCount, actions, version } = (req.body ?? {}) as {
        hostname?: unknown;
        status?: unknown;
        dnsmasqRunning?: unknown;
        dnsResolving?: unknown;
        failCount?: unknown;
        actions?: unknown;
        version?: unknown;
    };

    if (typeof hostname !== 'string' || hostname.trim() === '') {
        res.status(400).json({ success: false, error: 'Hostname required' });
        return;
    }

    await healthReports.saveHealthReport(hostname, {
        status: typeof status === 'string' ? status : 'unknown',
        dnsmasqRunning: typeof dnsmasqRunning === 'boolean' ? dnsmasqRunning : null,
        dnsResolving: typeof dnsResolving === 'boolean' ? dnsResolving : null,
        failCount: typeof failCount === 'number' ? failCount : 0,
        actions: typeof actions === 'string' ? actions : '',
        version: typeof version === 'string' ? version : 'unknown',
    });

    res.status(200).json({ success: true, message: 'Health report received' });
}));
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

            console.log('');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║       🛡️  OpenPath Request API Server                 ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            console.log(`  🚀 Server is running on http://${HOST}:${String(PORT)}`);
            if (swaggerUi) {
                console.log(`  📜 API Documentation:  http://${HOST}:${String(PORT)}/docs`);
            }
            console.log(`  👉 Health Check:        http://${HOST}:${String(PORT)}/health`);
            console.log('─────────────────────────────────────────────────────────');
            console.log('');
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
