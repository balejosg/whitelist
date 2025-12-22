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
 * Role Management E2E Tests
 * 
 * Tests for the Rol Profesor user story:
 * - Admin can assign teacher role
 * - Teacher can approve for assigned groups
 * - Teacher cannot approve for unassigned groups
 * - Admin can revoke role
 * 
 * Run with: npm run test:roles (or node --test tests/roles.test.js)
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');

const PORT = 3002;
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Tests timed out! Forcing exit...');
    process.exit(1);
}, 15000);
// Don't let this timer keep the process alive
GLOBAL_TIMEOUT.unref();


let server;
let adminToken = null;
let teacherToken = null;
let teacherUserId = null;


describe('Role Management E2E Tests', { timeout: 30000 }, () => {
    before(async () => {
        // Clear module cache to avoid port conflicts
        delete require.cache[require.resolve('../server.js')];

        process.env.PORT = PORT;
        process.env.ADMIN_TOKEN = 'test-admin-token';

        const { app } = require('../server.js');

        server = app.listen(PORT, () => {
            console.log(`Roles test server started on port ${PORT}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Use legacy admin token for setup
        adminToken = 'test-admin-token';
    });

    after(async () => {
        if (server) {
            if (server.closeAllConnections) {
                server.closeAllConnections();
            }
            await new Promise((resolve) => {
                server.close(() => {
                    console.log('Roles test server closed');
                    resolve();
                });
            });
        }
    });

    // ============================================
    // Setup: Create a teacher user
    // ============================================
    describe('Setup: Create Teacher User', () => {
        test('should create a new user for teacher role', async () => {
            const email = `teacher-${Date.now()}@school.edu`;

            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email,
                    password: 'TeacherPassword123!',
                    name: 'Pedro García (Test Teacher)'
                })
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.user);
            assert.ok(data.user.id);

            teacherUserId = data.user.id;
        });
    });

    // ============================================
    // Role Assignment Tests
    // ============================================
    describe('POST /api/users/:id/roles - Role Assignment', () => {
        test('should assign teacher role with groups', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['ciencias-3eso', 'matematicas-4eso']
                })
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.role);
            assert.strictEqual(data.role.role, 'teacher');
            assert.deepStrictEqual(data.role.groupIds, ['ciencias-3eso', 'matematicas-4eso']);
        });

        test('should reject teacher role without groups', async () => {
            // Create another user first
            const createRes = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email: `teacher2-${Date.now()}@school.edu`,
                    password: 'Password123!',
                    name: 'Another Teacher'
                })
            });
            const userData = await createRes.json();

            const response = await fetch(`${API_URL}/api/users/${userData.user.id}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: []
                })
            });

            assert.strictEqual(response.status, 400);
            const data = await response.json();
            assert.strictEqual(data.code, 'MISSING_GROUPS');
        });

        test('should reject invalid role', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'superadmin',
                    groupIds: []
                })
            });

            assert.strictEqual(response.status, 400);
            const data = await response.json();
            assert.strictEqual(data.code, 'INVALID_ROLE');
        });
    });

    // ============================================
    // Role Query Tests
    // ============================================
    describe('GET /api/users/:id/roles - Get User Roles', () => {
        test('should return assigned roles for user', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(Array.isArray(data.roles));
            assert.ok(data.roles.length > 0);

            const teacherRole = data.roles.find(r => r.role === 'teacher');
            assert.ok(teacherRole);
            assert.ok(teacherRole.groupIds.includes('ciencias-3eso'));
        });
    });

    // ============================================
    // Role Update Tests
    // ============================================
    describe('PATCH /api/users/:id/roles/:roleId - Update Role Groups', () => {
        let roleId;

        before(async () => {
            // Get the role ID
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const data = await response.json();
            roleId = data.roles.find(r => r.role === 'teacher').id;
        });

        test('should add groups to teacher role', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles/${roleId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    addGroups: ['historia-2eso']
                })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.role.groupIds.includes('historia-2eso'));
        });

        test('should remove groups from teacher role', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles/${roleId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    removeGroups: ['historia-2eso']
                })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(!data.role.groupIds.includes('historia-2eso'));
        });
    });

    // ============================================
    // Role Revocation Tests
    // ============================================
    describe('DELETE /api/users/:id/roles/:roleId - Revoke Role', () => {
        let roleIdToRevoke;
        let tempUserId;

        before(async () => {
            // Create a temp user and assign role for revocation test
            const createRes = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email: `revoke-test-${Date.now()}@school.edu`,
                    password: 'Password123!',
                    name: 'Revoke Test User'
                })
            });
            const userData = await createRes.json();
            tempUserId = userData.user.id;

            // Assign role
            const roleRes = await fetch(`${API_URL}/api/users/${tempUserId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['test-group']
                })
            });
            const roleData = await roleRes.json();
            roleIdToRevoke = roleData.role.id;
        });

        test('should revoke a role', async () => {
            const response = await fetch(`${API_URL}/api/users/${tempUserId}/roles/${roleIdToRevoke}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.strictEqual(data.message, 'Role revoked');
        });

        test('should not allow revoking already revoked role', async () => {
            const response = await fetch(`${API_URL}/api/users/${tempUserId}/roles/${roleIdToRevoke}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 400);

            const data = await response.json();
            assert.strictEqual(data.code, 'ALREADY_REVOKED');
        });
    });

    // ============================================
    // Authorization Tests: Non-admin cannot manage roles
    // ============================================
    describe('Authorization: Non-admin Access', () => {
        test('should reject role assignment without admin token', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['fake-group']
                })
            });

            assert.strictEqual(response.status, 401);
        });

        test('should reject user listing without admin token', async () => {
            const response = await fetch(`${API_URL}/api/users`);
            assert.strictEqual(response.status, 401);
        });
    });

    // ============================================
    // List Teachers Endpoint
    // ============================================
    describe('GET /api/users/roles/teachers - List Teachers', () => {
        test('should list all teachers with their groups', async () => {
            const response = await fetch(`${API_URL}/api/users/roles/teachers`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json();
            assert.ok(data.success);
            assert.ok(Array.isArray(data.teachers));

            // Should have at least our test teacher
            const ourTeacher = data.teachers.find(t => t.userId === teacherUserId);
            assert.ok(ourTeacher, 'Our test teacher should be in the list');
            assert.ok(ourTeacher.groupIds.includes('ciencias-3eso'));
        });
    });
});
