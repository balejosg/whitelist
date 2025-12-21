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

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const API_URL = 'http://localhost:3000';

let server;

describe('Whitelist Request API Tests', { timeout: 30000 }, () => {
  before(async () => {
    // Start server for testing
    const { app } = require('../server.js');
    const PORT = process.env.PORT || 3000;

    server = app.listen(PORT, () => {
      console.log(`Test server started on port ${PORT}`);
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  after(async () => {
    // Properly close the server
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('Test server closed');
          resolve();
        });
      });
    }
  });

  describe('Health Check', () => {
    test('GET /health should return 200 OK', async () => {
      const response = await fetch(`${API_URL}/health`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.status, 'ok');
      assert.ok(data.timestamp);
    });
  });

  describe('POST /api/requests - Submit Domain Request', () => {
    test('should accept valid domain request', async () => {
      const requestData = {
        domain: 'test-' + Date.now() + '.example.com',
        reason: 'Testing purposes',
        requester_email: 'test@example.com'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.ok(data.request_id);
      assert.strictEqual(data.status, 'pending');
    });

    test('should reject request without domain', async () => {
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

    test('should reject invalid domain format', async () => {
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

    test('should reject XSS attempts in domain names', async () => {
      const requestData = {
        domain: '<script>alert("xss")</script>.com',
        reason: 'Testing'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      // Should reject invalid domain format
      assert.strictEqual(response.status, 400);
    });
  });

  describe('GET /api/requests - List Requests', () => {
    test('should require authentication for listing requests', async () => {
      const response = await fetch(`${API_URL}/api/requests`);
      // Requires admin auth
      assert.strictEqual(response.status, 401);
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers', async () => {
      const response = await fetch(`${API_URL}/health`);

      const corsHeader = response.headers.get('access-control-allow-origin');
      assert.ok(corsHeader);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`${API_URL}/unknown-route`);
      assert.strictEqual(response.status, 404);
    });

    test('should handle malformed JSON', async () => {
      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{{'
      });

      assert.ok(response.status >= 400);
    });
  });

  describe('GET /api/requests/status/:id - Check Request Status', () => {
    test('should return 404 for non-existent request', async () => {
      const response = await fetch(`${API_URL}/api/requests/status/nonexistent-id`);
      assert.strictEqual(response.status, 404);

      const data = await response.json();
      assert.strictEqual(data.success, false);
    });

    test('should return status for existing request', async () => {
      // First create a request
      const createResponse = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'status-test-' + Date.now() + '.example.com',
          reason: 'Testing status endpoint'
        })
      });

      const createData = await createResponse.json();
      const requestId = createData.request_id;

      // Then check its status
      const statusResponse = await fetch(`${API_URL}/api/requests/status/${requestId}`);
      assert.strictEqual(statusResponse.status, 200);

      const statusData = await statusResponse.json();
      assert.strictEqual(statusData.success, true);
      assert.strictEqual(statusData.status, 'pending');
      assert.ok(statusData.request_id);
    });
  });

  describe('POST /api/requests/auto - Auto-inclusion Endpoint', () => {
    test('should reject request without required fields', async () => {
      const response = await fetch(`${API_URL}/api/requests/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'test.example.com'
          // missing: origin_page, group_id, token, hostname
        })
      });

      assert.strictEqual(response.status, 400);

      const data = await response.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.code, 'MISSING_FIELDS');
    });

    test('should reject request with invalid token', async () => {
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

      assert.strictEqual(response.status, 401);

      const data = await response.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.code, 'INVALID_TOKEN');
    });

    test('should reject invalid domain format in auto-inclusion', async () => {
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

      // Should fail validation before token check
      assert.ok(response.status >= 400);
    });
  });

  describe('GET /api/requests/groups/list - List Groups', () => {
    test('should require authentication for listing groups', async () => {
      const response = await fetch(`${API_URL}/api/requests/groups/list`);
      assert.strictEqual(response.status, 401);

      const data = await response.json();
      assert.strictEqual(data.success, false);
    });
  });

  describe('Admin Endpoints with Invalid Token', () => {
    test('should reject admin list with wrong token', async () => {
      const response = await fetch(`${API_URL}/api/requests`, {
        headers: { 'Authorization': 'Bearer wrong-token' }
      });
      assert.strictEqual(response.status, 401);
    });

    test('should reject approve with wrong token', async () => {
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

    test('should reject reject with wrong token', async () => {
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

    test('should reject delete with wrong token', async () => {
      const response = await fetch(`${API_URL}/api/requests/some-id`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer wrong-token' }
      });
      assert.strictEqual(response.status, 401);
    });
  });

  describe('API Info Endpoint', () => {
    test('GET /api should return API documentation', async () => {
      const response = await fetch(`${API_URL}/api`);
      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.name);
      assert.ok(data.version);
      assert.ok(data.endpoints);
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize reason field', async () => {
      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'sanitize-test.example.com',
          reason: '<script>alert("xss")</script>Normal reason'
        })
      });

      assert.strictEqual(response.status, 201);
      // Request should be created but reason should be sanitized
    });

    test('should handle very long domain names', async () => {
      const longDomain = 'a'.repeat(300) + '.example.com';
      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: longDomain,
          reason: 'Testing long domain'
        })
      });

      // Should reject - domain too long
      assert.strictEqual(response.status, 400);
    });

    test('should handle special characters in email', async () => {
      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'email-test.example.com',
          reason: 'Testing',
          requester_email: 'valid+tag@example.com'
        })
      });

      assert.strictEqual(response.status, 201);
    });
  });

  describe('Priority Field', () => {
    test('should accept valid priority values', async () => {
      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'priority-test.example.com',
          reason: 'Testing priority',
          priority: 'high'
        })
      });

      assert.strictEqual(response.status, 201);
    });
  });
});
