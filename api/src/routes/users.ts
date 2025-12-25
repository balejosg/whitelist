/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * User Management Routes
 * Admin-only CRUD operations for users
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';
import type { DecodedWithRoles } from '../lib/auth.js';

// =============================================================================
// Types
// =============================================================================

interface RequestWithUser extends Request {
    user?: DecodedWithRoles;
}

interface CreateUserBody {
    email: string;
    name: string;
    password: string;
    role?: string;
    groupIds?: string[];
}

interface UpdateUserBody {
    name?: string;
    email?: string;
    isActive?: boolean;
    emailVerified?: boolean;
    password?: string;
}

interface AssignRoleBody {
    role: string;
    groupIds?: string[];
}

interface UpdateRoleBody {
    groupIds?: string[];
    addGroups?: string[];
    removeGroups?: string[];
}

// =============================================================================
// Security Utilities
// =============================================================================

function timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

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

async function requireAuth(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            success: false,
            error: 'Authorization header required',
            code: 'MISSING_TOKEN'
        });
        return;
    }

    const token = authHeader.slice(7);

    const decoded = await auth.verifyAccessToken(token);
    if (decoded) {
        req.user = decoded;
        next();
        return;
    }

    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && timingSafeEqual(token, adminToken)) {
        req.user = auth.createLegacyAdminPayload();
        next();
        return;
    }

    res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
    });
}

function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction): void {
    if (!req.user || !auth.isAdminToken(req.user)) {
        res.status(403).json({
            success: false,
            error: 'Admin access required',
            code: 'FORBIDDEN'
        });
        return;
    }
    next();
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

/**
 * GET /api/users
 */
router.get('/', adminLimiter, requireAuth, requireAdmin, (_req: Request, res: Response) => {
    try {
        const users = userStorage.getAllUsers();
        const stats = userStorage.getStats();

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
 * GET /api/users/roles/teachers
 */
router.get('/roles/teachers', adminLimiter, requireAuth, requireAdmin, (_req: Request, res: Response) => {
    try {
        const teachers = roleStorage.getAllTeachers();

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

/**
 * GET /api/users/:id
 */
router.get('/:id', adminLimiter, requireAuth, requireAdmin, (req: Request, res: Response) => {
    const user = userStorage.getUserById(req.params.id!);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

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
 */
router.post('/', adminLimiter, requireAuth, requireAdmin, async (req: RequestWithUser, res: Response) => {
    const { email, name, password, role, groupIds } = req.body as CreateUserBody;

    if (!email || !name || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email, name, and password are required',
            code: 'MISSING_FIELDS'
        });
    }

    if (userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        const user = await userStorage.createUser({ email, name, password });

        if (role && req.user) {
            roleStorage.assignRole({
                userId: user.id,
                role: role as import('../types/index.js').UserRole,
                groups: groupIds ?? [],
                createdBy: req.user.sub
            });
        }

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
 */
router.patch('/:id', adminLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const { name, email, isActive, emailVerified, password } = req.body as UpdateUserBody;

    const user = userStorage.getUserById(req.params.id!);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    if (email && email !== user.email && userStorage.emailExists(email)) {
        return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_EXISTS'
        });
    }

    try {
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (isActive !== undefined) updates.isActive = isActive;
        if (emailVerified !== undefined) updates.emailVerified = emailVerified;
        if (password !== undefined) updates.password = password;

        const updated = await userStorage.updateUser(req.params.id!, updates);

        if (!updated) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update user',
                code: 'SERVER_ERROR'
            });
        }

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
 */
router.delete('/:id', adminLimiter, requireAuth, requireAdmin, (req: RequestWithUser, res: Response) => {
    const user = userStorage.getUserById(req.params.id!);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    if (req.user?.sub === req.params.id) {
        return res.status(400).json({
            success: false,
            error: 'Cannot delete your own account',
            code: 'SELF_DELETE'
        });
    }

    try {
        roleStorage.revokeAllUserRoles(req.params.id!, req.user?.sub);
        userStorage.deleteUser(req.params.id!);

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

/**
 * GET /api/users/:id/roles
 */
router.get('/:id/roles', adminLimiter, requireAuth, requireAdmin, (req: Request, res: Response) => {
    const user = userStorage.getUserById(req.params.id!);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'NOT_FOUND'
        });
    }

    const roles = roleStorage.getUserRoles(req.params.id!);

    res.json({
        success: true,
        userId: req.params.id,
        roles
    });
});

/**
 * POST /api/users/:id/roles
 */
router.post('/:id/roles', adminLimiter, requireAuth, requireAdmin, (req: RequestWithUser, res: Response) => {
    const { role, groupIds } = req.body as AssignRoleBody;

    const user = userStorage.getUserById(req.params.id!);
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

    if (!roleStorage.VALID_ROLES.includes(role as import('../types/index.js').UserRole)) {
        return res.status(400).json({
            success: false,
            error: `Invalid role. Must be one of: ${roleStorage.VALID_ROLES.join(', ')}`,
            code: 'INVALID_ROLE'
        });
    }

    if (role === 'teacher' && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({
            success: false,
            error: 'Teachers must be assigned to at least one group',
            code: 'MISSING_GROUPS'
        });
    }

    try {
        const newRole = roleStorage.assignRole({
            userId: req.params.id!,
            role: role as import('../types/index.js').UserRole,
            groups: groupIds ?? [],
            createdBy: req.user?.sub ?? 'unknown'
        });

        if (!user.isActive) {
            userStorage.updateUser(req.params.id!, { active: true });
        }

        res.status(201).json({
            success: true,
            message: `Role '${role}' assigned to user`,
            role: newRole
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to assign role';
        console.error('Error assigning role:', error);
        res.status(500).json({
            success: false,
            error: message,
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * PATCH /api/users/:id/roles/:roleId
 */
router.patch('/:id/roles/:roleId', adminLimiter, requireAuth, requireAdmin, (req: Request, res: Response) => {
    const { groupIds, addGroups, removeGroups } = req.body as UpdateRoleBody;

    const role = roleStorage.getRoleById(req.params.roleId!);
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
            updated = roleStorage.updateRoleGroups(req.params.roleId!, groupIds);
        } else if (addGroups) {
            updated = roleStorage.addGroupsToRole(req.params.roleId!, addGroups);
        } else if (removeGroups) {
            updated = roleStorage.removeGroupsFromRole(req.params.roleId!, removeGroups);
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
 */
router.delete('/:id/roles/:roleId', adminLimiter, requireAuth, requireAdmin, (req: RequestWithUser, res: Response) => {
    const role = roleStorage.getRoleById(req.params.roleId!);

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
        roleStorage.revokeRole(req.params.roleId!, req.user?.sub);

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

export default router;
