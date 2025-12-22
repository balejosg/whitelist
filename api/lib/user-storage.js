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
 * User Storage - JSON file-based user management
 * Stores users in data/users.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty users file if not exists
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}

// =============================================================================
// Data Access
// =============================================================================

/**
 * Load all users from file
 * @returns {Object} { users: Array }
 */
function loadData() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading users:', error);
        return { users: [] };
    }
}

/**
 * Save data to file
 * @param {Object} data 
 */
function saveData(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// =============================================================================
// User CRUD Operations
// =============================================================================

/**
 * Get all users (without password hashes)
 * @returns {Array}
 */
function getAllUsers() {
    const data = loadData();
    return data.users.map(sanitizeUser);
}

/**
 * Get user by ID
 * @param {string} id 
 * @returns {Object|null}
 */
function getUserById(id) {
    const data = loadData();
    const user = data.users.find(u => u.id === id);
    return user ? sanitizeUser(user) : null;
}

/**
 * Get user by email (for authentication, includes password hash)
 * @param {string} email 
 * @returns {Object|null}
 */
function getUserByEmail(email) {
    const data = loadData();
    return data.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

/**
 * Check if email already exists
 * @param {string} email 
 * @returns {boolean}
 */
function emailExists(email) {
    const data = loadData();
    return data.users.some(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Create a new user
 * @param {Object} userData - { email, name, password }
 * @returns {Object} - The created user (without password)
 */
async function createUser(userData) {
    const data = loadData();

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, 12);

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
 * @param {string} id 
 * @param {Object} updates - Fields to update
 * @returns {Object|null}
 */
async function updateUser(id, updates) {
    const data = loadData();
    const index = data.users.findIndex(u => u.id === id);

    if (index === -1) {
        return null;
    }

    // Handle password update
    if (updates.password) {
        updates.passwordHash = await bcrypt.hash(updates.password, 12);
        delete updates.password;
    }

    // Prevent updating sensitive fields directly
    delete updates.id;
    delete updates.createdAt;

    data.users[index] = {
        ...data.users[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };

    saveData(data);
    return sanitizeUser(data.users[index]);
}

/**
 * Update last login timestamp
 * @param {string} id 
 */
function updateLastLogin(id) {
    const data = loadData();
    const index = data.users.findIndex(u => u.id === id);

    if (index !== -1) {
        data.users[index].lastLoginAt = new Date().toISOString();
        saveData(data);
    }
}

/**
 * Delete a user
 * @param {string} id 
 * @returns {boolean}
 */
function deleteUser(id) {
    const data = loadData();
    const initialLength = data.users.length;
    data.users = data.users.filter(u => u.id !== id);

    if (data.users.length < initialLength) {
        saveData(data);
        return true;
    }
    return false;
}

/**
 * Verify email
 * @param {string} id 
 * @returns {boolean}
 */
function verifyEmail(id) {
    const data = loadData();
    const index = data.users.findIndex(u => u.id === id);

    if (index === -1) {
        return false;
    }

    data.users[index].emailVerified = true;
    data.users[index].updatedAt = new Date().toISOString();
    saveData(data);
    return true;
}

// =============================================================================
// Authentication Helpers
// =============================================================================

/**
 * Verify password for a user
 * @param {string} email 
 * @param {string} password 
 * @returns {Object|null} User if valid, null if invalid
 */
async function verifyPassword(email, password) {
    const user = getUserByEmail(email);

    if (!user || !user.isActive) {
        return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (isValid) {
        updateLastLogin(user.id);
        return sanitizeUser(user);
    }

    return null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Remove sensitive fields from user object
 * @param {Object} user 
 * @returns {Object}
 */
function sanitizeUser(user) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
}

/**
 * Get user statistics
 * @returns {Object}
 */
function getStats() {
    const data = loadData();
    return {
        total: data.users.length,
        active: data.users.filter(u => u.isActive).length,
        verified: data.users.filter(u => u.emailVerified).length
    };
}

module.exports = {
    getAllUsers,
    getUserById,
    getUserByEmail,
    emailExists,
    createUser,
    updateUser,
    updateLastLogin,
    deleteUser,
    verifyEmail,
    verifyPassword,
    getStats
};
