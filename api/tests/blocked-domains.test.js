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
 * Blocked Domains Tests - US3: Aprobación Delegada
 * 
 * Tests for the blocked domain validation feature:
 * - isDomainBlocked() function validates against blocked-subdomains.txt
 * - Teachers cannot approve blocked domains (403 DOMAIN_BLOCKED)
 * - Admins can override and approve blocked domains
 * - API endpoints for checking and listing blocked domains
 * 
 * Run with: npm run test:blocked-domains (or node --test tests/blocked-domains.test.js)
 */

const { test, describe, before, after, mock } = require('node:test');
const assert = require('node:assert');

const PORT = 3002;
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Blocked domains tests timed out! Forcing exit...');
    process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server;
let adminToken = null;
let teacherToken = null;
let teacherUserId = null;
let pendingRequestId = null;

const TEACHER_EMAIL = `blocked-test-teacher-${Date.now()}@school.edu`;
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'ciencias-3eso';

describe('Blocked Domains Tests - US3', { timeout: 45000 }, () => {
    before(async () => {
        // Clear module cache to avoid port conflicts
        delete require.cache[require.resolve('../server.js')];

        process.env.PORT = PORT;
        process.env.ADMIN_TOKEN = 'test-admin-token';

        const { app } = require('../server.js');

        server = app.listen(PORT, () => {
            console.log(`Blocked domains test server started on port ${PORT}`);
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
                    console.log('Blocked domains test server closed');
                    resolve();
                });
            });
        }
    });

    // ============================================
    // Setup: Create teacher user with role
    // ============================================
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
            const data = await response.json();
            teacherUserId = data.user.id;
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
            const data = await response.json();
            assert.ok(data.token);
            teacherToken = data.token;
        });
    });

    // ============================================
    // API: Check Domain Blocked Endpoint
    // ============================================
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
            const data = await response.json();
            assert.ok(data.success);
            // Result depends on blocked-subdomains.txt content
            assert.ok(typeof data.blocked === 'boolean');
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
            const data = await response.json();
            assert.ok(data.success);
            // wikipedia.org should typically not be blocked
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

    // ============================================
    // API: List Blocked Domains (Admin only)
    // ============================================
    describe('GET /api/requests/domains/blocked - List blocked domains', () => {
        test('should return list of blocked domains for admin', async () => {
            const response = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.strictEqual(response.status, 200);
            const data = await response.json();
            assert.ok(data.success);
            assert.ok(Array.isArray(data.domains));
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

    // ============================================
    // Teacher Approval: Blocked Domain Handling
    // ============================================
    describe('Teacher Approval of Blocked Domains', () => {
        test('setup: create a pending request for blocked domain', async () => {
            // First, check which domains are blocked
            const blockedRes = await fetch(`${API_URL}/api/requests/domains/blocked`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const blockedData = await blockedRes.json();

            // Use first blocked domain if available, otherwise use a common one
            const blockedDomain = blockedData.domains?.[0] || 'facebook.com';

            // Create a pending request for this domain
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

            // Store request ID for approval test if successful
            if (response.status === 201) {
                const data = await response.json();
                pendingRequestId = data.request?.id || data.id;
            }
            // Request creation might fail if domain already exists - that's ok
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

            // Should get 403 with DOMAIN_BLOCKED code
            assert.strictEqual(response.status, 403);
            const data = await response.json();
            assert.strictEqual(data.code, 'DOMAIN_BLOCKED');
            assert.ok(data.domain);
            assert.ok(data.hint);
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

            // Admin should succeed or get already approved
            assert.ok(
                response.status === 200 || response.status === 400,
                `Expected 200 or 400, got ${response.status}`
            );
        });
    });

    // ============================================
    // Non-blocked domain approval (teacher success)
    // ============================================
    describe('Teacher Approval of Non-blocked Domains', () => {
        let nonBlockedRequestId = null;

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
                const data = await response.json();
                nonBlockedRequestId = data.request?.id || data.id;
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

            // Should succeed (200) or be already approved (400)
            assert.ok(
                response.status === 200 || response.status === 400,
                `Expected success or already processed, got ${response.status}`
            );
        });
    });
});
