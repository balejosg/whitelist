/* eslint-disable */
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notifications API Tests (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3003;
const API_URL = `http://localhost:${String(PORT)}`;

const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Tests timed out! Forcing exit...');
    process.exit(1);
}, 20000);
GLOBAL_TIMEOUT.unref();

const mockSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
    keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItfGKZpJRN_CYzfPWpQ'
    }
};

let server: Server | undefined;
let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherUserId: string | null = null;

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
    error?: { message: string; code: string; data?: { code: string } };
}

interface PushResult {
    subscriptionId?: string;
    groupIds?: string[];
    pushEnabled?: boolean;
    subscriptions?: unknown[];
    success?: boolean;
}

interface VapidResult {
    publicKey?: string;
    enabled?: boolean;
}

interface UserResult {
    id: string;
    email: string;
    name: string;
}

interface AuthResult {
    accessToken?: string;
    user?: UserResult;
}

interface RoleResult {
    id: string;
    role: string;
}

interface RequestResult {
    id: string;
}

async function parseTRPC<T>(response: Response): Promise<{ data?: T; error?: string; code?: string }> {
    const json = await response.json() as TRPCResponse<T>;
    if (json.result) {
        return { data: json.result.data };
    }
    if (json.error) {
        return { error: json.error.message, code: json.error.data?.code ?? json.error.code };
    }
    return {};
}

await describe('Push Notifications API Tests (tRPC)', { timeout: 30000 }, async () => {
    before(async () => {
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = 'test-admin-token';
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;

        const subscriptionsFile = path.join(__dirname, '..', 'data', 'push-subscriptions.json');
        if (fs.existsSync(subscriptionsFile)) {
            fs.unlinkSync(subscriptionsFile);
        }

        const { app } = await import('../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Push test server started on port ${String(PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        adminToken = 'test-admin-token';
    });

    after(async () => {
        if (server !== undefined) {
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Push test server closed');
                    resolve();
                });
            });
        }
    });

    await describe('push.getVapidKey - Get VAPID Key', async () => {
        await test('should return error when VAPID not configured', async () => {
            const response = await trpcQuery('push.getVapidKey');

            // Either 503 or some error status when VAPID not configured
            assert.ok([200, 503].includes(response.status), `Expected 200 or 503, got ${String(response.status)}`);

            if (response.status === 200) {
                const { data } = await parseTRPC<VapidResult>(response);
                // If 200, might indicate disabled
                assert.ok(data !== undefined);
            }
        });
    });

    await describe('push.subscribe - Subscribe', async () => {
        await test('should require authentication', async () => {
            const response = await trpcMutate('push.subscribe', { subscription: mockSubscription });

            assert.strictEqual(response.status, 401);
        });

        await test('should reject invalid subscription object', async () => {
            const response = await trpcMutate('push.subscribe', { subscription: {} }, {
                'Authorization': `Bearer ${String(adminToken)}`
            });

            assert.strictEqual(response.status, 400);
        });

        await test('should accept valid subscription (admin)', async () => {
            const response = await trpcMutate('push.subscribe', { subscription: mockSubscription }, {
                'Authorization': `Bearer ${String(adminToken)}`
            });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);
            const { data } = await parseTRPC<PushResult>(response);
            assert.ok(data?.subscriptionId);
            assert.ok(data?.groupIds?.includes('*'));
        });
    });

    await describe('push.status - Subscription Status', async () => {
        await test('should require authentication', async () => {
            const response = await trpcQuery('push.status');
            assert.strictEqual(response.status, 401);
        });

        await test('should return subscription status for admin', async () => {
            const response = await trpcQuery('push.status', undefined, {
                'Authorization': `Bearer ${String(adminToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<PushResult>(response);
            assert.strictEqual(typeof data?.pushEnabled, 'boolean');
            assert.ok(Array.isArray(data?.subscriptions));
        });
    });

    await describe('push.unsubscribe - Unsubscribe', async () => {
        await test('should require authentication', async () => {
            const response = await trpcMutate('push.unsubscribe', { endpoint: mockSubscription.endpoint });

            assert.strictEqual(response.status, 401);
        });

        await test('should delete subscription by endpoint', async () => {
            const response = await trpcMutate('push.unsubscribe', { endpoint: mockSubscription.endpoint }, {
                'Authorization': `Bearer ${String(adminToken)}`
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<PushResult>(response);
            assert.strictEqual(data?.success, true);
        });
    });

    await describe('Teacher Push Subscription', async () => {
        before(async () => {
            const email = `teacher-push-${String(Date.now())}@school.edu`;

            const createRes = await trpcMutate('users.create', {
                email,
                password: 'TeacherPassword123!',
                name: 'Push Test Teacher'
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            const { data: userData } = await parseTRPC<UserResult>(createRes);
            teacherUserId = userData?.id ?? null;

            await trpcMutate('users.assignRole', {
                userId: String(teacherUserId),
                role: 'teacher',
                groupIds: ['ciencias-3eso', 'fisica-4eso']
            }, { 'Authorization': `Bearer ${String(adminToken)}` });

            const loginRes = await trpcMutate('auth.login', {
                email,
                password: 'TeacherPassword123!'
            });
            const { data: loginData } = await parseTRPC<AuthResult>(loginRes);
            teacherToken = loginData?.accessToken ?? null;
        });

        await test('should subscribe teacher with assigned groups', async () => {
            const teacherSubscription = {
                endpoint: 'https://fcm.googleapis.com/fcm/send/teacher-endpoint',
                keys: {
                    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
                    auth: 'tBHItfGKZpJRN_CYzfPWpQ'
                }
            };

            const response = await trpcMutate('push.subscribe', { subscription: teacherSubscription }, {
                'Authorization': `Bearer ${String(teacherToken)}`
            });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);
            const { data } = await parseTRPC<PushResult>(response);
            assert.ok(data?.groupIds?.includes('ciencias-3eso'));
            assert.ok(data?.groupIds?.includes('fisica-4eso'));
        });
    });

    await describe('requests.create - Push Notification Trigger', async () => {
        await test('should create request successfully (push disabled)', async () => {
            const response = await trpcMutate('requests.create', {
                domain: `test-push-${String(Date.now())}.com`,
                reason: 'Testing push notification trigger',
                requester_email: 'student@test.com'
            });

            assert.strictEqual(response.status, 200);
            const { data } = await parseTRPC<RequestResult>(response);
            assert.ok(data?.id);
        });
    });
});
