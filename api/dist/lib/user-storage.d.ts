/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * User Storage - JSON file-based user management
 * Stores users in data/users.json
 */
import type { User, SafeUser } from '../types/index.js';
import type { IUserStorage, CreateUserData, UpdateUserData } from '../types/storage.js';
interface UserStats {
    total: number;
    active: number;
    verified: number;
}
/**
 * Get all users (without password hashes)
 */
export declare function getAllUsers(): SafeUser[];
/**
 * Get user by ID
 */
export declare function getUserById(id: string): User | null;
/**
 * Get user by email (for authentication, includes password hash)
 */
export declare function getUserByEmail(email: string): User | null;
/**
 * Check if email already exists
 */
export declare function emailExists(email: string): boolean;
/**
 * Create a new user
 */
export declare function createUser(userData: CreateUserData): Promise<SafeUser>;
/**
 * Update a user
 */
export declare function updateUser(id: string, updates: UpdateUserData): Promise<SafeUser | null>;
/**
 * Update last login timestamp
 */
export declare function updateLastLogin(id: string): void;
/**
 * Delete a user
 */
export declare function deleteUser(id: string): boolean;
/**
 * Verify email
 */
export declare function verifyEmail(id: string): boolean;
/**
 * Verify password for a user
 */
export declare function verifyPassword(user: User, password: string): Promise<boolean>;
/**
 * Verify password by email - gets user and verifies password
 * Returns user with extra fields for route compatibility, or null if invalid
 */
export declare function verifyPasswordByEmail(email: string, password: string): Promise<StoredUserResult | null>;
interface StoredUserResult extends User {
    isActive: boolean;
    emailVerified: boolean;
}
/**
 * Get user statistics
 */
export declare function getStats(): UserStats;
export declare const userStorage: IUserStorage;
export default userStorage;
//# sourceMappingURL=user-storage.d.ts.map