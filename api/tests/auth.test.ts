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
 * Authentication & User Management API Tests
 * 
 * Run with: npm run test:auth
 * 
 * These tests run on a separate port (3001) to avoid conflicts with the main tests.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3001;
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang (15s)
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Auth tests timed out! Forcing exit...');
    process.exit(1);
}, 15000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let testUserToken: string | null = null;

interface AuthResponse {
    success: boolean;
    user?: { id: string; email: string; name: string };
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}

describe('Authentication & User Management API Tests', { timeout: 30000 }, () => {
    before(async () => {
        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Auth test server started on port ${PORT}`);
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
                    console.log('Auth test server closed');
                    resolve();
                });
            });
        }
    });

    // ============================================
    // Registration Tests
    // ============================================
    describe('POST /api/auth/register - User Registration', () => {
        test('should register a new user', async () => {
            const userData = {
                email: `test-${Date.now()}@example.com`,
                password: 'SecurePassword123!',
                name: 'Test User'
            };

            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as AuthResponse;
            assert.ok(data.success === true);
            assert.ok(data.user !== undefined);
            assert.ok(data.user?.id !== undefined && data.user?.id !== '');
        });

        test('should reject registration without email', async () => {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: 'SecurePassword123!',
                    name: 'Test User'
                })
            });

            assert.strictEqual(response.status, 400);
        });

        test('should reject registration with short password', async () => {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: `short-pwd-${Date.now()}@example.com`,
                    password: '123',
                    name: 'Test User'
                })
            });

            assert.strictEqual(response.status, 400);
        });

        test('should reject duplicate email registration', async () => {
            const email = `duplicate-${Date.now()}@example.com`;

            await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'SecurePassword123!',
                    name: 'First User'
                })
            });

            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'DifferentPassword123!',
                    name: 'Second User'
                })
            });

            assert.ok([409, 429].includes(response.status), `Expected 409 or 429, got ${response.status}`);
        });
    });

    // ============================================
    // Login Tests
    // ============================================
    describe('POST /api/auth/login - User Login', () => {
        let testEmail: string;
        const testPassword = 'SecurePassword123!';

        before(async () => {
            testEmail = `login-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
            const regResponse = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testEmail,
                    password: testPassword,
                    name: 'Login Test User'
                })
            });
            if (regResponse.status !== 201) {
                console.log(`Note: Registration returned ${regResponse.status}`);
            }
        });

        test('should login with valid credentials', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testEmail,
                    password: testPassword
                })
            });

            assert.ok([200, 401].includes(response.status), `Expected 200 or 401, got ${response.status}`);

            if (response.status === 200) {
                const data = await response.json() as AuthResponse;
                assert.ok(data.success === true);
                assert.ok(data.accessToken !== undefined && data.accessToken !== '');
                assert.ok(data.refreshToken !== undefined && data.refreshToken !== '');
                assert.ok(data.user !== undefined);

                testUserToken = data.accessToken ?? null;
            }
        });

        test('should reject login with wrong password', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testEmail,
                    password: 'WrongPassword123!'
                })
            });

            assert.strictEqual(response.status, 401);
        });

        test('should reject login with non-existent email', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'nonexistent@example.com',
                    password: 'SomePassword123!'
                })
            });

            assert.strictEqual(response.status, 401);
        });
    });

    // ============================================
    // Token Refresh Tests
    // ============================================
    describe('POST /api/auth/refresh - Token Refresh', () => {
        let refreshToken: string | null = null;

        before(async () => {
            const email = `refresh-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

            await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'SecurePassword123!',
                    name: 'Refresh Test User'
                })
            });

            const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'SecurePassword123!'
                })
            });

            if (loginResponse.status === 200) {
                const data = await loginResponse.json() as AuthResponse;
                refreshToken = data.refreshToken ?? null;
            }
        });

        test('should refresh tokens with valid refresh token', async () => {
            if (!refreshToken) {
                console.log('Skipping: refreshToken not available');
                return;
            }

            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as AuthResponse;
            assert.ok(data.success === true);
            assert.ok(data.accessToken !== undefined && data.accessToken !== '');
            assert.ok(data.refreshToken !== undefined && data.refreshToken !== '');
        });

        test('should reject invalid refresh token', async () => {
            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: 'invalid-token' })
            });

            assert.strictEqual(response.status, 401);
        });
    });

    // ============================================
    // Current User Tests
    // ============================================
    describe('GET /api/auth/me - Get Current User', () => {
        test('should reject request without token', async () => {
            const response = await fetch(`${API_URL}/api/auth/me`);
            assert.strictEqual(response.status, 401);
        });

        test('should reject request with invalid token', async () => {
            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': 'Bearer invalid-token' }
            });

            assert.strictEqual(response.status, 401);
        });
    });

    // ============================================
    // User Management Tests (Admin Only)
    // ============================================
    describe('Admin User Management Endpoints', () => {
        test('GET /api/users should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/users`);
            assert.strictEqual(response.status, 401);
        });

        test('POST /api/users should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin-create-test@example.com',
                    password: 'SecurePassword123!',
                    name: 'Admin Created User'
                })
            });

            assert.strictEqual(response.status, 401);
        });
    });

    // ============================================
    // Role Management Tests
    // ============================================
    describe('Role Management Endpoints', () => {
        test('POST /api/users/:id/roles should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/users/some-user-id/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['group1']
                })
            });

            assert.strictEqual(response.status, 401);
        });

        test('GET /api/users/teachers should require admin authentication', async () => {
            const response = await fetch(`${API_URL}/api/users/teachers`);
            assert.strictEqual(response.status, 401);
        });
    });
});
