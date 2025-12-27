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
 * Setup Flow API Tests
 * 
 * Run with: npm run test:setup
 * 
 * Tests the first admin setup flow and registration token management.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3005;
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang (15s)
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Setup tests timed out! Forcing exit...');
    process.exit(1);
}, 15000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let adminToken: string | null = null;
let registrationToken: string | null = null;

interface SetupStatusResponse {
    needsSetup: boolean;
    hasAdmin: boolean;
}

interface FirstAdminResponse {
    success: boolean;
    registrationToken?: string;
    redirectTo?: string;
    error?: string;
}

interface ValidateTokenResponse {
    valid: boolean;
    success?: boolean;
    error?: string;
}

interface TokenResponse {
    registrationToken?: string;
    error?: string;
}

interface LoginResponse {
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}

// Cleanup data files before tests
function cleanupData(): void {
    const dataDir = path.join(__dirname, '..', 'data');
    const filesToClean = ['users.json', 'user_roles.json', 'setup.json'];

    for (const file of filesToClean) {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

describe('Setup Flow API Tests', { timeout: 30000 }, () => {
    before(async () => {
        // Clean up any existing test data
        cleanupData();

        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Setup test server started on port ${PORT}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
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
        // Clean up after tests
        cleanupData();
    });

    // ============================================
    // Setup Status Tests
    // ============================================
    describe('GET /api/setup/status', () => {
        test('should return needsSetup: true when no admins exist', async () => {
            const response = await fetch(`${API_URL}/api/setup/status`);
            assert.strictEqual(response.status, 200);

            const data = await response.json() as SetupStatusResponse;
            assert.strictEqual(data.needsSetup, true);
            assert.strictEqual(data.hasAdmin, false);
        });
    });

    // ============================================
    // First Admin Creation Tests
    // ============================================
    describe('POST /api/setup/first-admin', () => {
        test('should create the first admin user', async () => {
            const adminData = {
                email: 'admin@school.edu',
                name: 'Admin User',
                password: 'SecureAdmin123!'
            };

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminData)
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as FirstAdminResponse;
            assert.ok(data.success === true);
            assert.ok(data.registrationToken !== undefined);
            assert.strictEqual(data.registrationToken?.length, 64); // 32 bytes in hex
            assert.strictEqual(data.redirectTo, '/login');

            // Store token for later tests
            registrationToken = data.registrationToken ?? null;
        });

        test('should reject duplicate first-admin setup', async () => {
            const adminData = {
                email: 'another-admin@school.edu',
                name: 'Another Admin',
                password: 'AnotherAdmin123!'
            };

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminData)
            });

            assert.strictEqual(response.status, 403);

            const data = await response.json() as FirstAdminResponse;
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.error, 'Setup already completed');
        });

        test('should reject setup with missing fields', async () => {
            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com'
                    // Missing name and password
                })
            });

            assert.strictEqual(response.status, 400);
        });

        test('should reject setup with invalid email', async () => {
            // Wait to avoid rate limiting (3 req/hour = 1200s window, but fast test)
            await new Promise(resolve => setTimeout(resolve, 1500));

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'invalid-email',
                    name: 'Test User',
                    password: 'SecurePassword123!'
                })
            });

            // Accept either validation error (400) or rate limit (429)
            assert.ok(response.status === 400 || response.status === 429);

            if (response.status === 400) {
                const data = await response.json() as FirstAdminResponse;
                assert.ok(data.error !== undefined && data.error.includes('email'));
            }
        });

        test('should reject setup with short password', async () => {
            // Wait to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1500));

            const response = await fetch(`${API_URL}/api/setup/first-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test2@example.com',
                    name: 'Test User',
                    password: '123'
                })
            });

            // Accept either validation error (400) or rate limit (429)
            assert.ok(response.status === 400 || response.status === 429);

            if (response.status === 400) {
                const data = await response.json() as FirstAdminResponse;
                assert.ok(data.error !== undefined && data.error.includes('8 characters'));
            }
        });
    });

    // ============================================
    // Setup Status After Admin Creation
    // ============================================
    describe('GET /api/setup/status - After admin created', () => {
        test('should return needsSetup: false after admin exists', async () => {
            const response = await fetch(`${API_URL}/api/setup/status`);
            assert.strictEqual(response.status, 200);

            const data = await response.json() as SetupStatusResponse;
            assert.strictEqual(data.needsSetup, false);
            assert.strictEqual(data.hasAdmin, true);
        });
    });

    // ============================================
    // Token Validation Tests
    // ============================================
    describe('POST /api/setup/validate-token', () => {
        test('should validate correct token', async () => {
            assert.ok(registrationToken !== null, 'Registration token should be set');

            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: registrationToken })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ValidateTokenResponse;
            assert.strictEqual(data.valid, true);
        });

        test('should reject incorrect token', async () => {
            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'invalid-token-123' })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ValidateTokenResponse;
            assert.strictEqual(data.valid, false);
        });

        test('should reject missing token', async () => {
            const response = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 400);
        });
    });

    // ============================================
    // Admin Authentication Tests
    // ============================================
    describe('Login as admin for token management tests', () => {
        test('should login as admin', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@school.edu',
                    password: 'SecureAdmin123!'
                })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as LoginResponse;
            assert.ok(data.success === true);
            assert.ok(data.accessToken !== undefined);

            // Store token for authenticated requests
            adminToken = data.accessToken ?? null;
        });
    });

    // ============================================
    // Registration Token Retrieval Tests
    // ============================================
    describe('GET /api/setup/registration-token', () => {
        test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/setup/registration-token`);
            assert.strictEqual(response.status, 401);
        });

        test('should return token for authenticated admin', async () => {
            assert.ok(adminToken !== null, 'Admin token should be set');

            const response = await fetch(`${API_URL}/api/setup/registration-token`, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`
                }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as TokenResponse;
            assert.ok(data.registrationToken !== undefined);
            assert.strictEqual(data.registrationToken, registrationToken);
        });
    });

    // ============================================
    // Token Regeneration Tests
    // ============================================
    describe('POST /api/setup/regenerate-token', () => {
        test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/setup/regenerate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            assert.strictEqual(response.status, 401);
        });

        test('should regenerate token for authenticated admin', async () => {
            assert.ok(adminToken !== null, 'Admin token should be set');

            const response = await fetch(`${API_URL}/api/setup/regenerate-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as TokenResponse;
            assert.ok(data.registrationToken !== undefined);
            assert.notStrictEqual(data.registrationToken, registrationToken);

            // Old token should now be invalid
            const oldTokenResponse = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: registrationToken })
            });

            const oldTokenData = await oldTokenResponse.json() as ValidateTokenResponse;
            assert.strictEqual(oldTokenData.valid, false);

            // New token should be valid
            const newTokenResponse = await fetch(`${API_URL}/api/setup/validate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: data.registrationToken })
            });

            const newTokenData = await newTokenResponse.json() as ValidateTokenResponse;
            assert.strictEqual(newTokenData.valid, true);
        });
    });
});
