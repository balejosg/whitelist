/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Authentication Routes
 * Handles login, logout, refresh token, and registration
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';
// =============================================================================
// Middleware
// =============================================================================
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
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidPassword(password) {
    return password.length >= 8;
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * POST /api/auth/register
 */
router.post('/register', registerLimiter, (req, res, next) => {
    void (async () => {
        const body = req.body;
        const email = body.email;
        const name = body.name;
        const password = body.password;
        if (email === undefined || email === '' ||
            name === undefined || name === '' ||
            password === undefined || password === '') {
            res.status(400).json({
                success: false,
                error: 'Email, name, and password are required',
                code: 'MISSING_FIELDS'
            });
            return;
        }
        if (!isValidEmail(email)) {
            res.status(400).json({
                success: false,
                error: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
            return;
        }
        if (!isValidPassword(password)) {
            res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters',
                code: 'WEAK_PASSWORD'
            });
            return;
        }
        if (userStorage.emailExists(email)) {
            res.status(409).json({
                success: false,
                error: 'Email already registered',
                code: 'EMAIL_EXISTS'
            });
            return;
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
        }
        catch (error) {
            console.error('Error registering user:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to register user',
                code: 'SERVER_ERROR'
            });
        }
    })().catch(next);
});
/**
 * POST /api/auth/login
 */
router.post('/login', loginLimiter, (req, res, next) => {
    void (async () => {
        const { email, password } = req.body;
        if (email.length === 0 || password.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Email and password are required',
                code: 'MISSING_FIELDS'
            });
            return;
        }
        try {
            const user = await userStorage.verifyPasswordByEmail(email, password);
            if (user === null) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS'
                });
                return;
            }
            if (!user.isActive) {
                res.status(403).json({
                    success: false,
                    error: 'Account is not active. Please contact an administrator.',
                    code: 'ACCOUNT_INACTIVE'
                });
                return;
            }
            const roles = roleStorage.getUserRoles(user.id);
            if (roles.length === 0) {
                res.status(403).json({
                    success: false,
                    error: 'No role assigned. Please contact an administrator.',
                    code: 'NO_ROLE'
                });
                return;
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
        }
        catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({
                success: false,
                error: 'Login failed',
                code: 'SERVER_ERROR'
            });
        }
    })().catch(next);
});
/**
 * POST /api/auth/refresh
 */
router.post('/refresh', (req, res, next) => {
    void (async () => {
        const { refreshToken } = req.body;
        if (refreshToken.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Refresh token is required',
                code: 'MISSING_TOKEN'
            });
            return;
        }
        try {
            const decoded = await auth.verifyRefreshToken(refreshToken);
            if (!decoded) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid or expired refresh token',
                    code: 'INVALID_TOKEN'
                });
                return;
            }
            const user = userStorage.getUserById(decoded.sub);
            if (user === null || user.isActive === false) {
                res.status(401).json({
                    success: false,
                    error: 'User not found or inactive',
                    code: 'USER_NOT_FOUND'
                });
                return;
            }
            const roles = roleStorage.getUserRoles(user.id);
            const tokens = auth.generateTokens(user, roles);
            await auth.blacklistToken(refreshToken);
            res.json({
                success: true,
                ...tokens
            });
        }
        catch (error) {
            console.error('Error refreshing token:', error);
            res.status(500).json({
                success: false,
                error: 'Token refresh failed',
                code: 'SERVER_ERROR'
            });
        }
    })().catch(next);
});
/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res, next) => {
    void (async () => {
        const authHeader = req.headers.authorization;
        const { refreshToken } = req.body;
        if (authHeader?.startsWith('Bearer ') === true) {
            const accessToken = authHeader.slice(7);
            await auth.blacklistToken(accessToken);
        }
        if (refreshToken !== undefined && refreshToken.length > 0) {
            await auth.blacklistToken(refreshToken);
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    })().catch(next);
});
/**
 * GET /api/auth/me
 */
router.get('/me', (req, res, next) => {
    void (async () => {
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
        if (!decoded) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
            return;
        }
        const user = userStorage.getUserById(decoded.sub);
        if (user === null) {
            res.status(404).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
            return;
        }
        const roles = roleStorage.getUserRoles(user.id);
        res.json({
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
    })().catch(next);
});
export default router;
//# sourceMappingURL=auth.js.map