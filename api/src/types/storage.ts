/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Storage Interface Definitions
 */

import type {
    DomainRequest,
    RequestStatus,
    RequestPriority,
    User,
    SafeUser,
    Role,
    UserRole,
    Classroom,
    Machine,
    Schedule,
    PushSubscription
} from './index.js';

// =============================================================================
// Request Storage
// =============================================================================

/**
 * Data for creating a new request
 */
export interface CreateRequestData {
    domain: string;
    reason?: string;
    requesterEmail?: string;
    groupId?: string;
    priority?: RequestPriority;
}

/**
 * Request statistics
 */
export interface RequestStats {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
}

/**
 * Request storage interface
 */
export interface IRequestStorage {
    getAllRequests(status?: RequestStatus | null): DomainRequest[];
    getRequestById(id: string): DomainRequest | null;
    getRequestsByGroup(groupId: string): DomainRequest[];
    hasPendingRequest(domain: string): boolean;
    createRequest(data: CreateRequestData): DomainRequest;
    updateRequestStatus(
        id: string,
        status: 'approved' | 'rejected',
        resolvedBy?: string,
        note?: string | null
    ): DomainRequest | null;
    deleteRequest(id: string): boolean;
    getStats(): RequestStats;
}

// =============================================================================
// User Storage
// =============================================================================

/**
 * Data for creating a new user
 */
export interface CreateUserData {
    email: string;
    name: string;
    password: string;
}

/**
 * Data for updating a user
 */
export interface UpdateUserData {
    email?: string;
    name?: string;
    password?: string;
    active?: boolean;
}

/**
 * User storage interface
 */
export interface IUserStorage {
    getAllUsers(): SafeUser[];
    getUserById(id: string): User | null;
    getUserByEmail(email: string): User | null;
    createUser(data: CreateUserData): Promise<SafeUser>;
    updateUser(id: string, data: UpdateUserData): Promise<SafeUser | null>;
    deleteUser(id: string): boolean;
    verifyPassword(user: User, password: string): Promise<boolean>;
}

// =============================================================================
// Role Storage
// =============================================================================

/**
 * Data for assigning a role
 */
export interface AssignRoleData {
    userId: string;
    role: UserRole;
    groups: string[];
    expiresAt?: string | null;
}

/**
 * Role storage interface
 */
export interface IRoleStorage {
    getRolesByUser(userId: string): Role[];
    getRoleById(roleId: string): Role | null;
    getUsersWithRole(role: UserRole): string[];
    assignRole(data: AssignRoleData): Role;
    updateRole(roleId: string, data: Partial<Role>): Role | null;
    revokeRole(roleId: string): boolean;
    revokeAllUserRoles(userId: string): number;
}

// =============================================================================
// Classroom Storage
// =============================================================================

/**
 * Data for creating a classroom
 */
export interface CreateClassroomData {
    name: string;
    displayName?: string;
}

/**
 * Data for updating a classroom
 */
export interface UpdateClassroomData {
    name?: string;
    displayName?: string;
}

/**
 * Classroom storage interface
 */
export interface IClassroomStorage {
    getAllClassrooms(): Classroom[];
    getClassroomById(id: string): Classroom | null;
    getClassroomByName(name: string): Classroom | null;
    createClassroom(data: CreateClassroomData): Classroom;
    updateClassroom(id: string, data: UpdateClassroomData): Classroom | null;
    deleteClassroom(id: string): boolean;
    addMachine(classroomId: string, hostname: string): Machine | null;
    removeMachine(classroomId: string, hostname: string): boolean;
    getMachineByHostname(hostname: string): { classroom: Classroom; machine: Machine } | null;
    updateMachineStatus(hostname: string, status: 'online' | 'offline'): boolean;
}

// =============================================================================
// Schedule Storage
// =============================================================================

/**
 * Data for creating a schedule
 */
export interface CreateScheduleData {
    classroomId: string;
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    startTime: string;
    endTime: string;
    groupId: string;
    teacherId: string;
    subject: string;
}

/**
 * Data for updating a schedule
 */
export interface UpdateScheduleData {
    dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    startTime?: string;
    endTime?: string;
    groupId?: string;
    subject?: string;
    active?: boolean;
}

/**
 * Schedule conflict info
 */
export interface ScheduleConflict {
    conflictingSchedule: Schedule;
    reason: string;
}

/**
 * Schedule storage interface
 */
export interface IScheduleStorage {
    getAllSchedules(): Schedule[];
    getScheduleById(id: string): Schedule | null;
    getSchedulesByClassroom(classroomId: string): Schedule[];
    getSchedulesByTeacher(teacherId: string): Schedule[];
    createSchedule(data: CreateScheduleData): Schedule;
    updateSchedule(id: string, data: UpdateScheduleData): Schedule | null;
    deleteSchedule(id: string): boolean;
    getCurrentSchedule(classroomId: string): Schedule | null;
    checkConflict(
        classroomId: string,
        dayOfWeek: number,
        startTime: string,
        endTime: string,
        excludeId?: string
    ): ScheduleConflict | null;
}

// =============================================================================
// Token Store
// =============================================================================

/**
 * Token store interface for blacklisting
 */
export interface ITokenStore {
    blacklist(token: string, expiresAt: Date): Promise<void>;
    isBlacklisted(token: string): Promise<boolean>;
    cleanup(): Promise<number>;
}

// =============================================================================
// Push Subscription Storage
// =============================================================================

/**
 * Data for creating a push subscription
 */
export interface CreatePushSubscriptionData {
    userId: string;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

/**
 * Push subscription storage interface
 */
export interface IPushStorage {
    getSubscriptionsByUser(userId: string): PushSubscription[];
    getSubscriptionsByGroup(groupId: string): PushSubscription[];
    getAllSubscriptions(): PushSubscription[];
    createSubscription(data: CreatePushSubscriptionData): PushSubscription;
    deleteSubscription(endpoint: string): boolean;
    deleteUserSubscriptions(userId: string): number;
}

// =============================================================================
// GitHub Integration
// =============================================================================

/**
 * Whitelist file content
 */
export interface WhitelistFile {
    path: string;
    sha: string;
    content: string;
    domains: string[];
}

/**
 * GitHub API interface
 */
export interface IGitHubService {
    getWhitelistFile(groupId: string): Promise<WhitelistFile | null>;
    updateWhitelistFile(
        groupId: string,
        domains: string[],
        message: string
    ): Promise<boolean>;
    isDomainInWhitelist(groupId: string, domain: string): Promise<boolean>;
    addDomainToWhitelist(
        groupId: string,
        domain: string,
        message?: string
    ): Promise<boolean>;
    listGroups(): Promise<string[]>;
}
