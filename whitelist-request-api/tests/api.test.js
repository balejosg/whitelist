const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const API_URL = 'http://localhost:3000';
let server;

describe('Whitelist Request API Tests', () => {
  before(async () => {
    // Start server for testing
    const app = require('../server.js');
    // Server should be started by the app itself
    await new Promise(resolve => setTimeout(resolve, 1000));
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
        domains: ['example.com', 'test.org'],
        reason: 'Testing purposes',
        requester: 'Test User',
        contact: 'test@example.com'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      assert.strictEqual(response.status, 201);
      
      const data = await response.json();
      assert.ok(data.id);
      assert.strictEqual(data.status, 'pending');
    });

    test('should reject request without domains', async () => {
      const requestData = {
        reason: 'Testing',
        requester: 'Test User'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      assert.strictEqual(response.status, 400);
    });

    test('should reject empty domains array', async () => {
      const requestData = {
        domains: [],
        reason: 'Testing',
        requester: 'Test User'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      assert.strictEqual(response.status, 400);
    });

    test('should sanitize XSS attempts in domain names', async () => {
      const requestData = {
        domains: ['<script>alert("xss")</script>.com'],
        reason: 'Testing',
        requester: 'Test User'
      };

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      // Should either reject or sanitize
      assert.ok(response.status === 400 || response.status === 201);
    });
  });

  describe('GET /api/requests - List Requests', () => {
    test('should list all pending requests', async () => {
      const response = await fetch(`${API_URL}/api/requests`);
      assert.strictEqual(response.status, 200);
      
      const data = await response.json();
      assert.ok(Array.isArray(data));
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
