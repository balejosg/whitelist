/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Authentication Library - JWT management
 * Handles token generation, verification, and refresh
 */
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getTokenStore } from './token-store.js';
// =============================================================================
// SECURITY: JWT Secret Configuration
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === '')) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL SECURITY ERROR: JWT_SECRET not set in production!      ║');
    console.error('║                                                               ║');
    console.error('║  Generate a secure secret:                                    ║');
    console.error('║  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    console.error('║                                                               ║');
    console.error('║  Then set it in your environment:                             ║');
    console.error('║  export JWT_SECRET="your-generated-secret"                    ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
}
// In development, generate a random secret but warn about token invalidation
let JWT_SECRET;
if (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '') {
    JWT_SECRET = process.env.JWT_SECRET;
}
else {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('');
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using random secret.');
    console.warn('⚠️  All tokens will be invalidated on server restart.');
    console.warn('⚠️  Set JWT_SECRET environment variable for persistent tokens.');
    console.warn('');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
// Use object literal directly in jwt.sign() to avoid exactOptionalPropertyTypes issues
// Token store (supports both memory and Redis backends)
const tokenStore = getTokenStore();
// =============================================================================
// Token Generation
// =============================================================================
/**
 * Generate access token for user
 */
export function generateAccessToken(user, roles = []) {
    const payload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        roles: roles.map((r) => ({
            role: r.role,
            groupIds: r.groupIds
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
 */
export function generateRefreshToken(user) {
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
 */
export function generateTokens(user, roles = []) {
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
 */
export async function verifyToken(token) {
    try {
        // Check blacklist (async for Redis support)
        const isBlacklistedToken = await tokenStore.isBlacklisted(token);
        if (isBlacklistedToken) {
            return null;
        }
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'whitelist-api'
        });
        return decoded;
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.name === 'TokenExpiredError') {
                console.log('Token expired');
            }
            else if (error.name === 'JsonWebTokenError') {
                console.log('Invalid token:', error.message);
            }
        }
        return null;
    }
}
/**
 * Verify access token
 */
export async function verifyAccessToken(token) {
    const decoded = await verifyToken(token);
    if (decoded?.type === 'access') {
        return decoded;
    }
    return null;
}
/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token) {
    const decoded = await verifyToken(token);
    if (decoded?.type === 'refresh') {
        return decoded;
    }
    return null;
}
// =============================================================================
// Token Blacklist (for logout/revocation)
// =============================================================================
/**
 * Blacklist a token (logout)
 */
export async function blacklistToken(token) {
    const decoded = await verifyToken(token);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tokenStore.blacklist(token, expiresAt);
    return true;
}
/**
 * Remove expired tokens from blacklist
 */
export async function cleanupBlacklist() {
    await tokenStore.cleanup();
}
/**
 * Check if token is blacklisted
 */
export async function isBlacklisted(token) {
    return tokenStore.isBlacklisted(token);
}
/**
 * Check if decoded token has admin role
 */
export function isAdminToken(decoded) {
    if (!decoded?.roles)
        return false;
    return decoded.roles.some((r) => r.role === 'admin');
}
/**
 * Check if decoded token has teacher role for given group
 */
export function canApproveGroup(decoded, groupId) {
    if (!decoded?.roles)
        return false;
    // Admin can approve any group
    if (isAdminToken(decoded))
        return true;
    // Teacher can approve their groups
    return decoded.roles.some((r) => r.role === 'teacher' && r.groupIds.includes(groupId));
}
/**
 * Get all groups the user can approve for
 */
export function getApprovalGroups(decoded) {
    if (!decoded?.roles)
        return [];
    if (isAdminToken(decoded))
        return 'all';
    const groups = new Set();
    decoded.roles
        .filter((r) => r.role === 'teacher')
        .forEach((r) => {
        r.groupIds.forEach((g) => groups.add(g));
    });
    return Array.from(groups);
}
/**
 * Get the highest role from decoded token
 */
export function getHighestRole(decoded) {
    if (decoded?.roles === undefined || decoded.roles.length === 0)
        return null;
    const roles = decoded.roles.map((r) => r.role);
    if (roles.includes('admin'))
        return 'admin';
    if (roles.includes('teacher'))
        return 'teacher';
    if (roles.includes('student'))
        return 'student';
    return null;
}
// =============================================================================
// Legacy Token Support (for backward compatibility with ADMIN_TOKEN)
// =============================================================================
/**
 * Create a pseudo-decoded token for legacy admin token
 */
export function createLegacyAdminPayload() {
    return {
        sub: 'legacy_admin',
        email: 'admin@system',
        name: 'Legacy Admin',
        roles: [{ role: 'admin', groupIds: [] }],
        type: 'access',
        isLegacy: true
    };
}
// =============================================================================
// Exports
// =============================================================================
export { JWT_SECRET, JWT_EXPIRES_IN };
//# sourceMappingURL=auth.js.map