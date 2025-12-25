/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Authentication Library - JWT management
 * Handles token generation, verification, and refresh
 */
import type { User, UserRole, JWTPayload } from '../types/index.js';
export interface RoleInfo {
    role: UserRole;
    groupIds: string[];
}
interface TokensResult {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    tokenType: 'Bearer';
}
interface LegacyAdminPayload {
    sub: string;
    email: string;
    name: string;
    roles: RoleInfo[];
    type: 'access';
    isLegacy: true;
}
declare let JWT_SECRET: string;
declare const JWT_EXPIRES_IN: string;
/**
 * Generate access token for user
 */
export declare function generateAccessToken(user: User, roles?: RoleInfo[]): string;
/**
 * Generate refresh token for user
 */
export declare function generateRefreshToken(user: User): string;
/**
 * Generate both access and refresh tokens
 */
export declare function generateTokens(user: User, roles?: RoleInfo[]): TokensResult;
/**
 * Verify and decode a JWT token
 */
export declare function verifyToken(token: string): Promise<JWTPayload | null>;
/**
 * Verify access token
 */
export declare function verifyAccessToken(token: string): Promise<JWTPayload | null>;
/**
 * Verify refresh token
 */
export declare function verifyRefreshToken(token: string): Promise<JWTPayload | null>;
/**
 * Blacklist a token (logout)
 */
export declare function blacklistToken(token: string): Promise<boolean>;
/**
 * Remove expired tokens from blacklist
 */
export declare function cleanupBlacklist(): Promise<void>;
/**
 * Check if token is blacklisted
 */
export declare function isBlacklisted(token: string): Promise<boolean>;
export interface DecodedWithRoles {
    sub: string;
    email?: string;
    name?: string;
    roles?: RoleInfo[];
}
/**
 * Check if decoded token has admin role
 */
export declare function isAdminToken(decoded: DecodedWithRoles | null | undefined): boolean;
/**
 * Check if decoded token has teacher role for given group
 */
export declare function canApproveGroup(decoded: DecodedWithRoles | null | undefined, groupId: string): boolean;
/**
 * Get all groups the user can approve for
 */
export declare function getApprovalGroups(decoded: DecodedWithRoles | null | undefined): string[] | 'all';
/**
 * Get the highest role from decoded token
 */
export declare function getHighestRole(decoded: DecodedWithRoles | null): UserRole | null;
/**
 * Create a pseudo-decoded token for legacy admin token
 */
export declare function createLegacyAdminPayload(): LegacyAdminPayload;
export { JWT_SECRET, JWT_EXPIRES_IN };
//# sourceMappingURL=auth.d.ts.map