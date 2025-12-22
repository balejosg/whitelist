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
 * Role Storage - JSON file-based role management
 * Stores user roles in data/user_roles.json
 * 
 * Roles:
 * - admin: Full access to all groups and settings
 * - teacher: Can approve/reject requests for assigned groups
 * - student: Can submit requests only
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ROLES_FILE = path.join(DATA_DIR, 'user_roles.json');

// Valid roles
const VALID_ROLES = ['admin', 'teacher', 'student'];

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty roles file if not exists
if (!fs.existsSync(ROLES_FILE)) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify({ roles: [] }, null, 2));
}

// =============================================================================
// Data Access
// =============================================================================

/**
 * Load all roles from file
 * @returns {Object} { roles: Array }
 */
function loadData() {
    try {
        const data = fs.readFileSync(ROLES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading roles:', error);
        return { roles: [] };
    }
}

/**
 * Save data to file
 * @param {Object} data 
 */
function saveData(data) {
    fs.writeFileSync(ROLES_FILE, JSON.stringify(data, null, 2));
}

// =============================================================================
// Role CRUD Operations
// =============================================================================

/**
 * Get all active roles for a user
 * @param {string} userId 
 * @returns {Array}
 */
function getUserRoles(userId) {
    const data = loadData();
    return data.roles.filter(r => r.userId === userId && !r.revokedAt);
}

/**
 * Get all users with a specific role
 * @param {string} role - 'admin', 'teacher', or 'student'
 * @returns {Array}
 */
function getUsersByRole(role) {
    const data = loadData();
    return data.roles.filter(r => r.role === role && !r.revokedAt);
}

/**
 * Get all teachers with their assigned groups
 * @returns {Array}
 */
function getAllTeachers() {
    return getUsersByRole('teacher').map(r => ({
        userId: r.userId,
        groupIds: r.groupIds,
        createdAt: r.createdAt,
        createdBy: r.createdBy
    }));
}

/**
 * Get all admins
 * @returns {Array}
 */
function getAllAdmins() {
    return getUsersByRole('admin');
}

/**
 * Check if user has a specific role
 * @param {string} userId 
 * @param {string} role 
 * @returns {boolean}
 */
function hasRole(userId, role) {
    const roles = getUserRoles(userId);
    return roles.some(r => r.role === role);
}

/**
 * Check if user is admin
 * @param {string} userId 
 * @returns {boolean}
 */
function isAdmin(userId) {
    return hasRole(userId, 'admin');
}

/**
 * Check if user can approve for a specific group
 * @param {string} userId 
 * @param {string} groupId 
 * @returns {boolean}
 */
function canApproveForGroup(userId, groupId) {
    const roles = getUserRoles(userId);

    // Admin can approve any group
    if (roles.some(r => r.role === 'admin')) {
        return true;
    }

    // Teacher can approve their assigned groups
    return roles.some(r =>
        r.role === 'teacher' &&
        r.groupIds.includes(groupId)
    );
}

/**
 * Get groups user can approve for
 * @param {string} userId 
 * @returns {Array<string>|'all'} - Array of group IDs or 'all' for admins
 */
function getApprovalGroups(userId) {
    const roles = getUserRoles(userId);

    // Admin can approve any group
    if (roles.some(r => r.role === 'admin')) {
        return 'all';
    }

    // Collect all groups from teacher roles
    const groups = new Set();
    roles.filter(r => r.role === 'teacher').forEach(r => {
        r.groupIds.forEach(g => groups.add(g));
    });

    return Array.from(groups);
}

/**
 * Assign a role to a user
 * @param {Object} roleData - { userId, role, groupIds, createdBy }
 * @returns {Object} - The created role
 */
function assignRole(roleData) {
    const { userId, role, groupIds = [], createdBy } = roleData;

    // Validate role
    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    // Check for existing active role of same type
    const data = loadData();
    const existingRole = data.roles.find(r =>
        r.userId === userId &&
        r.role === role &&
        !r.revokedAt
    );

    if (existingRole) {
        // Update existing role with new groups
        const uniqueGroups = [...new Set([...existingRole.groupIds, ...groupIds])];
        existingRole.groupIds = uniqueGroups;
        existingRole.updatedAt = new Date().toISOString();
        saveData(data);
        return existingRole;
    }

    // Create new role
    const newRole = {
        id: `role_${uuidv4().slice(0, 8)}`,
        userId,
        role,
        groupIds: role === 'teacher' ? groupIds : [],
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
 * @param {string} roleId 
 * @param {Array<string>} groupIds 
 * @returns {Object|null}
 */
function updateRoleGroups(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex(r => r.id === roleId);

    if (index === -1 || data.roles[index].revokedAt) {
        return null;
    }

    data.roles[index].groupIds = groupIds;
    data.roles[index].updatedAt = new Date().toISOString();
    saveData(data);

    return data.roles[index];
}

/**
 * Add groups to a teacher role
 * @param {string} roleId 
 * @param {Array<string>} groupIds 
 * @returns {Object|null}
 */
function addGroupsToRole(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex(r => r.id === roleId);

    if (index === -1 || data.roles[index].revokedAt) {
        return null;
    }

    const currentGroups = data.roles[index].groupIds;
    data.roles[index].groupIds = [...new Set([...currentGroups, ...groupIds])];
    data.roles[index].updatedAt = new Date().toISOString();
    saveData(data);

    return data.roles[index];
}

/**
 * Remove groups from a teacher role
 * @param {string} roleId 
 * @param {Array<string>} groupIds 
 * @returns {Object|null}
 */
function removeGroupsFromRole(roleId, groupIds) {
    const data = loadData();
    const index = data.roles.findIndex(r => r.id === roleId);

    if (index === -1 || data.roles[index].revokedAt) {
        return null;
    }

    data.roles[index].groupIds = data.roles[index].groupIds.filter(
        g => !groupIds.includes(g)
    );
    data.roles[index].updatedAt = new Date().toISOString();
    saveData(data);

    return data.roles[index];
}

/**
 * Revoke a role (soft delete)
 * @param {string} roleId 
 * @param {string} revokedBy 
 * @returns {Object|null}
 */
function revokeRole(roleId, revokedBy) {
    const data = loadData();
    const index = data.roles.findIndex(r => r.id === roleId);

    if (index === -1 || data.roles[index].revokedAt) {
        return null;
    }

    data.roles[index].revokedAt = new Date().toISOString();
    data.roles[index].revokedBy = revokedBy;
    data.roles[index].updatedAt = new Date().toISOString();
    saveData(data);

    return data.roles[index];
}

/**
 * Revoke all roles for a user
 * @param {string} userId 
 * @param {string} revokedBy 
 * @returns {number} - Number of roles revoked
 */
function revokeAllUserRoles(userId, revokedBy) {
    const data = loadData();
    let count = 0;

    data.roles.forEach(r => {
        if (r.userId === userId && !r.revokedAt) {
            r.revokedAt = new Date().toISOString();
            r.revokedBy = revokedBy;
            r.updatedAt = new Date().toISOString();
            count++;
        }
    });

    saveData(data);
    return count;
}

/**
 * Remove all roles for a specific group (when group is deleted)
 * @param {string} groupId 
 * @returns {number} - Number of roles affected
 */
function removeGroupFromAllRoles(groupId) {
    const data = loadData();
    let count = 0;

    data.roles.forEach(r => {
        if (r.groupIds.includes(groupId)) {
            r.groupIds = r.groupIds.filter(g => g !== groupId);
            r.updatedAt = new Date().toISOString();
            count++;
        }
    });

    saveData(data);
    return count;
}

/**
 * Get role by ID
 * @param {string} roleId 
 * @returns {Object|null}
 */
function getRoleById(roleId) {
    const data = loadData();
    return data.roles.find(r => r.id === roleId) || null;
}

/**
 * Get role statistics
 * @returns {Object}
 */
function getStats() {
    const data = loadData();
    const active = data.roles.filter(r => !r.revokedAt);

    return {
        total: data.roles.length,
        active: active.length,
        admins: active.filter(r => r.role === 'admin').length,
        teachers: active.filter(r => r.role === 'teacher').length,
        students: active.filter(r => r.role === 'student').length
    };
}

module.exports = {
    VALID_ROLES,
    getUserRoles,
    getUsersByRole,
    getAllTeachers,
    getAllAdmins,
    hasRole,
    isAdmin,
    canApproveForGroup,
    getApprovalGroups,
    assignRole,
    updateRoleGroups,
    addGroupsToRole,
    removeGroupsFromRole,
    revokeRole,
    revokeAllUserRoles,
    removeGroupFromAllRoles,
    getRoleById,
    getStats
};
