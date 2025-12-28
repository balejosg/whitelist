/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Storage - PostgreSQL-based role management
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
export const VALID_ROLES = ['admin', 'teacher', 'student'];
// =============================================================================
// Helper Functions
// =============================================================================
function toRoleType(db) {
    return {
        id: db.id,
        user_id: db.user_id,
        role: db.role,
        groups: db.groups,
        created_at: db.created_at,
        expires_at: null
    };
}
// =============================================================================
// Public API
// =============================================================================
export async function getUserRoles(userId) {
    const result = await query('SELECT * FROM roles WHERE user_id = $1', [userId]);
    return result.rows;
}
export async function getUsersByRole(role) {
    const result = await query('SELECT * FROM roles WHERE role = $1', [role]);
    return result.rows;
}
export async function getAllTeachers() {
    const teachers = await getUsersByRole('teacher');
    return teachers.map((r) => ({
        userId: r.user_id,
        groupIds: r.groups,
        createdAt: r.created_at,
        createdBy: r.created_by
    }));
}
export async function getAllAdmins() {
    return getUsersByRole('admin');
}
export async function hasAnyAdmins() {
    const result = await query('SELECT EXISTS(SELECT 1 FROM roles WHERE role = $1) as exists', ['admin']);
    return result.rows[0]?.exists ?? false;
}
export async function hasRole(userId, role) {
    const result = await query('SELECT EXISTS(SELECT 1 FROM roles WHERE user_id = $1 AND role = $2) as exists', [userId, role]);
    return result.rows[0]?.exists ?? false;
}
export async function isAdmin(userId) {
    return hasRole(userId, 'admin');
}
export async function canApproveForGroup(userId, groupId) {
    // Admin can approve any group
    const isAdminUser = await isAdmin(userId);
    if (isAdminUser) {
        return true;
    }
    // Teacher can approve their assigned groups
    const result = await query(`SELECT EXISTS(
            SELECT 1 FROM roles 
            WHERE user_id = $1 
            AND role = 'teacher' 
            AND $2 = ANY(groups)
        ) as exists`, [userId, groupId]);
    return result.rows[0]?.exists ?? false;
}
export async function getApprovalGroups(userId) {
    const isAdminUser = await isAdmin(userId);
    if (isAdminUser) {
        return 'all';
    }
    const result = await query('SELECT groups FROM roles WHERE user_id = $1 AND role = \'teacher\'', [userId]);
    const allGroups = new Set();
    result.rows.forEach((row) => {
        (row.groups).forEach((g) => allGroups.add(g));
    });
    return Array.from(allGroups);
}
export async function assignRole(roleData) {
    const { userId, role, groups, createdBy = 'system' } = roleData;
    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    // Check if role already exists
    const existing = await query('SELECT * FROM roles WHERE user_id = $1 AND role = $2', [userId, role]);
    if (existing.rows[0]) {
        // Update existing role's groups
        const uniqueGroups = [...new Set([...(existing.rows[0].groups), ...groups])];
        const result = await query('UPDATE roles SET groups = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [uniqueGroups, existing.rows[0].id]);
        if (!result.rows[0])
            throw new Error('Role update failed');
        return result.rows[0];
    }
    // Create new role
    const id = `role_${uuidv4().slice(0, 8)}`;
    const groupsToStore = role === 'teacher' ? groups : [];
    const result = await query(`INSERT INTO roles (id, user_id, role, groups, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`, [id, userId, role, groupsToStore, createdBy]);
    if (!result.rows[0])
        throw new Error('Role creation failed');
    return result.rows[0];
}
export async function updateRoleGroups(roleId, groupIds) {
    const result = await query('UPDATE roles SET groups = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [groupIds, roleId]);
    return result.rows[0] ?? null;
}
export async function addGroupsToRole(roleId, groupIds) {
    const role = await getRoleById(roleId);
    if (!role)
        return null;
    const uniqueGroups = [...new Set([...(role.groups), ...groupIds])];
    return updateRoleGroups(roleId, uniqueGroups);
}
export async function removeGroupsFromRole(roleId, groupIds) {
    const role = await getRoleById(roleId);
    if (!role)
        return null;
    const filteredGroups = (role.groups).filter((g) => !groupIds.includes(g));
    return updateRoleGroups(roleId, filteredGroups);
}
export async function revokeRole(roleId, _revokedBy) {
    const result = await query('DELETE FROM roles WHERE id = $1', [roleId]);
    return (result.rowCount ?? 0) > 0;
}
export async function revokeAllUserRoles(userId, _revokedBy) {
    const result = await query('DELETE FROM roles WHERE user_id = $1', [userId]);
    return result.rowCount ?? 0;
}
export async function removeGroupFromAllRoles(groupId) {
    const result = await query(`UPDATE roles 
         SET groups = array_remove(groups, $1), 
             updated_at = NOW()
         WHERE $1 = ANY(groups)`, [groupId]);
    return result.rowCount ?? 0;
}
export async function getRoleById(roleId) {
    const result = await query('SELECT * FROM roles WHERE id = $1', [roleId]);
    return result.rows[0] ?? null;
}
export async function getRolesByUser(userId) {
    const roles = await getUserRoles(userId);
    return roles.map(toRoleType);
}
export async function getUsersWithRole(role) {
    const roles = await getUsersByRole(role);
    return roles.map((r) => r.user_id);
}
export async function updateRole(roleId, data) {
    if (data.groups) {
        const updated = await updateRoleGroups(roleId, data.groups);
        return updated ? toRoleType(updated) : null;
    }
    const role = await getRoleById(roleId);
    return role ? toRoleType(role) : null;
}
export async function getStats() {
    const result = await query('SELECT role, COUNT(*) as count FROM roles GROUP BY role');
    const stats = {
        total: 0,
        active: 0,
        admins: 0,
        teachers: 0,
        students: 0
    };
    result.rows.forEach((row) => {
        const count = parseInt(row.count, 10);
        stats.total += count;
        stats.active += count;
        if (row.role === 'admin')
            stats.admins = count;
        if (row.role === 'teacher')
            stats.teachers = count;
        if (row.role === 'student')
            stats.students = count;
    });
    return stats;
}
// =============================================================================
// Storage Instance
// =============================================================================
export const roleStorage = {
    getRolesByUser,
    getRoleById: async (roleId) => {
        const role = await getRoleById(roleId);
        return role ? toRoleType(role) : null;
    },
    getUsersWithRole,
    assignRole: async (data) => toRoleType(await assignRole(data)),
    updateRole,
    revokeRole,
    revokeAllUserRoles
};
export default roleStorage;
//# sourceMappingURL=role-storage.js.map