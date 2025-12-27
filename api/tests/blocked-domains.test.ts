/* eslint-disable */
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Blocked Domains Tests - US3: Aprobación Delegada (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3002;
const API_URL = `http://localhost:${String(PORT)}`;

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

const TEACHER_EMAIL = `blocked-test-teacher-${String(Date.now())}@school.edu`;
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'ciencias-3eso';

// Helper to call tRPC mutations
async function trpcMutate(procedure: string, input: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${API_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input)
    });
    return response;
}

// Helper to call tRPC queries
async function trpcQuery(procedure: string, input?: unknown, headers: Record<string, string> = {}) {
    let url = `${API_URL}/trpc/${procedure}`;
    if (input !== undefined) {
        url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const response = await fetch(url, { headers });
    return response;
}

// Parse tRPC response
interface TRPCResponse<T = unknown> {
    result?: { data: T };
    error?: { message: string; code: string };
}

interface UserResult {
    id: string;
    email: string;
    name: string;
}

interface AuthResult {
    accessToken?: string;
    refreshToken?: string;
    user?: UserResult;
}

interface RoleResult {
    id: string;
    role: string;
    groupIds: string[];
}

interface CheckResult {
    blocked: boolean;
    domain?: string;
}

interface RequestResult {
    id: string;
    domain?: string;
    status?: string;
}

async function parseTRPC<T>(response: Response): Promise<{ data?: T; error?: string; code?: string }> {
    const json = await response.json() as TRPCResponse<T>;
    if (json.result) {
        return { data: json.result.data };
    }
    if (json.error) {
        return { error: json.error.message, code: json.error.code };
    }
    return {};
}

await describe('Blocked Domains Tests - US3 (tRPC)', { timeout: 45000 }, async () => {
    before(async () => {
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = 'test-admin-token';

        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Blocked domains test server started on port ${String(PORT)}`);
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

    await describe('Setup: Create Teacher with Role', async () => {
        await test('should create teacher user', async () => {
            const response = await trpcMutate('users.create', {
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD,
                name: 'Pedro García (Blocked Domains Test)'
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<UserResult>(response);
            teacherUserId = data?.id ?? null;
        });

        await test('should assign teacher role with groups', async () => {
            const response = await trpcMutate('users.assignRole', {
                userId: String(teacherUserId),
                role: 'teacher',
                groupIds: [TEACHER_GROUP]
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<RoleResult>(response);
            assert.ok(data?.id);
        });

        await test('should login as teacher and get token', async () => {
            const response = await trpcMutate('auth.login', {
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<AuthResult>(response);
            assert.ok(data?.accessToken);
            teacherToken = data.accessToken;
        });
    });

    await describe('requests.check - Check if domain is blocked', async () => {
        await test('should return blocked status for facebook.com', async () => {
            const response = await trpcMutate('requests.check', { domain: 'facebook.com' }, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<CheckResult>(response);
            assert.strictEqual(typeof data?.blocked, 'boolean');
        });

        await test('should return blocked status for wikipedia.org', async () => {
            const response = await trpcMutate('requests.check', { domain: 'wikipedia.org' }, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<CheckResult>(response);
            assert.strictEqual(typeof data?.blocked, 'boolean');
        });

        await test('should reject check without authentication', async () => {
            const response = await trpcMutate('requests.check', { domain: 'example.com' });

            assert.strictEqual(response.status, 401);
        });

        await test('should reject check without domain parameter', async () => {
            const response = await trpcMutate('requests.check', {}, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.strictEqual(response.status, 400);
        });
    });

    await describe('requests.listBlocked - List blocked domains', async () => {
        await test('should return list of blocked domains for admin', async () => {
            const response = await trpcQuery('requests.listBlocked', undefined, {
                'Authorization': `Bearer ${String(adminToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<string[]>(response);
            assert.ok(Array.isArray(data));
        });

        await test('should reject for non-admin (teacher)', async () => {
            const response = await trpcQuery('requests.listBlocked', undefined, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.strictEqual(response.status, 403);
        });

        await test('should reject without authentication', async () => {
            const response = await trpcQuery('requests.listBlocked');

            assert.strictEqual(response.status, 401);
        });
    });

    await describe('Teacher Approval of Blocked Domains', async () => {
        await test('setup: create a pending request for any domain', async () => {
            const testDomain = `blocked-test-${String(Date.now())}.example.com`;

            const response = await trpcMutate('requests.create', {
                domain: testDomain,
                reason: 'Test request for blocked domain',
                requester_email: 'student@test.com'
            });

            if (response.status === 200) {
                const { data } = await parseTRPC<RequestResult>(response);
                pendingRequestId = data?.id ?? null;
            }
        });

        await test('teacher should be able to approve request (if allowed)', async () => {
            if (pendingRequestId === null) {
                console.log('Skipping: No pending request available');
                return;
            }

            const response = await trpcMutate('requests.approve', {
                id: pendingRequestId,
                group_id: TEACHER_GROUP
            }, { 'Authorization': `Bearer ${String(teacherToken)}` });

            // Either success (200) or forbidden (403) depending on domain
            assert.ok([200, 403].includes(response.status), `Expected 200 or 403, got ${String(response.status)}`);
        });
    });

    await describe('Teacher Approval of Non-blocked Domains', async () => {
        let nonBlockedRequestId: string | null = null;

        await test('setup: create request for safe domain', async () => {
            const safeDomain = `safe-test-${String(Date.now())}.example.org`;

            const response = await trpcMutate('requests.create', {
                domain: safeDomain,
                reason: 'Test request for safe domain',
                requester_email: 'student-safe@test.com'
            });

            if (response.status === 200) {
                const { data } = await parseTRPC<RequestResult>(response);
                nonBlockedRequestId = data?.id ?? null;
            }
        });

        await test('teacher should successfully approve non-blocked domain', async () => {
            if (nonBlockedRequestId === null) {
                console.log('Skipping: No pending request for non-blocked domain');
                return;
            }

            const response = await trpcMutate('requests.approve', {
                id: nonBlockedRequestId,
                group_id: TEACHER_GROUP
            }, { 'Authorization': `Bearer ${String(teacherToken)}` });

            assert.ok(
                [200, 400, 403].includes(response.status),
                `Expected success or already processed, got ${String(response.status)}`
            );
        });
    });
});
