/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Routes - First-time admin setup and registration token management
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import * as auth from '../lib/auth.js';
import logger from '../lib/logger.js';

// =============================================================================
// Types
// =============================================================================

interface FirstAdminBody {
    email: string;
    name: string;
    password: string;
}

interface ValidateTokenBody {
    token: string;
}

// =============================================================================
// Rate Limiting
// =============================================================================

// Status endpoint: 10 req/min per IP
const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// First admin creation: 3 req/hour per IP (strict to prevent brute force)
const firstAdminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        error: 'Too many setup attempts, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Token validation: 10 req/min per IP
const validateTokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many validation attempts, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// =============================================================================
// Validation Helpers
// =============================================================================

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
    return password !== undefined && password !== '' && password.length >= 8;
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

/**
 * GET /api/setup/status
 * Check if initial setup is needed (public, no auth required)
 */
router.get('/status', statusLimiter, (_req: Request, res: Response) => {
    const hasAdmin = roleStorage.hasAnyAdmins();

    return res.json({
        success: true,
        needsSetup: !hasAdmin,
        hasAdmin
    });
});

/**
 * POST /api/setup/first-admin
 * Create the first admin user (public, only works if no admins exist)
 */
router.post('/first-admin', firstAdminLimiter, async (req: Request<object, unknown, FirstAdminBody>, res: Response) => {
    const { email, name, password } = req.body;

    // Check if setup has already been completed
    if (roleStorage.hasAnyAdmins()) {
        return res.status(403).json({
            success: false,
            error: 'Setup already completed',
            code: 'SETUP_COMPLETE'
        });
    }

    // Validate required fields
    if (email === undefined || email === '' || name === undefined || name === '' || password === undefined || password === '') {
        return res.status(400).json({
            success: false,
            error: 'Email, name, and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    // Validate email format
    if (!isValidEmail(email)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid email format',
            code: 'INVALID_EMAIL'
        });
    }

    // Validate password strength
    if (!isValidPassword(password)) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 8 characters',
            code: 'WEAK_PASSWORD'
        });
    }

    // Check if email already exists
    if (userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already registered',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        // Create user
        const user = await userStorage.createUser({ email, name, password });

        // Assign admin role
        roleStorage.assignRole({
            userId: user.id,
            role: 'admin',
            groups: [],
            createdBy: user.id
        });

        // Generate registration token for client machines
        const registrationToken = setupStorage.generateRegistrationToken();

        // Save setup data
        setupStorage.saveSetupData({
            registrationToken,
            setupCompletedAt: new Date().toISOString(),
            setupByUserId: user.id
        });

        logger.info('First admin created', { userId: user.id, email });

        return res.status(201).json({
            success: true,
            registrationToken,
            redirectTo: '/login',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        logger.error('Error creating first admin', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({
            success: false,
            error: 'Failed to create admin user',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/setup/validate-token
 * Validate a registration token (used by client installers)
 */
router.post('/validate-token', validateTokenLimiter, (req: Request<object, unknown, ValidateTokenBody>, res: Response) => {
    const { token } = req.body;

    if (token === undefined || token === '') {
        return res.status(400).json({
            success: false,
            error: 'Token is required',
            code: 'MISSING_TOKEN'
        });
    }

    const isValid = setupStorage.validateRegistrationToken(token);

    return res.json({
        success: true,
        valid: isValid
    });
});

/**
 * GET /api/setup/registration-token
 * Get the current registration token (requires admin auth)
 */
router.get('/registration-token', async (req: Request, res: Response) => {
    // Verify admin authentication
    const authHeader = req.headers.authorization;

    if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required',
            code: 'MISSING_TOKEN'
        });
    }

    const token = authHeader.slice(7);
    const decoded = await auth.verifyAccessToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    // Check if user is admin
    if (!auth.isAdminToken(decoded)) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required',
            code: 'FORBIDDEN'
        });
    }

    const registrationToken = setupStorage.getRegistrationToken();

    if (registrationToken === null) {
        return res.status(404).json({
            success: false,
            error: 'Setup not completed',
            code: 'SETUP_NOT_COMPLETE'
        });
    }

    return res.json({
        success: true,
        registrationToken
    });
});

/**
 * POST /api/setup/regenerate-token
 * Regenerate the registration token (requires admin auth)
 */
router.post('/regenerate-token', async (req: Request, res: Response) => {
    // Verify admin authentication
    const authHeader = req.headers.authorization;

    if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required',
            code: 'MISSING_TOKEN'
        });
    }

    const token = authHeader.slice(7);
    const decoded = await auth.verifyAccessToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    // Check if user is admin
    if (!auth.isAdminToken(decoded)) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required',
            code: 'FORBIDDEN'
        });
    }

    const newToken = setupStorage.regenerateRegistrationToken();

    if (newToken === null) {
        return res.status(404).json({
            success: false,
            error: 'Setup not completed',
            code: 'SETUP_NOT_COMPLETE'
        });
    }

    logger.info('Registration token regenerated', { userId: decoded.sub });

    return res.json({
        success: true,
        registrationToken: newToken
    });
});

export default router;
