/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Storage - JSON file-based role management
 * Stores user roles in data/user_roles.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type { Role, UserRole } from '../types/index.js';
import type { IRoleStorage, AssignRoleData } from '../types/storage.js';

// =============================================================================
// Constants
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ROLES_FILE = path.join(DATA_DIR, 'user_roles.json');

export const VALID_ROLES: readonly UserRole[] = ['admin', 'teacher', 'student'] as const;

// =============================================================================
// Types
// =============================================================================

interface StoredRole {
    id: string;
    userId: string;
    role: UserRole;
    groupIds: string[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    revokedAt: string | null;
    revokedBy?: string;
}

interface RolesData {
    roles: StoredRole[];
}

interface RoleStats {
    total: number;
    active: number;
    admins: number;
    teachers: number;
    students: number;
}

interface TeacherInfo {
    userId: string;
    groupIds: string[];
    createdAt: string;
    createdBy: string;
}

// =============================================================================
// Initialization
// =============================================================================

if (fs.existsSync(DATA_DIR) === false) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (fs.existsSync(ROLES_FILE) === false) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify({ roles: [] }, null, 2));
}

// =============================================================================
// Internal Functions
// =============================================================================

function loadData(): RolesData {
    try {
        const data = fs.readFileSync(ROLES_FILE, 'utf-8');
        return JSON.parse(data) as RolesData;
    } catch (error) {
        console.error('Error loading roles:', error);
        return { roles: [] };
    }
}

function saveData(data: RolesData): void {
    fs.writeFileSync(ROLES_FILE, JSON.stringify(data, null, 2));
}

function toRoleType(stored: StoredRole): Role {
    return {
        id: stored.id,
        user_id: stored.userId,
        role: stored.role,
        groups: stored.groupIds,
        created_at: stored.createdAt,
        expires_at: null
    };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get all active roles for a user
 */
export function getUserRoles(userId: string): StoredRole[] {
    const data = loadData();
    return data.roles.filter((r) => r.userId === userId && r.revokedAt === null);
}

/**
 * Get all users with a specific role
 */
export function getUsersByRole(role: UserRole): StoredRole[] {
    const data = loadData();
    return data.roles.filter((r) => r.role === role && r.revokedAt === null);
}

/**
 * Get all teachers with their assigned groups
 */
export function getAllTeachers(): TeacherInfo[] {
    return getUsersByRole('teacher').map((r) => ({
        userId: r.userId,
        groupIds: r.groupIds,
        createdAt: r.createdAt,
        createdBy: r.createdBy
    }));
}

/**
 * Get all admins
 */
export function getAllAdmins(): StoredRole[] {
    return getUsersByRole('admin');
}

/**
 * Check if there are any admin users
 */
export function hasAnyAdmins(): boolean {
    return getAllAdmins().length > 0;
}

/**
 * Check if user has a specific role
 */
export function hasRole(userId: string, role: UserRole): boolean {
    const roles = getUserRoles(userId);
    return roles.some((r) => r.role === role);
}

/**
 * Check if user is admin
 */
export function isAdmin(userId: string): boolean {
    return hasRole(userId, 'admin');
}

/**
 * Check if user can approve for a specific group
 */
export function canApproveForGroup(userId: string, groupId: string): boolean {
    const roles = getUserRoles(userId);

    // Admin can approve any group
    if (roles.some((r) => r.role === 'admin')) {
        return true;
    }

    // Teacher can approve their assigned groups
    return roles.some(
        (r) => r.role === 'teacher' && r.groupIds.includes(groupId)
    );
}

/**
 * Get groups user can approve for
 */
export function getApprovalGroups(userId: string): string[] | 'all' {
    const roles = getUserRoles(userId);

    if (roles.some((r) => r.role === 'admin')) {
        return 'all';
    }

    const groups = new Set<string>();
    roles
        .filter((r) => r.role === 'teacher')
        .forEach((r) => {
            r.groupIds.forEach((g) => groups.add(g));
        });

    return Array.from(groups);
}

/**
 * Assign a role to a user
 */
export function assignRole(roleData: AssignRoleData & { createdBy?: string }): StoredRole {
    const { userId, role, groups, createdBy = 'system' } = roleData;

    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const data = loadData();
    const existingRole = data.roles.find(
        (r) => r.userId === userId && r.role === role && r.revokedAt === null
    );

    if (existingRole !== undefined) {
        const uniqueGroups = [...new Set([...existingRole.groupIds, ...groups])];
        existingRole.groupIds = uniqueGroups;
        existingRole.updatedAt = new Date().toISOString();
        saveData(data);
        return existingRole;
    }

    const newRole: StoredRole = {
        id: `role_${uuidv4().slice(0, 8)}`,
        userId,
        role,
        groupIds: role === 'teacher' ? groups : [],
        createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revokedAt: null
    };

    data.roles.push(newRole);
    saveData(data);

    return newRole;
}

/**
 * Update groups for a teacher role
 */
export function updateRoleGroups(roleId: string, groupIds: string[]): StoredRole | null {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);

    if (index === -1) return null;
    const role = data.roles[index];
    if (role === undefined || role.revokedAt !== null) return null;

    role.groupIds = groupIds;
    role.updatedAt = new Date().toISOString();
    saveData(data);

    return role;
}

/**
 * Add groups to a teacher role
 */
export function addGroupsToRole(roleId: string, groupIds: string[]): StoredRole | null {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);

    if (index === -1) return null;
    const role = data.roles[index];
    if (role === undefined || role.revokedAt !== null) return null;

    role.groupIds = [...new Set([...role.groupIds, ...groupIds])];
    role.updatedAt = new Date().toISOString();
    saveData(data);

    return role;
}

/**
 * Remove groups from a teacher role
 */
export function removeGroupsFromRole(roleId: string, groupIds: string[]): StoredRole | null {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);

    if (index === -1) return null;
    const role = data.roles[index];
    if (role === undefined || role.revokedAt !== null) return null;

    role.groupIds = role.groupIds.filter((g) => groupIds.includes(g) === false);
    role.updatedAt = new Date().toISOString();
    saveData(data);

    return role;
}

/**
 * Revoke a role (soft delete)
 */
export function revokeRole(roleId: string, revokedBy?: string): StoredRole | null {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);

    if (index === -1) return null;
    const role = data.roles[index];
    if (role === undefined || role.revokedAt !== null) return null;

    role.revokedAt = new Date().toISOString();
    role.revokedBy = revokedBy ?? 'system';
    role.updatedAt = new Date().toISOString();
    saveData(data);

    return role;
}

/**
 * Revoke all roles for a user
 */
export function revokeAllUserRoles(userId: string, revokedBy?: string): number {
    const data = loadData();
    let count = 0;

    data.roles.forEach((r) => {
        if (r.userId === userId && r.revokedAt === null) {
            r.revokedAt = new Date().toISOString();
            r.revokedBy = revokedBy ?? 'system';
            r.updatedAt = new Date().toISOString();
            count++;
        }
    });

    saveData(data);
    return count;
}

/**
 * Remove all roles for a specific group
 */
export function removeGroupFromAllRoles(groupId: string): number {
    const data = loadData();
    let count = 0;

    data.roles.forEach((r) => {
        if (r.groupIds.includes(groupId)) {
            r.groupIds = r.groupIds.filter((g) => g !== groupId);
            r.updatedAt = new Date().toISOString();
            count++;
        }
    });

    saveData(data);
    return count;
}

/**
 * Get role by ID
 */
export function getRoleById(roleId: string): StoredRole | null {
    const data = loadData();
    return data.roles.find((r) => r.id === roleId) ?? null;
}

/**
 * Get roles by user ID (for IRoleStorage interface)
 */
export function getRolesByUser(userId: string): Role[] {
    return getUserRoles(userId).map(toRoleType);
}

/**
 * Get users with a specific role (user IDs only)
 */
export function getUsersWithRole(role: UserRole): string[] {
    return getUsersByRole(role).map((r) => r.userId);
}

/**
 * Update role
 */
export function updateRole(roleId: string, data: Partial<Role>): Role | null {
    const stored = getRoleById(roleId);
    if (!stored) return null;

    if (data.groups) {
        const updated = updateRoleGroups(roleId, data.groups);
        return updated ? toRoleType(updated) : null;
    }

    return toRoleType(stored);
}

/**
 * Get role statistics
 */
export function getStats(): RoleStats {
    const data = loadData();
    const active = data.roles.filter((r) => r.revokedAt === null);

    return {
        total: data.roles.length,
        active: active.length,
        admins: active.filter((r) => r.role === 'admin').length,
        teachers: active.filter((r) => r.role === 'teacher').length,
        students: active.filter((r) => r.role === 'student').length
    };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const roleStorage: IRoleStorage = {
    getRolesByUser,
    getRoleById: (roleId: string) => {
        const stored = getRoleById(roleId);
        return stored ? toRoleType(stored) : null;
    },
    getUsersWithRole,
    assignRole: (data: AssignRoleData) => toRoleType(assignRole(data)),
    updateRole,
    revokeRole: (roleId: string) => revokeRole(roleId) !== null,
    revokeAllUserRoles: (userId: string) => revokeAllUserRoles(userId)
};

export default roleStorage;
