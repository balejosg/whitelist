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
 * User Management Routes
 * Admin-only CRUD operations for users
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const userStorage = require('../lib/user-storage');
const roleStorage = require('../lib/role-storage');
const auth = require('../lib/auth');

// =============================================================================
// Rate Limiting
// =============================================================================

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// =============================================================================
// Middleware
// =============================================================================

/**
 * Require authentication (JWT or legacy ADMIN_TOKEN)
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required',
            code: 'MISSING_TOKEN'
        });
    }

    const token = authHeader.slice(7);

    // Try JWT first (async for Redis blacklist support)
    const decoded = await auth.verifyAccessToken(token);
    if (decoded) {
        req.user = decoded;
        return next();
    }

    // Fall back to legacy ADMIN_TOKEN
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
        req.user = auth.createLegacyAdminPayload();
        return next();
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
    });
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
    if (!auth.isAdminToken(req.user)) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required',
            code: 'FORBIDDEN'
        });
    }
    next();
}

// =============================================================================
// User Routes
// =============================================================================

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get('/', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    try {
        const users = userStorage.getAllUsers();
        const stats = userStorage.getStats();

        // Enrich with role info
        const enrichedUsers = users.map(user => {
            const roles = roleStorage.getUserRoles(user.id);
            return {
                ...user,
                roles: roles.map(r => ({
                    id: r.id,
                    role: r.role,
                    groupIds: r.groupIds
                }))
            };
        });

        res.json({
            success: true,
            stats,
            users: enrichedUsers
        });

    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list users',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/users/:id
 * Get user details (admin only)
 */
router.get('/:id', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const user = userStorage.getUserById(req.params.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    // Get roles
    const roles = roleStorage.getUserRoles(user.id);

    res.json({
        success: true,
        user: {
            ...user,
            roles: roles.map(r => ({
                id: r.id,
                role: r.role,
                groupIds: r.groupIds,
                createdAt: r.createdAt
            }))
        }
    });
});

/**
 * POST /api/users
 * Create a new user (admin only)
 */
router.post('/', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
    const { email, name, password, role, groupIds } = req.body;

    // Validate required fields
    if (!email || !name || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email, name, and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    // Check if email already exists
    if (userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        // Create user
        const user = await userStorage.createUser({ email, name, password });

        // Assign role if provided
        if (role) {
            roleStorage.assignRole({
                userId: user.id,
                role,
                groupIds: groupIds || [],
                createdBy: req.user.sub
            });
        }

        // Get updated roles
        const roles = roleStorage.getUserRoles(user.id);

        res.status(201).json({
            success: true,
            user: {
                ...user,
                roles: roles.map(r => ({
                    id: r.id,
                    role: r.role,
                    groupIds: r.groupIds
                }))
            }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * PATCH /api/users/:id
 * Update user (admin only)
 */
router.patch('/:id', adminLimiter, requireAuth, requireAdmin, async (req, res) => {
    const { name, email, isActive, emailVerified, password } = req.body;

    const user = userStorage.getUserById(req.params.id);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    // Check email uniqueness if changing
    if (email && email !== user.email && userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (isActive !== undefined) updates.isActive = isActive;
        if (emailVerified !== undefined) updates.emailVerified = emailVerified;
        if (password !== undefined) updates.password = password;

        const updated = await userStorage.updateUser(req.params.id, updates);

        // Get roles
        const roles = roleStorage.getUserRoles(updated.id);

        res.json({
            success: true,
            user: {
                ...updated,
                roles: roles.map(r => ({
                    id: r.id,
                    role: r.role,
                    groupIds: r.groupIds
                }))
            }
        });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const user = userStorage.getUserById(req.params.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    // Don't allow deleting yourself
    if (req.user.sub === req.params.id) {
        return res.status(400).json({
            success: false,
            error: 'Cannot delete your own account',
            code: 'SELF_DELETE'
        });
    }

    try {
        // Revoke all roles first
        roleStorage.revokeAllUserRoles(req.params.id, req.user.sub);

        // Delete user
        userStorage.deleteUser(req.params.id);

        res.json({
            success: true,
            message: 'User deleted'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user',
            code: 'SERVER_ERROR'
        });
    }
});

// =============================================================================
// Role Management Routes (nested under users)
// =============================================================================

/**
 * GET /api/users/:id/roles
 * List roles for a user (admin only)
 */
router.get('/:id/roles', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const user = userStorage.getUserById(req.params.id);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    const roles = roleStorage.getUserRoles(req.params.id);

    res.json({
        success: true,
        userId: req.params.id,
        roles
    });
});

/**
 * POST /api/users/:id/roles
 * Assign a role to user (admin only)
 */
router.post('/:id/roles', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const { role, groupIds } = req.body;

    const user = userStorage.getUserById(req.params.id);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    if (!role) {
        return res.status(400).json({
            success: false,
            error: 'Role is required',
            code: 'MISSING_ROLE'
        });
    }

    // Validate role
    if (!roleStorage.VALID_ROLES.includes(role)) {
        return res.status(400).json({
            success: false,
            error: `Invalid role. Must be one of: ${roleStorage.VALID_ROLES.join(', ')}`,
            code: 'INVALID_ROLE'
        });
    }

    // Teachers must have groups
    if (role === 'teacher' && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({
            success: false,
            error: 'Teachers must be assigned to at least one group',
            code: 'MISSING_GROUPS'
        });
    }

    try {
        const newRole = roleStorage.assignRole({
            userId: req.params.id,
            role,
            groupIds: groupIds || [],
            createdBy: req.user.sub
        });

        // Also ensure user is active
        if (!user.isActive) {
            userStorage.updateUser(req.params.id, { isActive: true });
        }

        res.status(201).json({
            success: true,
            message: `Role '${role}' assigned to user`,
            role: newRole
        });

    } catch (error) {
        console.error('Error assigning role:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to assign role',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * PATCH /api/users/:id/roles/:roleId
 * Update role groups (admin only)
 */
router.patch('/:id/roles/:roleId', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const { groupIds, addGroups, removeGroups } = req.body;

    const role = roleStorage.getRoleById(req.params.roleId);
    if (!role || role.userId !== req.params.id) {
        return res.status(404).json({
            success: false,
            error: 'Role not found',
            code: 'NOT_FOUND'
        });
    }

    try {
        let updated;

        if (groupIds !== undefined) {
            // Replace all groups
            updated = roleStorage.updateRoleGroups(req.params.roleId, groupIds);
        } else if (addGroups) {
            // Add groups
            updated = roleStorage.addGroupsToRole(req.params.roleId, addGroups);
        } else if (removeGroups) {
            // Remove groups
            updated = roleStorage.removeGroupsFromRole(req.params.roleId, removeGroups);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Provide groupIds, addGroups, or removeGroups',
                code: 'MISSING_FIELDS'
            });
        }

        res.json({
            success: true,
            role: updated
        });

    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update role',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * DELETE /api/users/:id/roles/:roleId
 * Revoke a role (admin only)
 */
router.delete('/:id/roles/:roleId', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const role = roleStorage.getRoleById(req.params.roleId);

    if (!role || role.userId !== req.params.id) {
        return res.status(404).json({
            success: false,
            error: 'Role not found',
            code: 'NOT_FOUND'
        });
    }

    if (role.revokedAt) {
        return res.status(400).json({
            success: false,
            error: 'Role already revoked',
            code: 'ALREADY_REVOKED'
        });
    }

    try {
        roleStorage.revokeRole(req.params.roleId, req.user.sub);

        res.json({
            success: true,
            message: 'Role revoked'
        });

    } catch (error) {
        console.error('Error revoking role:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke role',
            code: 'SERVER_ERROR'
        });
    }
});

// =============================================================================
// Aggregate Routes
// =============================================================================

/**
 * GET /api/users/roles/teachers
 * List all teachers with their groups (admin only)
 */
router.get('/roles/teachers', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    try {
        const teachers = roleStorage.getAllTeachers();

        // Enrich with user info
        const enriched = teachers.map(t => {
            const user = userStorage.getUserById(t.userId);
            return {
                ...t,
                user: user ? {
                    id: user.id,
                    email: user.email,
                    name: user.name
                } : null
            };
        });

        res.json({
            success: true,
            teachers: enriched
        });

    } catch (error) {
        console.error('Error listing teachers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list teachers',
            code: 'SERVER_ERROR'
        });
    }
});

module.exports = router;
