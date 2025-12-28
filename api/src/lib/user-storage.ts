/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * User Storage - PostgreSQL-based user management
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
import type { User, SafeUser } from '../types/index.js';
import type { IUserStorage, CreateUserData, UpdateUserData } from '../types/storage.js';

const BCRYPT_ROUNDS = 12;

// =============================================================================
// Types
// =============================================================================

interface DBUser {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: string;
    updated_at: string;
}

interface UserStats {
    total: number;
    active: number;
    verified: number;
}

// Extended user type for routes
interface StoredUserResult extends User {
    isActive: boolean;
    emailVerified: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function sanitizeUser(user: DBUser): SafeUser {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        active: true,
        created_at: user.created_at,
        updated_at: user.updated_at
    };
}

function toUserType(user: DBUser): User {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        password_hash: user.password_hash,
        active: true,
        created_at: user.created_at,
        updated_at: user.updated_at
    };
}

// =============================================================================
// Public API
// =============================================================================

export async function getAllUsers(): Promise<SafeUser[]> {
    const result = await query<DBUser>(
        'SELECT id, email, name, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return result.rows.map(sanitizeUser);
}

export async function getUserById(id: string): Promise<User | null> {
    const result = await query<DBUser>(
        'SELECT * FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] ? toUserType(result.rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const result = await query<DBUser>(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
    );
    return result.rows[0] ? toUserType(result.rows[0]) : null;
}

export async function emailExists(email: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)) as exists',
        [email]
    );
    return result.rows[0]?.exists ?? false;
}

export async function createUser(userData: CreateUserData): Promise<SafeUser> {
    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);
    const id = `user_${uuidv4().slice(0, 8)}`;

    const result = await query<DBUser>(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, created_at, updated_at`,
        [id, userData.email.toLowerCase().trim(), userData.name.trim(), passwordHash]
    );

    const user = result.rows[0];
    if (!user) {
        throw new Error('Failed to create user');
    }

    return sanitizeUser(user);
}

export async function updateUser(
    id: string,
    updates: UpdateUserData
): Promise<SafeUser | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.email !== undefined) {
        setClauses.push(`email = $${paramIndex++}`);
        values.push(updates.email.toLowerCase().trim());
    }
    if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(updates.name.trim());
    }
    if (updates.password !== undefined) {
        const passwordHash = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
        setClauses.push(`password_hash = $${paramIndex++}`);
        values.push(passwordHash);
    }

    if (setClauses.length === 0) {
        // No updates, just return existing user
        const result = await query<DBUser>(
            'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] ? sanitizeUser(result.rows[0]) : null;
    }

    values.push(id);
    const result = await query<DBUser>(
        `UPDATE users SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, email, name, created_at, updated_at`,
        values
    );

    return result.rows[0] ? sanitizeUser(result.rows[0]) : null;
}

export async function updateLastLogin(id: string): Promise<void> {
    await query(
        'UPDATE users SET updated_at = NOW() WHERE id = $1',
        [id]
    );
}

export async function deleteUser(id: string): Promise<boolean> {
    const result = await query(
        'DELETE FROM users WHERE id = $1',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function verifyEmail(id: string): Promise<boolean> {
    const result = await query(
        'UPDATE users SET updated_at = NOW() WHERE id = $1',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function verifyPassword(
    user: User,
    password: string
): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
}

export async function verifyPasswordByEmail(
    email: string,
    password: string
): Promise<StoredUserResult | null> {
    const result = await query<DBUser>(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
    );

    const user = result.rows[0];
    if (!user) {
        return null;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        return null;
    }

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        password_hash: user.password_hash,
        active: true,
        isActive: true,
        emailVerified: false,
        created_at: user.created_at,
        updated_at: user.updated_at
    };
}

export async function getStats(): Promise<UserStats> {
    const result = await query<{ total: string }>(
        'SELECT COUNT(*) as total FROM users'
    );
    const total = parseInt(result.rows[0]?.total ?? '0', 10);

    return {
        total,
        active: total,
        verified: 0
    };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const userStorage: IUserStorage = {
    getAllUsers,
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    deleteUser,
    verifyPassword
};

export default userStorage;
