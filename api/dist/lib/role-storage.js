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
// =============================================================================
// Constants
// =============================================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ROLES_FILE = path.join(DATA_DIR, 'user_roles.json');
export const VALID_ROLES = ['admin', 'teacher', 'student'];
// =============================================================================
// Initialization
// =============================================================================
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ROLES_FILE)) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify({ roles: [] }, null, 2));
}
// =============================================================================
// Internal Functions
// =============================================================================
function loadData() {
    try {
        const data = fs.readFileSync(ROLES_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error loading roles:', error);
        return { roles: [] };
    }
}
function saveData(data) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify(data, null, 2));
}
function toRoleType(stored) {
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
export function getUserRoles(userId) {
    const data = loadData();
    return data.roles.filter((r) => r.userId === userId && !r.revokedAt);
}
/**
 * Get all users with a specific role
 */
export function getUsersByRole(role) {
    const data = loadData();
    return data.roles.filter((r) => r.role === role && !r.revokedAt);
}
/**
 * Get all teachers with their assigned groups
 */
export function getAllTeachers() {
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
export function getAllAdmins() {
    return getUsersByRole('admin');
}
/**
 * Check if user has a specific role
 */
export function hasRole(userId, role) {
    const roles = getUserRoles(userId);
    return roles.some((r) => r.role === role);
}
/**
 * Check if user is admin
 */
export function isAdmin(userId) {
    return hasRole(userId, 'admin');
}
/**
 * Check if user can approve for a specific group
 */
export function canApproveForGroup(userId, groupId) {
    const roles = getUserRoles(userId);
    // Admin can approve any group
    if (roles.some((r) => r.role === 'admin')) {
        return true;
    }
    // Teacher can approve their assigned groups
    return roles.some((r) => r.role === 'teacher' && r.groupIds.includes(groupId));
}
/**
 * Get groups user can approve for
 */
export function getApprovalGroups(userId) {
    const roles = getUserRoles(userId);
    if (roles.some((r) => r.role === 'admin')) {
        return 'all';
    }
    const groups = new Set();
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
export function assignRole(roleData) {
    const { userId, role, groups, createdBy = 'system' } = roleData;
    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    const data = loadData();
    const existingRole = data.roles.find((r) => r.userId === userId && r.role === role && !r.revokedAt);
    if (existingRole) {
        const uniqueGroups = [...new Set([...existingRole.groupIds, ...groups])];
        existingRole.groupIds = uniqueGroups;
        existingRole.updatedAt = new Date().toISOString();
        saveData(data);
        return existingRole;
    }
    const newRole = {
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
export function updateRoleGroups(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);
    if (index === -1)
        return null;
    const role = data.roles[index];
    if (!role || role.revokedAt)
        return null;
    role.groupIds = groupIds;
    role.updatedAt = new Date().toISOString();
    saveData(data);
    return role;
}
/**
 * Add groups to a teacher role
 */
export function addGroupsToRole(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);
    if (index === -1)
        return null;
    const role = data.roles[index];
    if (!role || role.revokedAt)
        return null;
    role.groupIds = [...new Set([...role.groupIds, ...groupIds])];
    role.updatedAt = new Date().toISOString();
    saveData(data);
    return role;
}
/**
 * Remove groups from a teacher role
 */
export function removeGroupsFromRole(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);
    if (index === -1)
        return null;
    const role = data.roles[index];
    if (!role || role.revokedAt)
        return null;
    role.groupIds = role.groupIds.filter((g) => !groupIds.includes(g));
    role.updatedAt = new Date().toISOString();
    saveData(data);
    return role;
}
/**
 * Revoke a role (soft delete)
 */
export function revokeRole(roleId, revokedBy) {
    const data = loadData();
    const index = data.roles.findIndex((r) => r.id === roleId);
    if (index === -1)
        return null;
    const role = data.roles[index];
    if (!role || role.revokedAt)
        return null;
    role.revokedAt = new Date().toISOString();
    role.revokedBy = revokedBy ?? 'system';
    role.updatedAt = new Date().toISOString();
    saveData(data);
    return role;
}
/**
 * Revoke all roles for a user
 */
export function revokeAllUserRoles(userId, revokedBy) {
    const data = loadData();
    let count = 0;
    data.roles.forEach((r) => {
        if (r.userId === userId && !r.revokedAt) {
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
export function removeGroupFromAllRoles(groupId) {
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
export function getRoleById(roleId) {
    const data = loadData();
    return data.roles.find((r) => r.id === roleId) ?? null;
}
/**
 * Get roles by user ID (for IRoleStorage interface)
 */
export function getRolesByUser(userId) {
    return getUserRoles(userId).map(toRoleType);
}
/**
 * Get users with a specific role (user IDs only)
 */
export function getUsersWithRole(role) {
    return getUsersByRole(role).map((r) => r.userId);
}
/**
 * Update role
 */
export function updateRole(roleId, data) {
    const stored = getRoleById(roleId);
    if (!stored)
        return null;
    if (data.groups) {
        const updated = updateRoleGroups(roleId, data.groups);
        return updated ? toRoleType(updated) : null;
    }
    return toRoleType(stored);
}
/**
 * Get role statistics
 */
export function getStats() {
    const data = loadData();
    const active = data.roles.filter((r) => !r.revokedAt);
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
export const roleStorage = {
    getRolesByUser,
    getRoleById: (roleId) => {
        const stored = getRoleById(roleId);
        return stored ? toRoleType(stored) : null;
    },
    getUsersWithRole,
    assignRole: (data) => toRoleType(assignRole(data)),
    updateRole,
    revokeRole: (roleId) => revokeRole(roleId) !== null,
    revokeAllUserRoles: (userId) => revokeAllUserRoles(userId)
};
export default roleStorage;
//# sourceMappingURL=role-storage.js.map