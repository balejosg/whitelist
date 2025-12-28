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
 * Setup API Tests - First-time admin setup flow
 * 
 * Run with: npm run test:setup
 * 
 * These tests run on a separate port (3002) to avoid conflicts.
 * NOTE: These tests modify the data files, so they should run in isolation.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { getAvailablePort } from './test-utils.js';
import db from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PORT: number;
let API_URL: string;

// Data files to clean up
const DATA_DIR = path.join(__dirname, '..', 'data');
const SETUP_FILE = path.join(DATA_DIR, 'setup.json');
const ROLES_FILE = path.join(DATA_DIR, 'user_roles.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Backup original files
let originalRolesData: string | null = null;
let originalUsersData: string | null = null;
let originalSetupData: string | null = null;

// Global timeout - force exit if tests hang (20s)
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Setup tests timed out! Forcing exit...');
    process.exit(1);
}, 20000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

interface SetupStatusResponse {
    success: boolean;
    needsSetup: boolean;
    hasAdmin: boolean;
}

interface FirstAdminResponse {
    success: boolean;
    registrationToken?: string;
    redirectTo?: string;
    user?: { id: string; email: string; name: string };
    error?: string;
}

interface ValidateTokenResponse {
    success: boolean;
    valid: boolean;
}

function backupDataFiles(): void {
    if (fs.existsSync(ROLES_FILE)) {
        originalRolesData = fs.readFileSync(ROLES_FILE, 'utf-8');
    }
    if (fs.existsSync(USERS_FILE)) {
        originalUsersData = fs.readFileSync(USERS_FILE, 'utf-8');
    }
    if (fs.existsSync(SETUP_FILE)) {
        originalSetupData = fs.readFileSync(SETUP_FILE, 'utf-8');
    }
}

function restoreDataFiles(): void {
    if (originalRolesData !== null) {
        fs.writeFileSync(ROLES_FILE, originalRolesData);
    } else if (fs.existsSync(ROLES_FILE)) {
        fs.writeFileSync(ROLES_FILE, JSON.stringify({ roles: [] }, null, 2));
    }

    if (originalUsersData !== null) {
        fs.writeFileSync(USERS_FILE, originalUsersData);
    } else if (fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    }

    if (originalSetupData !== null) {
        fs.writeFileSync(SETUP_FILE, originalSetupData);
    } else if (fs.existsSync(SETUP_FILE)) {
        fs.unlinkSync(SETUP_FILE);
    }
}

function clearDataFiles(): void {
    fs.writeFileSync(ROLES_FILE, JSON.stringify({ roles: [] }, null, 2));
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    if (fs.existsSync(SETUP_FILE)) {
        fs.unlinkSync(SETUP_FILE);
    }
}

void describe('Setup API Tests', { timeout: 30000 }, async () => {
    before(async () => {
        // Backup existing data
        backupDataFiles();

        PORT = await getAvailablePort();
        API_URL = `http://localhost:${String(PORT)}`;
        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Setup test server started on port ${String(PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        // Restore original data
        restoreDataFiles();

        if (server !== undefined) {
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Setup test server closed');
                    resolve();
                });
            });
        }
        // Close database pool
        await db.close();
    });

    // ============================================
    // Setup Status Tests
    // ============================================
    await describe('GET /api/setup/status', async () => {
        beforeEach(() => {
            clearDataFiles();
        });

        await test('should return needsSetup: true when no admins exist', async () => {
            const response = await fetch(`${API_URL}/api/setup/status`);
            assert.strictEqual(response.status, 200);

            const data = await response.json() as SetupStatusResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.needsSetup, true);
            assert.strictEqual(data.hasAdmin, false);
        });
    });

    // ============================================
    // First Admin Creation Tests
    // ============================================
    await describe('POST /api/setup/first-admin', async () => {
        beforeEach(() => {
            clearDataFiles();
        });

        await test('should create first admin and return registration token', async () => {
            const adminData = {
                email: `setup-admin-${String(Date.now())}@example.com`,
                name: 'First Admin',
                password: 'SecurePassword123!'
            };

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminData)
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as FirstAdminResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.registrationToken?.length === 64);
            assert.strictEqual(data.redirectTo, '/login');
            assert.ok(data.user !== undefined);
            assert.strictEqual(data.user.email, adminData.email.toLowerCase());
        });

        await test('should return needsSetup: false after creating admin', async () => {
            // First create an admin
            const adminData = {
                email: `setup-admin-${String(Date.now())}@example.com`,
                name: 'First Admin',
                password: 'SecurePassword123!'
            };

            await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminData)
            });

            // Then check status
            const statusResponse = await fetch(`${API_URL}/api/setup/status`);
            const statusData = await statusResponse.json() as SetupStatusResponse;

            assert.strictEqual(statusData.needsSetup, false);
            assert.strictEqual(statusData.hasAdmin, true);
        });

        await test('should reject second admin creation with 403', async () => {
            // First create an admin
            const firstAdmin = {
                email: `first-admin-${String(Date.now())}@example.com`,
                name: 'First Admin',
                password: 'SecurePassword123!'
            };

            await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(firstAdmin)
            });

            // Try to create a second admin
            const secondAdmin = {
                email: `second-admin-${String(Date.now())}@example.com`,
                name: 'Second Admin',
                password: 'AnotherPassword123!'
            };

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(secondAdmin)
            });

            assert.strictEqual(response.status, 403);

            const data = await response.json() as FirstAdminResponse;
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.error, 'Setup already completed');
        });

        await test('should validate required fields', async () => {
            // Missing email
            const response1 = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Test', password: 'SecurePassword123!' })
            });
            assert.strictEqual(response1.status, 400);

            // Missing password
            const response2 = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', name: 'Test' })
            });
            assert.strictEqual(response2.status, 400);

            // Short password
            const response3 = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com', name: 'Test', password: '123' })
            });
            assert.strictEqual(response3.status, 400);
        });
    });

    // ============================================
    // Token Validation Tests
    // ============================================
    await describe('POST /api/setup/validate-token', async () => {
        let validToken: string;

        before(async () => {
            clearDataFiles();

            // Create first admin to get a valid token
            const adminData = {
                email: `token-test-admin-${String(Date.now())}@example.com`,
                name: 'Token Test Admin',
                password: 'SecurePassword123!'
            };

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminData)
            });

            const data = await response.json() as FirstAdminResponse;
            validToken = data.registrationToken ?? '';
        });

        await test('should validate correct token', async () => {
            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: validToken })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ValidateTokenResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.valid, true);
        });

        await test('should reject incorrect token', async () => {
            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'invalid-token-that-is-wrong' })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ValidateTokenResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.valid, false);
        });

        await test('should require token in request body', async () => {
            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 400);
        });
    });

    // ============================================
    // Admin Token Management Tests
    // ============================================
    await describe('GET /api/setup/registration-token', async () => {
        await test('should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/setup/registration-token`);
            assert.strictEqual(response.status, 401);
        });

        await test('should reject non-admin token', async () => {
            const response = await fetch(`${API_URL}/api/setup/registration-token`, {
                headers: { 'Authorization': 'Bearer invalid-token' }
            });
            assert.strictEqual(response.status, 401);
        });
    });

    await describe('POST /api/setup/regenerate-token', async () => {
        await test('should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/setup/regenerate-token`, {
                method: 'POST'
            });
            assert.strictEqual(response.status, 401);
        });

        await test('should reject non-admin token', async () => {
            const response = await fetch(`${API_URL}/api/setup/regenerate-token`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer invalid-token' }
            });
            assert.strictEqual(response.status, 401);
        });
    });
});
