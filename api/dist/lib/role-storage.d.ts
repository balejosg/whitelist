/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Storage - JSON file-based role management
 * Stores user roles in data/user_roles.json
 */
import type { Role, UserRole } from '../types/index.js';
import type { IRoleStorage, AssignRoleData } from '../types/storage.js';
export declare const VALID_ROLES: readonly UserRole[];
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
/**
 * Get all active roles for a user
 */
export declare function getUserRoles(userId: string): StoredRole[];
/**
 * Get all users with a specific role
 */
export declare function getUsersByRole(role: UserRole): StoredRole[];
/**
 * Get all teachers with their assigned groups
 */
export declare function getAllTeachers(): TeacherInfo[];
/**
 * Get all admins
 */
export declare function getAllAdmins(): StoredRole[];
/**
 * Check if any admin exists in the system
 */
export declare function hasAnyAdmins(): boolean;
/**
 * Check if user has a specific role
 */
export declare function hasRole(userId: string, role: UserRole): boolean;
/**
 * Check if user is admin
 */
export declare function isAdmin(userId: string): boolean;
/**
 * Check if user can approve for a specific group
 */
export declare function canApproveForGroup(userId: string, groupId: string): boolean;
/**
 * Get groups user can approve for
 */
export declare function getApprovalGroups(userId: string): string[] | 'all';
/**
 * Assign a role to a user
 */
export declare function assignRole(roleData: AssignRoleData & {
    createdBy?: string;
}): StoredRole;
/**
 * Update groups for a teacher role
 */
export declare function updateRoleGroups(roleId: string, groupIds: string[]): StoredRole | null;
/**
 * Add groups to a teacher role
 */
export declare function addGroupsToRole(roleId: string, groupIds: string[]): StoredRole | null;
/**
 * Remove groups from a teacher role
 */
export declare function removeGroupsFromRole(roleId: string, groupIds: string[]): StoredRole | null;
/**
 * Revoke a role (soft delete)
 */
export declare function revokeRole(roleId: string, revokedBy?: string): StoredRole | null;
/**
 * Revoke all roles for a user
 */
export declare function revokeAllUserRoles(userId: string, revokedBy?: string): number;
/**
 * Remove all roles for a specific group
 */
export declare function removeGroupFromAllRoles(groupId: string): number;
/**
 * Get role by ID
 */
export declare function getRoleById(roleId: string): StoredRole | null;
/**
 * Get roles by user ID (for IRoleStorage interface)
 */
export declare function getRolesByUser(userId: string): Role[];
/**
 * Get users with a specific role (user IDs only)
 */
export declare function getUsersWithRole(role: UserRole): string[];
/**
 * Update role
 */
export declare function updateRole(roleId: string, data: Partial<Role>): Role | null;
/**
 * Get role statistics
 */
export declare function getStats(): RoleStats;
export declare const roleStorage: IRoleStorage;
export default roleStorage;
//# sourceMappingURL=role-storage.d.ts.map