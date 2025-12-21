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
 * Authentication Library - JWT management
 * Handles token generation, verification, and refresh
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Configuration with defaults
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Token blacklist (in-memory for MVP, should be Redis in production)
const tokenBlacklist = new Set();

// Warn if using default secret
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using random secret (tokens will invalidate on restart).');
}

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate access token for user
 * @param {Object} user - User object
 * @param {Array} roles - User's active roles
 * @returns {string} JWT token
 */
function generateAccessToken(user, roles = []) {
    const payload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        roles: roles.map(r => ({
            role: r.role,
            groupIds: r.groupIds || []
        })),
        type: 'access'
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'whitelist-api'
    });
}

/**
 * Generate refresh token for user
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(user) {
    const payload = {
        sub: user.id,
        type: 'refresh'
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN,
        issuer: 'whitelist-api'
    });
}

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @param {Array} roles - User's active roles
 * @returns {Object} { accessToken, refreshToken, expiresIn }
 */
function generateTokens(user, roles = []) {
    return {
        accessToken: generateAccessToken(user, roles),
        refreshToken: generateRefreshToken(user),
        expiresIn: JWT_EXPIRES_IN,
        tokenType: 'Bearer'
    };
}

// =============================================================================
// Token Verification
// =============================================================================

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
function verifyToken(token) {
    try {
        // Check blacklist
        if (tokenBlacklist.has(token)) {
            return null;
        }

        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'whitelist-api'
        });

        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            console.log('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            console.log('Invalid token:', error.message);
        }
        return null;
    }
}

/**
 * Verify access token
 * @param {string} token - Access token
 * @returns {Object|null} Decoded payload or null
 */
function verifyAccessToken(token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.type === 'access') {
        return decoded;
    }
    return null;
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object|null} Decoded payload or null
 */
function verifyRefreshToken(token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.type === 'refresh') {
        return decoded;
    }
    return null;
}

// =============================================================================
// Token Blacklist (for logout/revocation)
// =============================================================================

/**
 * Blacklist a token (logout)
 * @param {string} token - Token to blacklist
 */
function blacklistToken(token) {
    tokenBlacklist.add(token);

    // Clean up expired tokens periodically
    setTimeout(() => cleanupBlacklist(), 60000);
}

/**
 * Remove expired tokens from blacklist
 */
function cleanupBlacklist() {
    for (const token of tokenBlacklist) {
        try {
            jwt.verify(token, JWT_SECRET, { ignoreExpiration: false });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                tokenBlacklist.delete(token);
            }
        }
    }
}

/**
 * Check if token is blacklisted
 * @param {string} token 
 * @returns {boolean}
 */
function isBlacklisted(token) {
    return tokenBlacklist.has(token);
}

// =============================================================================
// Authorization Helpers
// =============================================================================

/**
 * Check if decoded token has admin role
 * @param {Object} decoded - Decoded JWT payload
 * @returns {boolean}
 */
function isAdminToken(decoded) {
    if (!decoded || !decoded.roles) return false;
    return decoded.roles.some(r => r.role === 'admin');
}

/**
 * Check if decoded token has teacher role for given group
 * @param {Object} decoded - Decoded JWT payload
 * @param {string} groupId - Group to check
 * @returns {boolean}
 */
function canApproveGroup(decoded, groupId) {
    if (!decoded || !decoded.roles) return false;

    // Admin can approve any group
    if (isAdminToken(decoded)) return true;

    // Teacher can approve their groups
    return decoded.roles.some(r =>
        r.role === 'teacher' &&
        r.groupIds.includes(groupId)
    );
}

/**
 * Get all groups the user can approve for
 * @param {Object} decoded - Decoded JWT payload
 * @returns {Array<string>|'all'} Group IDs or 'all' for admins
 */
function getApprovalGroups(decoded) {
    if (!decoded || !decoded.roles) return [];

    if (isAdminToken(decoded)) return 'all';

    const groups = new Set();
    decoded.roles
        .filter(r => r.role === 'teacher')
        .forEach(r => {
            (r.groupIds || []).forEach(g => groups.add(g));
        });

    return Array.from(groups);
}

/**
 * Get the highest role from decoded token
 * @param {Object} decoded - Decoded JWT payload
 * @returns {string|null} 'admin', 'teacher', 'student', or null
 */
function getHighestRole(decoded) {
    if (!decoded || !decoded.roles || decoded.roles.length === 0) return null;

    const roles = decoded.roles.map(r => r.role);

    if (roles.includes('admin')) return 'admin';
    if (roles.includes('teacher')) return 'teacher';
    if (roles.includes('student')) return 'student';

    return null;
}

// =============================================================================
// Legacy Token Support (for backward compatibility with ADMIN_TOKEN)
// =============================================================================

/**
 * Create a pseudo-decoded token for legacy admin token
 * @returns {Object} Decoded token-like object
 */
function createLegacyAdminPayload() {
    return {
        sub: 'legacy_admin',
        email: 'admin@system',
        name: 'Legacy Admin',
        roles: [{ role: 'admin', groupIds: [] }],
        type: 'access',
        isLegacy: true
    };
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateTokens,
    verifyToken,
    verifyAccessToken,
    verifyRefreshToken,
    blacklistToken,
    isBlacklisted,
    isAdminToken,
    canApproveGroup,
    getApprovalGroups,
    getHighestRole,
    createLegacyAdminPayload,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
