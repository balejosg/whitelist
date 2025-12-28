/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Core Type Definitions
 */

// =============================================================================
// Domain Types
// =============================================================================

export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type UserRole = 'admin' | 'teacher' | 'student';
export type MachineStatus = 'online' | 'offline' | 'unknown';

/**
 * Domain unlock request
 */
export interface DomainRequest {
    id: string;
    domain: string;
    reason: string;
    requester_email: string;
    group_id: string;
    priority: RequestPriority;
    status: RequestStatus;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution_note?: string;
}

/**
 * System user - matches storage implementation
 */
export interface User {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    active: boolean;
    isActive?: boolean;  // Alias used in routes
    emailVerified?: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * User without sensitive fields
 */
export type SafeUser = Omit<User, 'password_hash'>;

/**
 * Role assignment for a user
 */
export interface Role {
    id: string;
    user_id: string;
    role: UserRole;
    groups: string[];
    created_at: string;
    expires_at: string | null;
}

/**
 * Classroom with machines
 */
export interface Classroom {
    id: string;
    name: string;
    display_name: string;
    machines: Machine[];
    created_at: string;
    updated_at: string;
}

/**
 * Machine in a classroom
 */
export interface Machine {
    hostname: string;
    last_seen: string | null;
    status: MachineStatus;
}

/**
 * Weekly schedule entry
 */
export interface Schedule {
    id: string;
    classroom_id: string;
    day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    start_time: string; // HH:MM format
    end_time: string;   // HH:MM format
    group_id: string;
    teacher_id: string;
    subject: string;
    active: boolean;
    created_at: string;
}

/**
 * Health report from client machine
 */
export interface HealthReport {
    id: string;
    hostname: string;
    classroom_id: string;
    status: 'healthy' | 'warning' | 'error';
    details: Record<string, unknown>;
    reported_at: string;
}

/**
 * Push subscription for notifications
 */
export interface PushSubscription {
    id: string;
    user_id: string;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    created_at: string;
}

// =============================================================================
// JWT Types
// =============================================================================

/**
 * Role info in JWT payload
 */
export interface RoleInfo {
    role: UserRole;
    groupIds: string[];
}

/**
 * JWT token payload - matches auth.ts implementation
 */
export interface JWTPayload {
    sub: string;  // user id
    email: string;
    name: string;
    roles: RoleInfo[];
    type: 'access' | 'refresh';
    isLegacy?: boolean;
    iat?: number;
    exp?: number;
}

/**
 * Decoded and validated JWT token
 */
export interface DecodedToken extends JWTPayload {
    isAdmin: boolean;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface APIResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    message?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> extends APIResponse<T[]> {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

/**
 * Statistics response
 */
export interface StatsResponse {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
}

// =============================================================================
// Request/Response DTOs
// =============================================================================

/**
 * Create request DTO
 */
export interface CreateRequestDTO {
    domain: string;
    reason?: string;
    requester_email?: string;
    group_id?: string;
    priority?: RequestPriority;
}

/**
 * Update request status DTO
 */
export interface UpdateRequestStatusDTO {
    status: 'approved' | 'rejected';
    note?: string;
}

/**
 * Create user DTO
 */
export interface CreateUserDTO {
    email: string;
    name: string;
    password: string;
}

/**
 * Login DTO
 */
export interface LoginDTO {
    email: string;
    password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: SafeUser;
}

/**
 * Create classroom DTO
 */
export interface CreateClassroomDTO {
    name: string;
    display_name?: string;
}

/**
 * Create schedule DTO
 */
export interface CreateScheduleDTO {
    classroom_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    group_id: string;
    subject: string;
}

// =============================================================================
// Express Extensions
// =============================================================================

import type { Request, Response, NextFunction } from 'express';

/**
 * Request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
    user: DecodedToken;
    requestId?: string;
}

/**
 * Request with user's accessible groups
 */
export interface RequestWithGroups extends AuthenticatedRequest {
    userGroups: string[] | 'all';
}

/**
 * Express middleware type
 */
export type Middleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => void | Promise<void>;

/**
 * Authenticated middleware type
 */
export type AuthMiddleware = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => void | Promise<void>;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Environment configuration
 */
export interface Config {
    port: number;
    nodeEnv: 'development' | 'production' | 'test';
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshExpiresIn: string;
    adminToken?: string;
    sharedSecret?: string;
    corsOrigins: string;
    dataDir: string;
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    vapidEmail?: string;
}
