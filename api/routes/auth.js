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
 * Authentication Routes
 * Handles login, logout, refresh token, and registration
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const userStorage = require('../lib/user-storage');
const roleStorage = require('../lib/role-storage');
const auth = require('../lib/auth');

// =============================================================================
// Rate Limiting
// =============================================================================

// Login: 5 attempts per 15 minutes per IP
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

// Register: 3 attempts per hour per IP
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
    // At least 8 characters
    return password && password.length >= 8;
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/auth/register
 * Register a new user (requires admin approval to activate)
 */
router.post('/register', registerLimiter, async (req, res) => {
    const { email, name, password } = req.body;

    // Validate required fields
    if (!email || !name || !password) {
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
        // Create user (inactive by default, needs admin to assign role)
        const user = await userStorage.createUser({
            email,
            name,
            password
        });

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
 * Login with email and password
 */
router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    try {
        // Verify credentials
        const user = await userStorage.verifyPassword(email, password);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Account is not active. Please contact an administrator.',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        // Get user roles
        const roles = roleStorage.getUserRoles(user.id);

        // Check if user has any role assigned
        if (roles.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'No role assigned. Please contact an administrator.',
                code: 'NO_ROLE'
            });
        }

        // Generate tokens
        const tokens = auth.generateTokens(user, roles);

        res.json({
            success: true,
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified,
                roles: roles.map(r => ({
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
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            error: 'Refresh token is required',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        // Verify refresh token
        const decoded = auth.verifyRefreshToken(refreshToken);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token',
                code: 'INVALID_TOKEN'
            });
        }

        // Get user
        const user = userStorage.getUserById(decoded.sub);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }

        // Get current roles (may have changed since last login)
        const roles = roleStorage.getUserRoles(user.id);

        // Generate new tokens
        const tokens = auth.generateTokens(user, roles);

        // Blacklist old refresh token
        auth.blacklistToken(refreshToken);

        res.json({
            success: true,
            ...tokens
        });

    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate current tokens
 */
router.post('/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const { refreshToken } = req.body;

    // Blacklist access token if provided
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.slice(7);
        auth.blacklistToken(accessToken);
    }

    // Blacklist refresh token if provided
    if (refreshToken) {
        auth.blacklistToken(refreshToken);
    }

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * GET /api/auth/me
 * Get current user info from token
 */
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required',
            code: 'MISSING_TOKEN'
        });
    }

    const token = authHeader.slice(7);
    const decoded = auth.verifyAccessToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    // Get fresh user data
    const user = userStorage.getUserById(decoded.sub);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    // Get current roles
    const roles = roleStorage.getUserRoles(user.id);

    res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            roles: roles.map(r => ({
                id: r.id,
                role: r.role,
                groupIds: r.groupIds
            }))
        }
    });
});

module.exports = router;
