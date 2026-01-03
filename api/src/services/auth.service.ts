/**
 * AuthService - Business logic for authentication
 */

import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';
import * as resetTokenStorage from '../lib/reset-token-storage.js';
import { logger } from '../lib/logger.js';
import type {
    SafeUser,
    LoginResponse,
    UserRole
} from '../types/index.js';
import type { CreateUserData } from '../types/storage.js';
import { getErrorMessage } from '@openpath/shared';

// =============================================================================
// Types
// =============================================================================

export type AuthServiceError =
    | { code: 'CONFLICT'; message: string }
    | { code: 'UNAUTHORIZED'; message: string }
    | { code: 'FORBIDDEN'; message: string }
    | { code: 'NOT_FOUND'; message: string };

export type AuthResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: AuthServiceError };

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    tokenType: 'Bearer';
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Register a new user
 */
export async function register(
    input: CreateUserData
): Promise<AuthResult<{ user: SafeUser }>> {
    try {
        if (await userStorage.emailExists(input.email)) {
            return {
                ok: false,
                error: { code: 'CONFLICT', message: 'Email already registered' }
            };
        }
        const user = await userStorage.createUser(input);
        return { ok: true, data: { user: { id: user.id, email: user.email, name: user.name } as SafeUser } };
    } catch (error) {
        logger.error('auth.register error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

/**
 * Login user and return tokens
 */
export async function login(
    email: string,
    password: string
): Promise<AuthResult<LoginResponse>> {
    try {
        const user = await userStorage.verifyPasswordByEmail(email, password);
        if (!user) {
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } };
        }
        if (!user.isActive) {
            return { ok: false, error: { code: 'FORBIDDEN', message: 'Account inactive' } };
        }

        const roles = await roleStorage.getUserRoles(user.id);
        const tokens = auth.generateTokens(user, roles.map(r => ({
            role: r.role as 'admin' | 'teacher' | 'student',
            groupIds: r.groupIds ?? []
        })));

        return {
            ok: true,
            data: {
                ...tokens,
                expiresIn: parseInt(tokens.expiresIn) || 86400, // Standardize to number
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    roles: roles.map(r => ({
                        id: r.id,
                        userId: r.userId,
                        role: r.role as UserRole,
                        groupIds: r.groupIds ?? [],
                        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                        updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                        createdBy: r.createdBy,
                        revokedAt: null
                    }))
                } as unknown as SafeUser
            }
        };
    } catch (error) {
        logger.error('auth.login error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

/**
 * Refresh access token
 */
export async function refresh(
    refreshToken: string
): Promise<AuthResult<TokenPair>> {
    const decoded = await auth.verifyRefreshToken(refreshToken);
    if (!decoded) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } };
    }

    const user = await userStorage.getUserById(decoded.sub);
    if (user?.isActive !== true) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' } };
    }

    await auth.blacklistToken(refreshToken);
    const roles = await roleStorage.getUserRoles(user.id);
    const tokens = auth.generateTokens(user, roles.map(r => ({
        role: r.role as 'admin' | 'teacher' | 'student',
        groupIds: r.groupIds ?? []
    })));

    return { ok: true, data: tokens as TokenPair };
}

/**
 * Logout user
 */
export async function logout(
    accessToken?: string,
    refreshToken?: string
): Promise<AuthResult<{ success: boolean }>> {
    if (accessToken) await auth.blacklistToken(accessToken);
    if (refreshToken) await auth.blacklistToken(refreshToken);
    return { ok: true, data: { success: true } };
}

/**
 * Get user profile
 */
export async function getProfile(
    userId: string
): Promise<AuthResult<{ user: SafeUser }>> {
    const user = await userStorage.getUserById(userId);
    if (!user) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    const roles = await roleStorage.getUserRoles(user.id);
    return {
        ok: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                roles: roles.map(r => ({
                    id: r.id,
                    userId: r.userId,
                    role: r.role as UserRole,
                    groupIds: r.groupIds ?? [],
                    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                    createdBy: r.createdBy,
                    revokedAt: null
                }))
            } as unknown as SafeUser
        }
    };
}

/**
 * Generate a password reset token for a user (Admin only)
 */
export async function generateResetToken(
    email: string
): Promise<AuthResult<{ token: string }>> {
    try {
        const user = await userStorage.getUserByEmail(email);
        if (!user) {
            return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
        }

        const token = await resetTokenStorage.createResetToken(user.id);
        return { ok: true, data: { token } };
    } catch (error) {
        logger.error('auth.generateResetToken error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

/**
 * Reset password using a valid token
 */
export async function resetPassword(
    email: string,
    token: string,
    newPassword: string
): Promise<AuthResult<{ success: boolean }>> {
    try {
        const user = await userStorage.getUserByEmail(email);
        if (!user) {
            return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
        }

        const isValid = await resetTokenStorage.verifyToken(user.id, token);
        if (!isValid) {
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } };
        }

        await userStorage.updateUser(user.id, { password: newPassword });
        return { ok: true, data: { success: true } };
    } catch (error) {
        logger.error('auth.resetPassword error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

// =============================================================================
// Default Export
// =============================================================================

export default {
    register,
    login,
    refresh,
    logout,
    getProfile,
    generateResetToken,
    resetPassword
};
