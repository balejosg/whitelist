/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Authentication Routes
 * Handles login, logout, refresh token, and registration
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';

// =============================================================================
// Types
// =============================================================================

interface RegisterBody {
    email: string;
    name: string;
    password: string;
}

interface LoginBody {
    email: string;
    password: string;
}

interface RefreshBody {
    refreshToken: string;
}

interface LogoutBody {
    refreshToken?: string;
}

// =============================================================================
// Rate Limiting
// =============================================================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: 'Too many login attempts, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        error: 'Too many registration attempts',
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
    return Boolean(password && password.length >= 8);
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

/**
 * POST /api/auth/register
 */
router.post('/register', registerLimiter, async (req: Request<object, unknown, RegisterBody>, res: Response) => {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email, name, and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid email format',
            code: 'INVALID_EMAIL'
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 8 characters',
            code: 'WEAK_PASSWORD'
        });
    }

    if (userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already registered',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        const user = await userStorage.createUser({ email, name, password });

        res.status(201).json({
            success: true,
            message: 'User registered. Please contact an administrator to activate your account.',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register user',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/auth/login
 */
router.post('/login', loginLimiter, async (req: Request<object, unknown, LoginBody>, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    try {
        const user = await userStorage.verifyPasswordByEmail(email, password);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Account is not active. Please contact an administrator.',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        const roles = roleStorage.getUserRoles(user.id);

        if (roles.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'No role assigned. Please contact an administrator.',
                code: 'NO_ROLE'
            });
        }

        const tokens = auth.generateTokens(user, roles);

        res.json({
            success: true,
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified,
                roles: roles.map((r) => ({
                    role: r.role,
                    groupIds: r.groupIds
                }))
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request<object, unknown, RefreshBody>, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            error: 'Refresh token is required',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = await auth.verifyRefreshToken(refreshToken);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token',
                code: 'INVALID_TOKEN'
            });
        }

        const user = userStorage.getUserById(decoded.sub);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }

        const roles = roleStorage.getUserRoles(user.id);
        const tokens = auth.generateTokens(user, roles);

        await auth.blacklistToken(refreshToken);

        return res.json({
            success: true,
            ...tokens
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        return res.status(500).json({
            success: false,
            error: 'Token refresh failed',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request<object, unknown, LogoutBody>, res: Response) => {
    const authHeader = req.headers.authorization;
    const { refreshToken } = req.body;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.slice(7);
        await auth.blacklistToken(accessToken);
    }

    if (refreshToken) {
        await auth.blacklistToken(refreshToken);
    }

    return res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * GET /api/auth/me
 */
router.get('/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

    const user = userStorage.getUserById(decoded.sub);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    const roles = roleStorage.getUserRoles(user.id);

    return res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            roles: roles.map((r) => ({
                id: r.id,
                role: r.role,
                groupIds: r.groupIds
            }))
        }
    });
});

export default router;
