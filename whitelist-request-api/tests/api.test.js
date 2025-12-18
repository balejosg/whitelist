const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const API_URL = 'http://localhost:3000';

describe('Whitelist Request API Tests', { timeout: 30000 }, () => {
  before(async () => {
    // Start server for testing
    require('../server.js');
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  after(() => {
    // Force exit to prevent hang from open server connections
    setTimeout(() => process.exit(0), 500);
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
});
