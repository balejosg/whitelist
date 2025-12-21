/**
 * Authentication & User Management API Tests
 * 
 * Run with: npm run test:auth
 * 
 * These tests run on a separate port (3001) to avoid conflicts with the main tests.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

const PORT = 3001;
const API_URL = `http://localhost:${PORT}`;

let server;
let testUserToken = null;

describe('Authentication & User Management API Tests', { timeout: 30000 }, () => {
    before(async () => {
        process.env.PORT = PORT;
        const { app } = require('../server.js');

        server = app.listen(PORT, () => {
            console.log(`Auth test server started on port ${PORT}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1500));
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => {
                server.close(() => {
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

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.user);
            assert.ok(data.user.id);
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

            assert.strictEqual(response.status, 409);
        });
    });

    // ============================================
    // Login Tests
    // ============================================
    describe('POST /api/auth/login - User Login', () => {
        const testEmail = `login-test-${Date.now()}@example.com`;
        const testPassword = 'SecurePassword123!';

        before(async () => {
            await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testEmail,
                    password: testPassword,
                    name: 'Login Test User'
                })
            });
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

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.accessToken);
            assert.ok(data.refreshToken);
            assert.ok(data.user);

            testUserToken = data.accessToken;
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
        let refreshToken = null;

        before(async () => {
            const email = `refresh-test-${Date.now()}@example.com`;

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

            const data = await loginResponse.json();
            refreshToken = data.refreshToken;
        });

        test('should refresh tokens with valid refresh token', async () => {
            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.accessToken);
            assert.ok(data.refreshToken);
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
