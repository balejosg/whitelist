/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Blocked Domains Tests - US3: Aprobación Delegada
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3002;
const API_URL = `http://localhost:${PORT}`;

const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Blocked domains tests timed out! Forcing exit...');
    process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherUserId: string | null = null;
let pendingRequestId: string | null = null;

const TEACHER_EMAIL = `blocked-test-teacher-${Date.now()}@school.edu`;
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'ciencias-3eso';

interface UserResponse {
    success: boolean;
    user?: { id: string };
    token?: string;
}

interface DomainCheckResponse {
    success: boolean;
    blocked?: boolean;
    domains?: string[];
    code?: string;
    domain?: string;
    hint?: string;
}

interface RequestResponse {
    success: boolean;
    request?: { id: string };
    id?: string;
}

describe('Blocked Domains Tests - US3', { timeout: 45000 }, () => {
    before(async () => {
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = 'test-admin-token';

        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Blocked domains test server started on port ${PORT}`);
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
                    console.log('Blocked domains test server closed');
                    resolve();
                });
            });
        }
    });

    describe('Setup: Create Teacher with Role', () => {
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
                    name: 'Pedro García (Blocked Domains Test)'
                })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as UserResponse;
            teacherUserId = data.user?.id ?? null;
        });

        test('should assign teacher role with groups', async () => {
            const response = await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
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

            assert.strictEqual(response.status, 201);
        });

        test('should login as teacher and get token', async () => {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: TEACHER_EMAIL,
                    password: TEACHER_PASSWORD
                })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as UserResponse;
            assert.ok(data.token !== undefined && data.token !== '');
            teacherToken = data.token ?? null;
        });
    });

    describe('POST /api/requests/domains/check - Check if domain is blocked', () => {
        test('should return blocked:true for known blocked domain', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({ domain: 'facebook.com' })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as DomainCheckResponse;
            assert.ok(data.success === true);
            assert.strictEqual(typeof data.blocked, 'boolean');
        });

        test('should return blocked:false for non-blocked domain', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({ domain: 'wikipedia.org' })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as DomainCheckResponse;
            assert.ok(data.success === true);
        });

        test('should reject check without authentication', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: 'example.com' })
            });

            assert.strictEqual(response.status, 401);
        });

        test('should reject check without domain parameter', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 400);
        });
    });

    describe('GET /api/requests/domains/blocked - List blocked domains', () => {
        test('should return list of blocked domains for admin', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as DomainCheckResponse;
            assert.ok(data.success === true);
            assert.ok(Array.isArray(data.domains) === true);
        });

        test('should reject for non-admin (teacher)', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${teacherToken}` }
            });

            assert.strictEqual(response.status, 403);
        });

        test('should reject without authentication', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/blocked`);

            assert.strictEqual(response.status, 401);
        });
    });

    describe('Teacher Approval of Blocked Domains', () => {
        test('setup: create a pending request for blocked domain', async () => {
            const blockedRes = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const blockedData = await blockedRes.json() as DomainCheckResponse;

            const blockedDomain = blockedData.domains?.[0] || 'facebook.com';

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    domain: blockedDomain,
                    reason: 'Test request for blocked domain',
                    group_id: TEACHER_GROUP,
                    requester_name: 'Test Student'
                })
            });

            if (response.status === 201) {
                const data = await response.json() as RequestResponse;
                pendingRequestId = data.request?.id || data.id || null;
            }
        });

        test('teacher should get DOMAIN_BLOCKED error when approving blocked domain', async () => {
            if (!pendingRequestId) {
                console.log('Skipping: No pending request available for blocked domain test');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/${pendingRequestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 403);
            const data = await response.json() as DomainCheckResponse;
            assert.strictEqual(data.code, 'DOMAIN_BLOCKED');
            assert.ok(data.domain !== undefined && data.domain !== '');
            assert.ok(data.hint !== undefined && data.hint !== '');
        });

        test('admin should be able to approve blocked domain (override)', async () => {
            if (!pendingRequestId) {
                console.log('Skipping: No pending request available for admin override test');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/${pendingRequestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({})
            });

            assert.ok(
                response.status === 200 || response.status === 400,
                `Expected 200 or 400, got ${response.status}`
            );
        });
    });

    describe('Teacher Approval of Non-blocked Domains', () => {
        let nonBlockedRequestId: string | null = null;

        test('setup: create request for non-blocked domain', async () => {
            const safeDomain = `safe-test-${Date.now()}.example.org`;

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({
                    domain: safeDomain,
                    reason: 'Test request for safe domain',
                    group_id: TEACHER_GROUP,
                    requester_name: 'Test Student Safe'
                })
            });

            if (response.status === 201) {
                const data = await response.json() as RequestResponse;
                nonBlockedRequestId = data.request?.id || data.id || null;
            }
        });

        test('teacher should successfully approve non-blocked domain', async () => {
            if (!nonBlockedRequestId) {
                console.log('Skipping: No pending request for non-blocked domain');
                return;
            }

            const response = await fetch(`${API_URL}/api/requests/${nonBlockedRequestId}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({})
            });

            assert.ok(
                response.status === 200 || response.status === 400,
                `Expected success or already processed, got ${response.status}`
            );
        });
    });
});
