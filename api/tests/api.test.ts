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

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = process.env.PORT ?? '3000';
const API_URL = `http://localhost:${PORT}`;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ API tests timed out! Forcing exit...');
    process.exit(1);
}, 25000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

await describe('Whitelist Request API Tests', { timeout: 30000 }, async () => {
    before(async () => {
        // Start server for testing - dynamic import for ESM
        const { app } = await import('../src/server.js');
        const PORT = parseInt(process.env.PORT ?? '3000', 10);

        server = app.listen(PORT, () => {
            console.log(`Test server started on port ${String(PORT)}`);
        });

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        // Stop token store cleanup interval
        try {
            const { resetTokenStore } = await import('../src/lib/token-store.js');
            resetTokenStore();
        } catch (e) {
            console.error('Error resetting token store:', e);
        }

        // Properly close the server
        if (server !== undefined) {
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Test server closed');
                    resolve();
                });
            });
        }
    });

    await describe('Health Check', async () => {
        await test('GET /health should return 200 OK', async () => {
            const response = await fetch(`${API_URL}/health`);
            assert.strictEqual(response.status, 200);

            const data = await response.json() as { status: string; timestamp: string };
            assert.ok(['ok', 'degraded'].includes(data.status), `Expected ok or degraded, got ${data.status}`);
            assert.ok(data.timestamp !== '');
        });
    });

    await describe('POST /api/requests - Submit Domain Request', async () => {
        await test('should accept valid domain request', async () => {
            const requestData = {
                domain: 'test-' + String(Date.now()) + '.example.com',
                reason: 'Testing purposes',
                requester_email: 'test@example.com'
            };

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as { request_id: string; status: string };
            assert.ok(data.request_id !== '');
            assert.strictEqual(data.status, 'pending');
        });

        await test('should reject request without domain', async () => {
            const requestData = {
                reason: 'Testing',
                requester_email: 'test@example.com'
            };

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            assert.strictEqual(response.status, 400);
        });

        await test('should reject invalid domain format', async () => {
            const requestData = {
                domain: 'not-a-valid-domain',
                reason: 'Testing'
            };

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            assert.strictEqual(response.status, 400);
        });

        await test('should reject XSS attempts in domain names', async () => {
            const requestData = {
                domain: '<script>alert("xss")</script>.com',
                reason: 'Testing'
            };

            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            assert.strictEqual(response.status, 400);
        });
    });

    await describe('GET /api/requests - List Requests', async () => {
        await test('should require authentication for listing requests', async () => {
            const response = await fetch(`${API_URL}/api/requests`);
            assert.strictEqual(response.status, 401);
        });
    });

    await describe('CORS Headers', async () => {
        await test('should include CORS headers', async () => {
            const response = await fetch(`${API_URL}/health`, {
                headers: { 'Origin': 'http://localhost:3000' }
            });
            const corsHeader = response.headers.get('access-control-allow-origin');
            assert.ok(corsHeader !== null && corsHeader !== '', 'Expected access-control-allow-origin header to be set');
        });
    });

    await describe('Error Handling', async () => {
        await test('should return 404 for unknown routes', async () => {
            const response = await fetch(`${API_URL}/unknown-route`);
            assert.strictEqual(response.status, 404);
        });

        await test('should handle malformed JSON', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json{{'
            });

            assert.ok(response.status >= 400);
        });
    });

    await describe('GET /api/requests/status/:id - Check Request Status', async () => {
        await test('should return 404 for non-existent request', async () => {
            const response = await fetch(`${API_URL}/api/requests/status/nonexistent-id`);
            assert.strictEqual(response.status, 404);

            const data = await response.json() as { success: boolean };
            assert.strictEqual(data.success, false);
        });

        await test('should return status for existing request', async () => {
            // First create a request
            const createResponse = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: 'status-test-' + String(Date.now()) + '.example.com',
                    reason: 'Testing status endpoint'
                })
            });

            const createData = await createResponse.json() as { request_id: string };
            const requestId = createData.request_id;

            // Then check its status
            const statusResponse = await fetch(`${API_URL}/api/requests/status/${requestId}`);
            assert.strictEqual(statusResponse.status, 200);

            const statusData = await statusResponse.json() as { success: boolean; status: string; request_id: string };
            assert.strictEqual(statusData.success, true);
            assert.strictEqual(statusData.status, 'pending');
            assert.ok(statusData.request_id);
        });
    });

    await describe('POST /api/requests/auto - Auto-inclusion Endpoint', async () => {
        await test('should reject request without required fields', async () => {
            const response = await fetch(`${API_URL}/api/requests/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: 'test.example.com'
                })
            });

            assert.strictEqual(response.status, 400);

            const data = await response.json() as { success: boolean; code: string };
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.code, 'MISSING_FIELDS');
        });

        await test('should reject request with invalid token', async () => {
            const response = await fetch(`${API_URL}/api/requests/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: 'test.example.com',
                    origin_page: 'origin.example.com',
                    group_id: 'test-group',
                    token: 'invalid-token',
                    hostname: 'test-host'
                })
            });

            const data = await response.json() as { success: boolean; code: string };
            assert.strictEqual(data.success, false);
            assert.ok([401, 500].includes(response.status), `Expected 401 or 500, got ${String(response.status)}`);
            assert.ok(['INVALID_TOKEN', 'SERVER_ERROR'].includes(data.code), `Expected INVALID_TOKEN or SERVER_ERROR, got ${data.code}`);
        });

        await test('should reject invalid domain format in auto-inclusion', async () => {
            const response = await fetch(`${API_URL}/api/requests/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: 'not-a-domain',
                    origin_page: 'origin.example.com',
                    group_id: 'test-group',
                    token: 'some-token',
                    hostname: 'test-host'
                })
            });

            assert.ok(response.status >= 400);
        });
    });

    await describe('GET /api/requests/groups/list - List Groups', async () => {
        await test('should require authentication for listing groups', async () => {
            const response = await fetch(`${API_URL}/api/requests/groups/list`);
            assert.strictEqual(response.status, 401);

            const data = await response.json() as { success: boolean };
            assert.strictEqual(data.success, false);
        });
    });

    await describe('Admin Endpoints with Invalid Token', async () => {
        await test('should reject admin list with wrong token', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                headers: { 'Authorization': 'Bearer wrong-token' }
            });
            assert.strictEqual(response.status, 401);
        });

        await test('should reject approve with wrong token', async () => {
            const response = await fetch(`${API_URL}/api/requests/some-id/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer wrong-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ group_id: 'test' })
            });
            assert.strictEqual(response.status, 401);
        });

        await test('should reject reject with wrong token', async () => {
            const response = await fetch(`${API_URL}/api/requests/some-id/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer wrong-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason: 'test' })
            });
            assert.strictEqual(response.status, 401);
        });

        await test('should reject delete with wrong token', async () => {
            const response = await fetch(`${API_URL}/api/requests/some-id`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer wrong-token' }
            });
            assert.strictEqual(response.status, 401);
        });
    });

    await describe('API Info Endpoint', async () => {
        await test('GET /api should return API documentation', async () => {
            const response = await fetch(`${API_URL}/api`);
            assert.strictEqual(response.status, 200);

            const data = await response.json() as { name: string; version: string; endpoints: object };
            assert.ok(data.name !== '');
            assert.ok(data.version !== '');
            assert.strictEqual(typeof data.endpoints, 'object');
        });
    });

    await describe('Input Sanitization', async () => {
        await test('should sanitize reason field', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `sanitize-test-${String(Date.now())}.example.com`,
                    reason: '<script>alert("xss")</script>Normal reason'
                })
            });

            assert.strictEqual(response.status, 201);
        });

        await test('should handle very long domain names', async () => {
            const longDomain = 'a'.repeat(300) + '.example.com';
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: longDomain,
                    reason: 'Testing long domain'
                })
            });

            assert.strictEqual(response.status, 400);
        });

        await test('should handle special characters in email', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `email-test-${String(Date.now())}.example.com`,
                    reason: 'Testing',
                    requester_email: 'valid+tag@example.com'
                })
            });

            assert.strictEqual(response.status, 201);
        });
    });

    await describe('Priority Field', async () => {
        await test('should accept valid priority values', async () => {
            const response = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: `priority-test-${String(Date.now())}.example.com`,
                    reason: 'Testing priority',
                    priority: 'high'
                })
            });

            assert.strictEqual(response.status, 201);
        });
    });
});
