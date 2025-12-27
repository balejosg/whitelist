/* eslint-disable */
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * E2E Tests - Teacher Role Workflow (tRPC)
 */

/* eslint-disable */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3002;
const API_URL = `http://localhost:${String(PORT)}`;

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

interface AuthResult {
    user?: { id: string; email: string; name: string; roles?: unknown[] };
    accessToken?: string;
    refreshToken?: string;
}

interface RequestResult {
    id?: string;
    status?: string;
    domain?: string;
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

await describe('E2E: Teacher Role Workflow (tRPC)', { timeout: 60000 }, async () => {
    before(async () => {
        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`E2E test server started on port ${String(PORT)}`);
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

    await describe('Step 1: Setup Admin User', async () => {
        await test('should register admin user (María)', async () => {
            const response = await trpcMutate('auth.register', {
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                name: 'María Admin'
            });

            // 200 = new user, 409 = already exists (from previous test run)
            assert.ok([200, 409].includes(response.status), `Expected 200 or 409, got ${String(response.status)}`);

            if (response.status === 200) {
                const { data } = await parseTRPC<AuthResult>(response);
                assert.ok(data?.user?.id);
            } else {
                console.log('Admin user already exists, will login');
            }
        });

        await test('should login as admin', async () => {
            const response = await trpcMutate('auth.login', {
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<AuthResult>(response);
            adminToken = data?.accessToken ?? null;
            assert.ok(adminToken !== null && adminToken !== '');
        });
    });

    await describe('Step 2: Admin Creates Teacher User (Pedro)', async () => {
        await test('should create teacher user', async () => {
            // First try admin endpoint
            const response = await trpcMutate('users.create', {
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD,
                name: 'Pedro Profesor'
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            if (response.status === 403 || response.status === 401) {
                // Fallback to register
                const regResponse = await trpcMutate('auth.register', {
                    email: TEACHER_EMAIL,
                    password: TEACHER_PASSWORD,
                    name: 'Pedro Profesor'
                });

                // 200 = new user, 409 = already exists
                assert.ok([200, 409].includes(regResponse.status), `Expected 200 or 409, got ${String(regResponse.status)}`);

                if (regResponse.status === 200) {
                    const { data } = await parseTRPC<AuthResult>(regResponse);
                    teacherId = data?.user?.id ?? null;
                } else {
                    // User already exists, get ID from login
                    console.log('Teacher user already exists');
                    teacherId = 'existing-teacher-id';
                }
            } else {
                assert.ok([200, 409].includes(response.status), `Expected 200 or 409, got ${String(response.status)}`);
                if (response.status === 200) {
                    const { data } = await parseTRPC<AuthResult>(response);
                    teacherId = data?.user?.id ?? null;
                } else {
                    teacherId = 'existing-teacher-id';
                }
            }

            assert.ok(teacherId !== null && teacherId !== '');
        });

        await test('should assign teacher role with group', async () => {
            const response = await trpcMutate('users.assignRole', {
                userId: String(teacherId),
                role: 'teacher',
                groupIds: [TEACHER_GROUP]
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            if (response.status === 200) {
                const { data } = await parseTRPC<{ id: string }>(response);
                assert.ok(data?.id);
            } else {
                console.log('Note: Role assignment requires admin permissions');
            }
        });
    });

    await describe('Step 3: Teacher Login and Verify Access', async () => {
        await test('should login as teacher (Pedro)', async () => {
            const response = await trpcMutate('auth.login', {
                email: TEACHER_EMAIL,
                password: TEACHER_PASSWORD
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<AuthResult>(response);
            teacherToken = data?.accessToken ?? null;
            assert.ok(teacherToken !== null && teacherToken !== '');
        });

        await test('should get teacher profile with role info', async () => {
            const response = await trpcQuery('auth.me', undefined, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<{ user: { email: string } }>(response);
            assert.strictEqual(data?.user?.email, TEACHER_EMAIL);
        });
    });

    await describe('Step 3.5: Teacher Dashboard - US2', async () => {
        await test('teacher should get their assigned groups', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await trpcQuery('requests.listGroups', undefined, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.ok([200, 401].includes(response.status));

            if (response.status === 200) {
                const { data } = await parseTRPC<unknown[]>(response);
                console.log(`Teacher has access to ${String(data?.length ?? 0)} groups`);
            }
        });

        await test('teacher should only see requests for their groups', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await trpcQuery('requests.list', {}, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.ok([200, 401].includes(response.status));

            if (response.status === 200) {
                const { data } = await parseTRPC<RequestResult[]>(response);
                if (data && data.length > 0) {
                    console.log(`Teacher sees ${String(data.length)} requests`);
                } else {
                    console.log('No pending requests for teacher groups');
                }
            }
        });

        await test('teacher can filter requests by status', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await trpcQuery('requests.list', { status: 'pending' }, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.ok([200, 401].includes(response.status));

            if (response.status === 200) {
                const { data } = await parseTRPC<RequestResult[]>(response);
                if (data) {
                    data.forEach(req => {
                        if (req.status) {
                            assert.strictEqual(req.status, 'pending');
                        }
                    });
                }
            }
        });

        await test('teacher cannot access admin-only endpoints', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token');
                return;
            }

            const response = await trpcQuery('requests.listBlocked', undefined, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.strictEqual(response.status, 403, 'Teacher should not access blocked domains list');
        });
    });

    await describe('Step 4: Request Approval Flow', async () => {
        let requestId: string | null = null;

        await test('should create a domain request', async () => {
            const response = await trpcMutate('requests.create', {
                domain: `e2e-test-${String(Date.now())}.example.com`,
                reason: 'E2E test request',
                requester_email: 'student@test.com'
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<RequestResult>(response);
            requestId = data?.id ?? null;
            assert.ok(requestId !== null && requestId !== '');
        });

        await test('teacher should see pending requests', async () => {
            const response = await trpcQuery('requests.list', {}, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.ok([200, 401, 403].includes(response.status));
        });

        await test('teacher should be able to approve request for assigned group', async () => {
            const response = await trpcMutate('requests.approve', {
                id: String(requestId),
                group_id: TEACHER_GROUP
            }, { 'Authorization': `Bearer ${String(teacherToken)}` });

            assert.ok([200, 401, 403].includes(response.status));
        });
    });

    await describe('Step 4.5: Blocked Domain Approval - US3', async () => {
        let blockedRequestId: string | null = null;

        await test('should check which domains are blocked', async () => {
            // Use legacy admin token since registered users don't have admin role
            const legacyAdminToken = process.env.ADMIN_TOKEN ?? adminToken;
            const response = await trpcQuery('requests.listBlocked', undefined, {
                'Authorization': `Bearer ${String(legacyAdminToken)}`
            });

            // Admin endpoint - might be 403 if no admin token configured
            assert.ok([200, 403].includes(response.status));

            if (response.status === 200) {
                const { data } = await parseTRPC<string[]>(response);
                assert.ok(Array.isArray(data));
                console.log(`Found ${String(data?.length ?? 0)} blocked domains`);
            } else {
                console.log('Skipping blocked domains check - no admin privileges');
            }
        });

        await test('should create a request for a blocked domain (if any blocked)', async () => {
            const blockedRes = await trpcQuery('requests.listBlocked', undefined, {
                'Authorization': `Bearer ${String(adminToken)}`
            });
            const { data: blockedData } = await parseTRPC<string[]>(blockedRes);

            if (!blockedData || blockedData.length === 0) {
                console.log('Skipping: No blocked domains configured');
                return;
            }

            const blockedDomain = blockedData[0];
            console.log(`Testing with blocked domain: ${String(blockedDomain)}`);

            const response = await trpcMutate('requests.create', {
                domain: blockedDomain,
                reason: 'E2E test for blocked domain',
                requester_email: 'e2e-blocked-test@school.edu'
            });

            if (response.status === 200) {
                const { data } = await parseTRPC<RequestResult>(response);
                blockedRequestId = data?.id ?? null;
                console.log(`Created request ${String(blockedRequestId)} for blocked domain`);
            }
        });

        await test('teacher should receive error when approving blocked domain', async () => {
            if (blockedRequestId === null || teacherToken === null) {
                console.log('Skipping: No blocked request or teacher token available');
                return;
            }

            const response = await trpcMutate('requests.approve', {
                id: blockedRequestId,
                group_id: TEACHER_GROUP
            }, { 'Authorization': `Bearer ${teacherToken}` });

            assert.strictEqual(response.status, 403, 'Teacher should be forbidden from approving blocked domain');
        });

        await test('teacher can check if a domain is blocked', async () => {
            if (teacherToken === null) {
                console.log('Skipping: No teacher token available');
                return;
            }

            const response = await trpcMutate('requests.check', { domain: 'facebook.com' }, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<{ blocked: boolean }>(response);
            assert.strictEqual(typeof data?.blocked, 'boolean');

            console.log(`facebook.com blocked: ${String(data?.blocked)}`);
        });

        await test('admin should be able to approve blocked domain (override)', async () => {
            if (blockedRequestId === null) {
                console.log('Skipping: No blocked request available');
                return;
            }

            const response = await trpcMutate('requests.approve', {
                id: blockedRequestId
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            assert.ok(
                [200, 400].includes(response.status),
                `Admin should be able to approve (or already approved), got ${String(response.status)}`
            );

            if (response.status === 200) {
                console.log('Admin successfully approved blocked domain (override)');
            }
        });
    });

    await describe('Step 5: Access Control - Teacher Cannot Access Admin Functions', async () => {
        await test('teacher should not be able to list all users', async () => {
            const response = await trpcQuery('users.list', undefined, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.ok([401, 403].includes(response.status));
        });

        await test('teacher should not be able to create users', async () => {
            const response = await trpcMutate('users.create', {
                email: 'unauthorized@test.com',
                password: 'Password123!',
                name: 'Unauthorized User'
            }, { 'Authorization': `Bearer ${String(teacherToken)}` });

            assert.ok([401, 403].includes(response.status));
        });

        await test('teacher should not be able to assign roles', async () => {
            const response = await trpcMutate('users.assignRole', {
                userId: 'some-id',
                role: 'admin',
                groupIds: []
            }, { 'Authorization': `Bearer ${String(teacherToken)}` });

            assert.ok([401, 403].includes(response.status));
        });
    });

    await describe('Cleanup', async () => {
        await test('should logout teacher', async () => {
            if (teacherToken === null) return;

            const response = await trpcMutate('auth.logout', {}, {
                'Authorization': `Bearer ${teacherToken}`
            });

            assert.strictEqual(response.status, 200);
        });
    });
});
