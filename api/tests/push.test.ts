/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notifications API Tests
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

interface PushResponse {
    success: boolean;
    subscriptionId?: string;
    groupIds?: string[];
    pushEnabled?: boolean;
    subscriptions?: unknown[];
    code?: string;
    request_id?: string;
}

interface UserResponse {
    success: boolean;
    user?: { id: string };
    accessToken?: string;
}

await describe('Push Notifications API Tests', { timeout: 30000 }, async () => {
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

    await describe('GET /api/push/vapid-key - Get VAPID Key', async () => {
        await test('should return error when VAPID not configured', async () => {
            const response = await fetch(`${API_URL}/api/push/vapid-key`);

            assert.strictEqual(response.status, 503);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.code, 'PUSH_DISABLED');
        });
    });

    await describe('POST /api/push/subscribe - Subscribe', async () => {
        await test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: mockSubscription })
            });

            assert.strictEqual(response.status, 401);
        });

        await test('should reject invalid subscription object', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(adminToken)}`
                },
                body: JSON.stringify({ subscription: {} })
            });

            assert.strictEqual(response.status, 400);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.code, 'INVALID_SUBSCRIPTION');
        });

        await test('should accept valid subscription (admin)', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(adminToken)}`
                },
                body: JSON.stringify({ subscription: mockSubscription })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.subscriptionId !== undefined && data.subscriptionId !== '');
            assert.strictEqual(data.groupIds?.includes('*'), true);
        });
    });

    await describe('GET /api/push/status - Subscription Status', async () => {
        await test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/status`);
            assert.strictEqual(response.status, 401);
        });

        await test('should return subscription status for admin', async () => {
            const response = await fetch(`${API_URL}/api/push/status`, {
                headers: { 'Authorization': `Bearer ${String(adminToken)}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(typeof data.pushEnabled, 'boolean');
            assert.ok(Array.isArray(data.subscriptions));
        });
    });

    await describe('DELETE /api/push/subscribe - Unsubscribe', async () => {
        await test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: mockSubscription.endpoint })
            });

            assert.strictEqual(response.status, 401);
        });

        await test('should delete subscription by endpoint', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(adminToken)}`
                },
                body: JSON.stringify({ endpoint: mockSubscription.endpoint })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, true);
        });
    });

    await describe('Teacher Push Subscription', async () => {
        before(async () => {
            const email = `teacher-push-${String(Date.now())}@school.edu`;
            const createRes = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(adminToken)}`
                },
                body: JSON.stringify({
                    email,
                    password: 'TeacherPassword123!',
                    name: 'Push Test Teacher'
                })
            });
            const userData = await createRes.json() as UserResponse;
            teacherUserId = userData.user?.id ?? null;

            await fetch(`${API_URL}/api/users/${String(teacherUserId)}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(adminToken)}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['ciencias-3eso', 'fisica-4eso']
                })
            });

            const loginRes = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'TeacherPassword123!'
                })
            });
            const loginData = await loginRes.json() as UserResponse;
            teacherToken = loginData.accessToken ?? null;
        });

        await test('should subscribe teacher with assigned groups', async () => {
            const teacherSubscription = {
                endpoint: 'https://fcm.googleapis.com/fcm/send/teacher-endpoint',
                keys: {
                    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
                    auth: 'tBHItfGKZpJRN_CYzfPWpQ'
                }
            };

            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${String(teacherToken)}`
                },
                body: JSON.stringify({ subscription: teacherSubscription })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.groupIds.includes('ciencias-3eso'), true);
            assert.strictEqual(data.groupIds.includes('fisica-4eso'), true);
        });
    });

    await describe('POST /api/requests - Push Notification Trigger', async () => {
        await test('should create request successfully (push disabled)', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `test-push-${String(Date.now())}.com`,
                    reason: 'Testing push notification trigger',
                    group_id: 'ciencias-3eso'
                })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json() as PushResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.request_id !== undefined && data.request_id !== '');
        });
    });
});
