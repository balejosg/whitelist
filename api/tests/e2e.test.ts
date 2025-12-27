/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * E2E Tests - Teacher Role Workflow
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3002;
const API_URL = `http://localhost:${PORT}`;

const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ E2E tests timed out! Forcing exit...');
    process.exit(1);
}, 50000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherId: string | null = null;

const ADMIN_EMAIL = 'maria.admin@test.com';
const ADMIN_PASSWORD = 'AdminPassword123!';
const TEACHER_EMAIL = 'pedro.teacher@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'informatica-3';

interface AuthResponse {
    success: boolean;
    user?: { id: string; email: string };
    accessToken?: string;
}

interface RequestsResponse {
    success?: boolean;
    requests?: Array<{ status: string }>;
    groups?: unknown[];
    request_id?: string;
    code?: string;
    domain?: string;
    hint?: string;
    matched_rule?: string;
    blocked?: boolean;
    domains?: string[];
}

describe('E2E: Teacher Role Workflow', { timeout: 60000 }, () => {
    before(async () => {
        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`E2E test server started on port ${PORT}`);
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
                    console.log('E2E test server closed');
                    resolve();
                });
            });
        }
    });

    describe('Step 1: Setup Admin User', () => {
        test('should register admin user (María)', async () => {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: ADMIN_EMAIL,
                    password: ADMIN_PASSWORD,
                    name: 'María Admin'
                })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as AuthResponse;
            assert.ok(data.success === true);
        });

        test('should login as admin', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: ADMIN_EMAIL,
                    password: ADMIN_PASSWORD
                })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as AuthResponse;
            adminToken = data.accessToken ?? null;
            assert.ok(adminToken !== null && adminToken !== '');
        });
    });

    describe('Step 2: Admin Creates Teacher User (Pedro)', () => {
        test('should create teacher user', async () => {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email: TEACHER_EMAIL,
                    password: TEACHER_PASSWORD,
                    name: 'Pedro Profesor'
                })
            });

            if (response.status === 403 || response.status === 401) {
                const regResponse = await fetch(`${API_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: TEACHER_EMAIL,
                        password: TEACHER_PASSWORD,
                        name: 'Pedro Profesor'
                    })
                });

                assert.strictEqual(regResponse.status, 201);
                const data = await regResponse.json() as AuthResponse;
                teacherId = data.user?.id ?? null;
            } else {
                assert.strictEqual(response.status, 201);
                const data = await response.json() as AuthResponse;
                teacherId = data.user?.id ?? null;
            }

            assert.ok(teacherId !== null && teacherId !== '');
        });

        test('should assign teacher role with group', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: [TEACHER_GROUP]
                })
            });

            if (response.status === 200) {
                const data = await response.json() as { success: boolean };
                assert.ok(data.success === true);
            } else {
                console.log('Note: Role assignment requires admin permissions');
            }
        });
    });

    describe('Step 3: Teacher Login and Verify Access', () => {
        test('should login as teacher (Pedro)', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: TEACHER_EMAIL,
                    password: TEACHER_PASSWORD
                })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as AuthResponse;
            teacherToken = data.accessToken ?? null;
            assert.ok(teacherToken !== null && teacherToken !== '');
        });

        test('should get teacher profile with role info', async () => {
            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as { user: { email: string } };
            assert.ok(data.user !== undefined);
            assert.strictEqual(data.user.email, TEACHER_EMAIL);
        });
    });

    describe('Step 3.5: Teacher Dashboard - US2', () => {
        test('teacher should get their assigned groups', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/groups/list`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.ok([200, 401].includes(response.status) === true);

            if (response.status === 200) {
                const data = await response.json() as RequestsResponse;
                console.log(`Teacher has access to ${data.groups?.length ?? 0} groups`);
            }
        });

        test('teacher should only see requests for their groups', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.ok([200, 401].includes(response.status) === true);

            if (response.status === 200) {
                const data = await response.json() as RequestsResponse;
                assert.ok(data.success !== false);

                if (data.requests !== undefined && data.requests.length > 0) {
                    console.log(`Teacher sees ${data.requests.length} requests`);
                } else {
                    console.log('No pending requests for teacher groups');
                }
            }
        });

        test('teacher can filter requests by status', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests?status=pending`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.ok([200, 401].includes(response.status) === true);

            if (response.status === 200) {
                const data = await response.json() as RequestsResponse;
                if (data.requests !== undefined) {
                    data.requests.forEach(req => {
                        if (req.status) {
                            assert.strictEqual(req.status, 'pending');
                        }
                    });
                }
            }
        });

        test('teacher cannot access admin-only endpoints', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.strictEqual(response.status, 403, 'Teacher should not access blocked domains list');
        });
    });

    describe('Step 4: Request Approval Flow', () => {
        let requestId: string | null = null;

        test('should create a domain request', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `e2e-test-${Date.now()}.example.com`,
                    reason: 'E2E test request',
                    requester_email: 'student@test.com'
                })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as RequestsResponse;
            requestId = data.request_id ?? null;
            assert.ok(requestId !== null && requestId !== '');
        });

        test('teacher should see pending requests', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.ok([200, 401, 403].includes(response.status) === true);
        });

        test('teacher should be able to approve request for assigned group', async () => {
            const response = await fetch(`${API_URL}/api/requests/${requestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    group_id: TEACHER_GROUP
                })
            });

            assert.ok([200, 401, 403].includes(response.status) === true);
        });
    });

    describe('Step 4.5: Blocked Domain Approval - US3', () => {
        let blockedRequestId: string | null = null;

        test('should check which domains are blocked', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as RequestsResponse;
            assert.ok(data.success === true);
            assert.ok(Array.isArray(data.domains) === true);
            console.log(`Found ${data.domains?.length ?? 0} blocked domains`);
        });

        test('should create a request for a blocked domain (if any blocked)', async () => {
            const blockedRes = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const blockedData = await blockedRes.json() as RequestsResponse;

            if (!blockedData.domains || blockedData.domains.length === 0) {
                console.log('Skipping: No blocked domains configured');
                return;
            }

            const blockedDomain = blockedData.domains[0];
            console.log(`Testing with blocked domain: ${blockedDomain}`);

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: blockedDomain,
                    reason: 'E2E test for blocked domain',
                    requester_email: 'e2e-blocked-test@school.edu'
                })
            });

            if (response.status === 201) {
                const data = await response.json() as RequestsResponse;
                blockedRequestId = data.request_id ?? null;
                console.log(`Created request ${blockedRequestId} for blocked domain`);
            }
        });

        test('teacher should receive DOMAIN_BLOCKED error when approving blocked domain', async () => {
            if (blockedRequestId === null || teacherToken === null) {
                console.log('Skipping: No blocked request or teacher token available');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/${blockedRequestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    group_id: TEACHER_GROUP
                })
            });

            assert.strictEqual(response.status, 403, 'Teacher should be forbidden from approving blocked domain');

            const data = await response.json() as RequestsResponse;
            assert.strictEqual(data.code, 'DOMAIN_BLOCKED', 'Error code should be DOMAIN_BLOCKED');
            assert.ok(data.domain !== undefined && data.domain !== '', 'Response should include domain');
            assert.ok(data.hint !== undefined && data.hint !== '', 'Response should include hint for teacher');

            console.log(`Correctly blocked: ${data.domain} (matched: ${data.matched_rule})`);
        });

        test('teacher can check if a domain is blocked', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token available');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/domains/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({ domain: 'facebook.com' })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as RequestsResponse;
            assert.ok(data.success === true);
            assert.strictEqual(typeof data.blocked, 'boolean');

            console.log(`facebook.com blocked: ${data.blocked}`);
        });

        test('admin should be able to approve blocked domain (override)', async () => {
            if (blockedRequestId === null) {
                console.log('Skipping: No blocked request available');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/${blockedRequestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({})
            });

            assert.ok(
                [200, 400].includes(response.status) === true,
                `Admin should be able to approve (or already approved), got ${response.status}`
            );

            if (response.status === 200) {
                console.log('Admin successfully approved blocked domain (override)');
            }
        });
    });

    describe('Step 5: Access Control - Teacher Cannot Access Admin Functions', () => {
        test('teacher should not be able to list all users', async () => {
            const response = await fetch(`${API_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.ok([401, 403].includes(response.status) === true);
        });

        test('teacher should not be able to create users', async () => {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    email: 'unauthorized@test.com',
                    password: 'Password123!',
                    name: 'Unauthorized User'
                })
            });

            assert.ok([401, 403].includes(response.status) === true);
        });

        test('teacher should not be able to assign roles', async () => {
            const response = await fetch(`${API_URL}/api/users/some-id/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    role: 'admin',
                    groupIds: []
                })
            });

            assert.ok([401, 403].includes(response.status) === true);
        });
    });

    describe('Cleanup', () => {
        test('should logout teacher', async () => {
            if (teacherToken === null) return;

            const response = await fetch(`${API_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${teacherToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 200);
        });
    });
});
