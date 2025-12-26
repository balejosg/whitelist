/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Management E2E Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3002;
const API_URL = `http://localhost:${PORT}`;

const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Tests timed out! Forcing exit...');
    process.exit(1);
}, 15000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let adminToken: string | null = null;
let teacherUserId: string | null = null;

interface UserResponse {
    success: boolean;
    user?: { id: string; email: string; name: string };
}

interface RoleResponse {
    success: boolean;
    role?: { id: string; role: string; groupIds: string[] };
    roles?: Array<{ id: string; role: string; groupIds: string[] }>;
    message?: string;
    code?: string;
}

interface TeachersResponse {
    success: boolean;
    teachers: Array<{ userId: string; groupIds: string[] }>;
}

describe('Role Management E2E Tests', { timeout: 30000 }, () => {
    before(async () => {
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = 'test-admin-token';

        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Roles test server started on port ${PORT}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        adminToken = 'test-admin-token';
    });

    after(async () => {
        if (server !== undefined) {
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Roles test server closed');
                    resolve();
                });
            });
        }
    });

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

            const data = await response.json() as UserResponse;
            assert.ok(data.success === true);
            assert.ok(data.user !== undefined);
            assert.ok(data.user?.id !== undefined && data.user?.id !== '');

            teacherUserId = data.user?.id ?? null;
        });
    });

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

            const data = await response.json() as RoleResponse;
            assert.ok(data.success === true);
            assert.ok(data.role !== undefined);
            assert.strictEqual(data.role?.role, 'teacher');
            assert.deepStrictEqual(data.role?.groupIds, ['ciencias-3eso', 'matematicas-4eso']);
        });

        test('should reject teacher role without groups', async () => {
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
            const userData = await createRes.json() as UserResponse;

            const response = await fetch(`${API_URL}/api/users/${userData.user?.id}/roles`, {
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
            const data = await response.json() as RoleResponse;
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
            const data = await response.json() as RoleResponse;
            assert.strictEqual(data.code, 'INVALID_ROLE');
        });
    });

    describe('GET /api/users/:id/roles - Get User Roles', () => {
        test('should return assigned roles for user', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as RoleResponse;
            assert.ok(data.success === true);
            assert.ok(Array.isArray(data.roles) === true);
            assert.ok(data.roles !== undefined && data.roles.length > 0);

            const teacherRole = data.roles?.find(r => r.role === 'teacher');
            assert.ok(teacherRole !== undefined);
            assert.ok(teacherRole?.groupIds.includes('ciencias-3eso') === true);
        });
    });

    describe('PATCH /api/users/:id/roles/:roleId - Update Role Groups', () => {
        let roleId: string | undefined;

        before(async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const data = await response.json() as RoleResponse;
            roleId = data.roles?.find(r => r.role === 'teacher')?.id;
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

            const data = await response.json() as RoleResponse;
            assert.ok(data.success === true);
            assert.ok(data.role?.groupIds.includes('historia-2eso') === true);
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

            const data = await response.json() as RoleResponse;
            assert.ok(data.success === true);
            assert.ok(data.role?.groupIds.includes('historia-2eso') === false);
        });
    });

    describe('DELETE /api/users/:id/roles/:roleId - Revoke Role', () => {
        let roleIdToRevoke: string | undefined;
        let tempUserId: string | undefined;

        before(async () => {
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
            const userData = await createRes.json() as UserResponse;
            tempUserId = userData.user?.id;

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
            const roleData = await roleRes.json() as RoleResponse;
            roleIdToRevoke = roleData.role?.id;
        });

        test('should revoke a role', async () => {
            const response = await fetch(`${API_URL}/api/users/${tempUserId}/roles/${roleIdToRevoke}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as RoleResponse;
            assert.ok(data.success === true);
            assert.strictEqual(data.message, 'Role revoked');
        });

        test('should not allow revoking already revoked role', async () => {
            const response = await fetch(`${API_URL}/api/users/${tempUserId}/roles/${roleIdToRevoke}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 400);

            const data = await response.json() as RoleResponse;
            assert.strictEqual(data.code, 'ALREADY_REVOKED');
        });
    });

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

    describe('GET /api/users/roles/teachers - List Teachers', () => {
        test('should list all teachers with their groups', async () => {
            const response = await fetch(`${API_URL}/api/users/roles/teachers`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as TeachersResponse;
            assert.ok(data.success === true);
            assert.ok(Array.isArray(data.teachers) === true);

            const ourTeacher = data.teachers.find(t => t.userId === teacherUserId);
            assert.ok(ourTeacher !== undefined, 'Our test teacher should be in the list');
            assert.ok(ourTeacher?.groupIds.includes('ciencias-3eso') === true);
        });
    });
});
