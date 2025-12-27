/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Routes - Initial admin setup and registration token management
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import logger from '../lib/logger.js';
import * as roleStorage from '../lib/role-storage.js';
import * as userStorage from '../lib/user-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import * as auth from '../lib/auth.js';
import type { DecodedWithRoles } from '../lib/auth.js';

const router = express.Router();

// =============================================================================
// Types
// =============================================================================

interface RequestWithUser extends Request {
    user?: DecodedWithRoles;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Authentication middleware
 */
function requireAuth(req: RequestWithUser, res: Response, next: NextFunction): void {
    void (async (): Promise<void> => {
        const authHeader = req.headers.authorization;

        if (authHeader?.startsWith('Bearer ') !== true) {
            res.status(401).json({
                success: false,
                error: 'Authorization header required',
                code: 'MISSING_TOKEN'
            });
            return;
        }

        const token = authHeader.slice(7);

        const decoded = await auth.verifyAccessToken(token);
        if (decoded !== null) {
            req.user = decoded;
            next();
            return;
        }

        // Fall back to legacy admin token
        const adminToken = process.env.ADMIN_TOKEN;
        if (adminToken !== undefined && adminToken !== '' && token === adminToken) {
            req.user = auth.createLegacyAdminPayload();
            next();
            return;
        }

        res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    })().catch(next);
}

/**
 * Admin authorization middleware
 */
function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction): void {
    if (!auth.isAdminToken(req.user)) {
        res.status(403).json({
            success: false,
            error: 'Admin access required',
            code: 'FORBIDDEN'
        });
        return;
    }
    next();
}

// =============================================================================
// Rate Limiters
// =============================================================================

// Strict rate limit for first-admin endpoint (3 requests per hour)
const firstAdminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        success: false,
        error: 'Too many setup attempts from this IP, please try again later',
        code: 'SETUP_RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Standard rate limit for status and validate endpoints (10 requests per minute)
const setupLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// =============================================================================
// Types
// =============================================================================

interface FirstAdminRequest {
    email: string;
    name: string;
    password: string;
}

interface ValidateTokenRequest {
    token: string;
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/setup/status
 * Check if system needs initial setup
 * Public endpoint (no authentication required)
 */
router.get('/status', setupLimiter, (_req: Request, res: Response) => {
    try {
        const hasAdmin = roleStorage.hasAnyAdmins();

        res.json({
            needsSetup: !hasAdmin,
            hasAdmin: hasAdmin
        });
    } catch (error) {
        logger.error('Error checking setup status', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to check setup status'
        });
    }
});

/**
 * POST /api/setup/first-admin
 * Create the first admin user and generate registration token
 * Public endpoint (no authentication required)
 */
router.post('/first-admin', firstAdminLimiter, (req: Request, res: Response, next: NextFunction) => {
    void (async (): Promise<void> => {
        try {
            const { email, name, password } = req.body as Partial<FirstAdminRequest>;

            // Validate required fields
            if (email === undefined || email === '' || name === undefined || name === '' || password === undefined || password === '') {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: email, name, password'
                });
                return;
            }

            // Check if setup is already complete
            if (roleStorage.hasAnyAdmins()) {
                res.status(403).json({
                    success: false,
                    error: 'Setup already completed'
                });
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
                return;
            }

            // Validate password length
            if (password.length < 8) {
                res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters long'
                });
                return;
            }

            // Check if email already exists
            if (userStorage.emailExists(email)) {
                res.status(400).json({
                    success: false,
                    error: 'Email already registered'
                });
                return;
            }

            // Create user
            const user = await userStorage.createUser({ email, name, password });

            // Assign admin role
            roleStorage.assignRole({
                userId: user.id,
                role: 'admin',
                groups: [],
                createdBy: user.id
            });

            // Generate registration token
            const registrationToken = crypto.randomBytes(32).toString('hex');

            // Save setup data
            setupStorage.saveSetupData({
                registrationToken,
                setupCompletedAt: new Date().toISOString(),
                setupByUserId: user.id
            });

            // Log the event
            logger.info('First admin created', { userId: user.id, email: user.email });

            res.status(201).json({
                success: true,
                registrationToken,
                redirectTo: '/login'
            });
        } catch (error) {
            logger.error('Error creating first admin', { error });
            res.status(500).json({
                success: false,
                error: 'Failed to create admin user'
            });
        }
    })().catch(next);
});

/**
 * GET /api/setup/registration-token
 * Get the current registration token
 * Requires admin authentication
 */
router.get('/registration-token', requireAuth, requireAdmin, (_req: RequestWithUser, res: Response) => {
    try {
        const token = setupStorage.getRegistrationToken();

        if (token === null) {
            res.status(404).json({
                success: false,
                error: 'Setup not complete'
            });
            return;
        }

        res.json({
            registrationToken: token
        });
    } catch (error) {
        logger.error('Error getting registration token', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to get registration token'
        });
    }
});

/**
 * POST /api/setup/regenerate-token
 * Generate a new registration token
 * Requires admin authentication
 */
router.post('/regenerate-token', requireAuth, requireAdmin, (req: RequestWithUser, res: Response) => {
    try {
        const newToken = setupStorage.regenerateRegistrationToken();

        // Log the regeneration event
        const userId = req.user?.sub ?? 'unknown';
        logger.info('Registration token regenerated', { userId });

        res.json({
            registrationToken: newToken
        });
    } catch (error) {
        logger.error('Error regenerating registration token', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate token'
        });
    }
});

/**
 * POST /api/setup/validate-token
 * Validate a registration token
 * Public endpoint (used by client installations)
 */
router.post('/validate-token', setupLimiter, (req: Request, res: Response) => {
    try {
        const { token } = req.body as Partial<ValidateTokenRequest>;

        if (token === undefined || token === '') {
            res.status(400).json({
                success: false,
                error: 'Token is required',
                valid: false
            });
            return;
        }

        const validToken = setupStorage.getRegistrationToken();

        if (validToken === null) {
            res.status(404).json({
                success: false,
                error: 'Setup not complete',
                valid: false
            });
            return;
        }

        // Use timing-safe comparison to prevent timing attacks
        const tokenBuffer = Buffer.from(token);
        const validTokenBuffer = Buffer.from(validToken);

        // Ensure both buffers are the same length for comparison
        if (tokenBuffer.length !== validTokenBuffer.length) {
            res.json({
                valid: false
            });
            return;
        }

        const isValid = crypto.timingSafeEqual(tokenBuffer, validTokenBuffer);

        res.json({
            valid: isValid
        });
    } catch (error) {
        logger.error('Error validating token', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to validate token'
        });
    }
});

export default router;
