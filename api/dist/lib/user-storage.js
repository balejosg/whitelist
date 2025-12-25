/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * User Storage - JSON file-based user management
 * Stores users in data/users.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
// =============================================================================
// Constants
// =============================================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BCRYPT_ROUNDS = 12;
// =============================================================================
// Initialization
// =============================================================================
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// Initialize empty users file if not exists
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}
// =============================================================================
// Internal Functions
// =============================================================================
/**
 * Load all users from file
 */
function loadData() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error loading users:', error);
        return { users: [] };
    }
}
/**
 * Save data to file
 */
function saveData(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}
/**
 * Remove sensitive fields from user object
 */
function sanitizeUser(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        active: user.isActive,
        created_at: user.createdAt,
        updated_at: user.updatedAt
    };
}
/**
 * Convert StoredUser to User type (includes password_hash)
 */
function toUserType(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        password_hash: user.passwordHash,
        active: user.isActive,
        created_at: user.createdAt,
        updated_at: user.updatedAt
    };
}
// =============================================================================
// Public API
// =============================================================================
/**
 * Get all users (without password hashes)
 */
export function getAllUsers() {
    const data = loadData();
    return data.users.map(sanitizeUser);
}
/**
 * Get user by ID
 */
export function getUserById(id) {
    const data = loadData();
    const user = data.users.find((u) => u.id === id);
    return user ? toUserType(user) : null;
}
/**
 * Get user by email (for authentication, includes password hash)
 */
export function getUserByEmail(email) {
    const data = loadData();
    const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? toUserType(user) : null;
}
/**
 * Check if email already exists
 */
export function emailExists(email) {
    const data = loadData();
    return data.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
}
/**
 * Create a new user
 */
export async function createUser(userData) {
    const data = loadData();
    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);
    const newUser = {
        id: `user_${uuidv4().slice(0, 8)}`,
        email: userData.email.toLowerCase().trim(),
        name: userData.name.trim(),
        passwordHash,
        emailVerified: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null
    };
    data.users.push(newUser);
    saveData(data);
    return sanitizeUser(newUser);
}
/**
 * Update a user
 */
export async function updateUser(id, updates) {
    const data = loadData();
    const index = data.users.findIndex((u) => u.id === id);
    if (index === -1) {
        return null;
    }
    const existingUser = data.users[index];
    if (!existingUser) {
        return null;
    }
    // Build updated user
    const updatedUser = {
        ...existingUser,
        updatedAt: new Date().toISOString()
    };
    // Apply updates
    if (updates.email !== undefined) {
        updatedUser.email = updates.email.toLowerCase().trim();
    }
    if (updates.name !== undefined) {
        updatedUser.name = updates.name.trim();
    }
    if (updates.password !== undefined) {
        updatedUser.passwordHash = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    }
    if (updates.active !== undefined) {
        updatedUser.isActive = updates.active;
    }
    data.users[index] = updatedUser;
    saveData(data);
    return sanitizeUser(updatedUser);
}
/**
 * Update last login timestamp
 */
export function updateLastLogin(id) {
    const data = loadData();
    const index = data.users.findIndex((u) => u.id === id);
    if (index !== -1) {
        const user = data.users[index];
        if (user) {
            user.lastLoginAt = new Date().toISOString();
            saveData(data);
        }
    }
}
/**
 * Delete a user
 */
export function deleteUser(id) {
    const data = loadData();
    const initialLength = data.users.length;
    data.users = data.users.filter((u) => u.id !== id);
    if (data.users.length < initialLength) {
        saveData(data);
        return true;
    }
    return false;
}
/**
 * Verify email
 */
export function verifyEmail(id) {
    const data = loadData();
    const index = data.users.findIndex((u) => u.id === id);
    if (index === -1) {
        return false;
    }
    const user = data.users[index];
    if (user) {
        user.emailVerified = true;
        user.updatedAt = new Date().toISOString();
        saveData(data);
        return true;
    }
    return false;
}
/**
 * Verify password for a user
 */
export async function verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
}
/**
 * Verify password by email - gets user and verifies password
 * Returns user with extra fields for route compatibility, or null if invalid
 */
export async function verifyPasswordByEmail(email, password) {
    const data = loadData();
    const storedUser = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!storedUser) {
        return null;
    }
    const isValid = await bcrypt.compare(password, storedUser.passwordHash);
    if (!isValid) {
        return null;
    }
    // Return user with all fields needed by routes
    return {
        id: storedUser.id,
        email: storedUser.email,
        name: storedUser.name,
        password_hash: storedUser.passwordHash,
        active: storedUser.isActive,
        isActive: storedUser.isActive,
        emailVerified: storedUser.emailVerified,
        created_at: storedUser.createdAt,
        updated_at: storedUser.updatedAt
    };
}
/**
 * Get user statistics
 */
export function getStats() {
    const data = loadData();
    return {
        total: data.users.length,
        active: data.users.filter((u) => u.isActive).length,
        verified: data.users.filter((u) => u.emailVerified).length
    };
}
// =============================================================================
// Storage Instance
// =============================================================================
export const userStorage = {
    getAllUsers,
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    deleteUser,
    verifyPassword
};
export default userStorage;
//# sourceMappingURL=user-storage.js.map