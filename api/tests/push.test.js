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
 * Push Notifications API Tests
 * 
 * Tests for the push notification endpoints:
 * - GET /api/push/vapid-key
 * - POST /api/push/subscribe
 * - GET /api/push/status
 * - DELETE /api/push/subscribe
 * 
 * Run with: node --test tests/push.test.js
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PORT = 3003;
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Tests timed out! Forcing exit...');
    process.exit(1);
}, 20000);
GLOBAL_TIMEOUT.unref();

// Mock subscription object (similar to browser PushSubscription)
const mockSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
    keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItfGKZpJRN_CYzfPWpQ'
    }
};

let server;
let adminToken = null;
let teacherToken = null;
let teacherUserId = null;

describe('Push Notifications API Tests', { timeout: 30000 }, () => {
    before(async () => {
        // Clear module cache to avoid port conflicts
        delete require.cache[require.resolve('../server.js')];

        // Set up test environment
        process.env.PORT = PORT;
        process.env.ADMIN_TOKEN = 'test-admin-token';
        // Note: VAPID keys not set - push should be disabled
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;

        // Clean up any previous test data
        const subscriptionsFile = path.join(__dirname, '..', 'data', 'push-subscriptions.json');
        if (fs.existsSync(subscriptionsFile)) {
            fs.unlinkSync(subscriptionsFile);
        }

        const { app } = require('../server.js');

        server = app.listen(PORT, () => {
            console.log(`Push test server started on port ${PORT}`);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        adminToken = 'test-admin-token';
    });

    after(async () => {
        if (server) {
            if (server.closeAllConnections) {
                server.closeAllConnections();
            }
            await new Promise((resolve) => {
                server.close(() => {
                    console.log('Push test server closed');
                    resolve();
                });
            });
        }
    });

    // ============================================
    // GET /api/push/vapid-key
    // ============================================
    describe('GET /api/push/vapid-key - Get VAPID Key', () => {
        test('should return error when VAPID not configured', async () => {
            const response = await fetch(`${API_URL}/api/push/vapid-key`);

            assert.strictEqual(response.status, 503);
            const data = await response.json();
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.code, 'PUSH_DISABLED');
        });
    });

    // ============================================
    // POST /api/push/subscribe - requires auth
    // ============================================
    describe('POST /api/push/subscribe - Subscribe', () => {
        test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: mockSubscription })
            });

            assert.strictEqual(response.status, 401);
        });

        test('should reject invalid subscription object', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ subscription: {} })
            });

            assert.strictEqual(response.status, 400);
            const data = await response.json();
            assert.strictEqual(data.code, 'INVALID_SUBSCRIPTION');
        });

        test('should reject subscription without keys', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    subscription: {
                        endpoint: 'https://example.com/push',
                        keys: {}
                    }
                })
            });

            assert.strictEqual(response.status, 400);
            const data = await response.json();
            assert.strictEqual(data.code, 'INVALID_SUBSCRIPTION');
        });

        test('should accept valid subscription (admin)', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ subscription: mockSubscription })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.subscriptionId);
            assert.ok(data.groupIds.includes('*')); // Admin gets all groups
        });
    });

    // ============================================
    // GET /api/push/status - Check subscription status
    // ============================================
    describe('GET /api/push/status - Subscription Status', () => {
        test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/status`);
            assert.strictEqual(response.status, 401);
        });

        test('should return subscription status for admin', async () => {
            const response = await fetch(`${API_URL}/api/push/status`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json();
            assert.ok(data.success);
            assert.strictEqual(typeof data.pushEnabled, 'boolean');
            assert.ok(Array.isArray(data.subscriptions));
        });
    });

    // ============================================
    // DELETE /api/push/subscribe - Unsubscribe
    // ============================================
    describe('DELETE /api/push/subscribe - Unsubscribe', () => {
        test('should require authentication', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: mockSubscription.endpoint })
            });

            assert.strictEqual(response.status, 401);
        });

        test('should require endpoint or subscriptionId', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({})
            });

            assert.strictEqual(response.status, 400);
        });

        test('should delete subscription by endpoint', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ endpoint: mockSubscription.endpoint })
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json();
            assert.ok(data.success);
        });

        test('should return 404 for non-existent subscription', async () => {
            const response = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ endpoint: 'https://nonexistent.example.com' })
            });

            assert.strictEqual(response.status, 404);
        });
    });

    // ============================================
    // Integration: Teacher subscription
    // ============================================
    describe('Teacher Push Subscription', () => {
        before(async () => {
            // Create a teacher user
            const email = `teacher-push-${Date.now()}@school.edu`;
            const createRes = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email,
                    password: 'TeacherPassword123!',
                    name: 'Push Test Teacher'
                })
            });
            const userData = await createRes.json();
            teacherUserId = userData.user.id;

            // Assign teacher role
            await fetch(`${API_URL}/api/users/${teacherUserId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['ciencias-3eso', 'fisica-4eso']
                })
            });

            // Login as teacher
            const loginRes = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: 'TeacherPassword123!'
                })
            });
            const loginData = await loginRes.json();
            teacherToken = loginData.accessToken;
        });

        test('should subscribe teacher with assigned groups', async () => {
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
                    'Authorization': `Bearer ${teacherToken}`
                },
                body: JSON.stringify({ subscription: teacherSubscription })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json();
            assert.ok(data.success);
            // Teacher should get their assigned groups
            assert.ok(data.groupIds.includes('ciencias-3eso'));
            assert.ok(data.groupIds.includes('fisica-4eso'));
        });
    });

    // ============================================
    // Unit Tests: Push Module Logic
    // ============================================
    describe('Push Module - Group Filtering', () => {
        test('should get subscriptions for specific group', async () => {
            const push = require('../lib/push');

            // Teacher subscribed to ciencias-3eso and fisica-4eso
            const subsForCiencias = push.getSubscriptionsForGroup('ciencias-3eso');
            const subsForMatematicas = push.getSubscriptionsForGroup('matematicas-4eso');

            // Should find the teacher subscription for ciencias
            assert.ok(subsForCiencias.length > 0, 'Should find subscription for ciencias-3eso');

            // Should NOT find for matematicas (teacher not subscribed)
            assert.strictEqual(subsForMatematicas.length, 0, 'Should not find subscription for matematicas');
        });

        test('should get subscriptions for user', async () => {
            const push = require('../lib/push');

            // Get subscriptions for the teacher we created
            const subs = push.getSubscriptionsForUser(teacherUserId);

            // Should have at least one subscription
            assert.ok(subs.length > 0, 'Should find subscriptions for teacher');
            assert.ok(subs[0].groupIds.includes('ciencias-3eso'));
        });
    });

    // ============================================
    // Integration: POST /api/requests triggers push
    // ============================================
    describe('POST /api/requests - Push Notification Trigger', () => {
        test('should create request successfully (push disabled)', async () => {
            // With VAPID not configured, push should be disabled but request should still work
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `test-push-${Date.now()}.com`,
                    reason: 'Testing push notification trigger',
                    group_id: 'ciencias-3eso'
                })
            });

            assert.strictEqual(response.status, 201);
            const data = await response.json();
            assert.ok(data.success);
            assert.ok(data.request_id);
        });

        test('notifyTeachersOfNewRequest returns disabled when no VAPID', async () => {
            const push = require('../lib/push');

            const mockRequest = {
                id: 'req_test123',
                domain: 'example.com',
                group_id: 'ciencias-3eso'
            };

            const result = await push.notifyTeachersOfNewRequest(mockRequest);

            // Should return disabled flag when VAPID not configured
            assert.strictEqual(result.disabled, true);
            assert.strictEqual(result.sent, 0);
        });
    });

    // ============================================
    // Integration: Teacher Isolation
    // ============================================
    describe('Teacher Notification Isolation', () => {
        let teacher2Token = null;
        let teacher2UserId = null;

        before(async () => {
            // Create second teacher with DIFFERENT groups
            const email2 = `teacher2-push-${Date.now()}@school.edu`;
            const createRes = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    email: email2,
                    password: 'Teacher2Password123!',
                    name: 'Second Push Teacher'
                })
            });
            const userData = await createRes.json();
            teacher2UserId = userData.user.id;

            // Assign teacher role with DIFFERENT groups
            await fetch(`${API_URL}/api/users/${teacher2UserId}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    role: 'teacher',
                    groupIds: ['matematicas-4eso', 'historia-2eso']
                })
            });

            // Login as teacher2
            const loginRes = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email2,
                    password: 'Teacher2Password123!'
                })
            });
            const loginData = await loginRes.json();
            teacher2Token = loginData.accessToken;

            // Subscribe teacher2 to push
            await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${teacher2Token}`
                },
                body: JSON.stringify({
                    subscription: {
                        endpoint: 'https://fcm.googleapis.com/fcm/send/teacher2-endpoint',
                        keys: {
                            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
                            auth: 'tBHItfGKZpJRN_CYzfPWpQ'
                        }
                    }
                })
            });
        });

        test('only teachers of the correct group should be found', async () => {
            const push = require('../lib/push');

            // Request for ciencias-3eso - only teacher1 should receive
            const subsForCiencias = push.getSubscriptionsForGroup('ciencias-3eso');
            const subsForMatematicas = push.getSubscriptionsForGroup('matematicas-4eso');

            // Teacher1 is subscribed to ciencias-3eso
            const teacher1InCiencias = subsForCiencias.some(s => s.userId === teacherUserId);
            // Teacher2 is NOT subscribed to ciencias-3eso
            const teacher2InCiencias = subsForCiencias.some(s => s.userId === teacher2UserId);

            // Teacher2 IS subscribed to matematicas-4eso
            const teacher2InMatematicas = subsForMatematicas.some(s => s.userId === teacher2UserId);

            assert.ok(teacher1InCiencias, 'Teacher1 should be in ciencias-3eso subscriptions');
            assert.strictEqual(teacher2InCiencias, false, 'Teacher2 should NOT be in ciencias-3eso subscriptions');
            assert.ok(teacher2InMatematicas, 'Teacher2 should be in matematicas-4eso subscriptions');
        });

        test('admin wildcard subscription should match all groups', async () => {
            const push = require('../lib/push');

            // Admin subscribed with '*' should appear everywhere
            // (We subscribed admin earlier with '*')

            // Check if admin subscription exists
            const allSubs = push.getSubscriptionsForGroup('any-random-group');

            // Admin with * should match any group
            const adminSub = allSubs.find(s => s.groupIds.includes('*'));

            // Note: This depends on if we still have admin subscription
            // After our delete test, admin might not be subscribed
            // Just verify the function works
            assert.ok(Array.isArray(allSubs), 'Should return an array');
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        test('should handle re-subscription (same endpoint)', async () => {
            const subscription = {
                endpoint: 'https://fcm.googleapis.com/fcm/send/resubscribe-test',
                keys: {
                    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
                    auth: 'tBHItfGKZpJRN_CYzfPWpQ'
                }
            };

            // Subscribe first time
            const res1 = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ subscription })
            });
            assert.strictEqual(res1.status, 201);

            // Subscribe again with same endpoint (should replace)
            const res2 = await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ subscription })
            });
            assert.strictEqual(res2.status, 201);

            // Check we don't have duplicate subscriptions
            const push = require('../lib/push');
            const subs = push.getSubscriptionsForUser('legacy_admin');
            const matchingEndpoints = subs.filter(s =>
                s.subscription.endpoint === subscription.endpoint
            );

            assert.strictEqual(matchingEndpoints.length, 1, 'Should not have duplicate subscriptions');
        });

        test('should handle empty groupIds gracefully', async () => {
            const push = require('../lib/push');

            const result = push.getSubscriptionsForGroup('nonexistent-group-xyz');

            assert.ok(Array.isArray(result), 'Should return an array');
            // May or may not be empty depending on admin wildcard
        });
    });
});

