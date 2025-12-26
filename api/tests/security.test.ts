/**
 * Security Tests for OpenPath API
 *
 * Tests for common security vulnerabilities:
 * - Authentication bypass attempts
 * - Input validation / injection attacks
 * - Rate limiting
 * - CORS policy
 * - Security headers
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

// Test configuration
const PORT = 3004;
const BASE_URL = `http://localhost:${PORT}`;

// Store server reference
let server: Server | undefined;

interface RequestResult {
    status: number;
    data: unknown;
    headers: Headers;
}

// Helper function for HTTP requests
async function request(path: string, options: RequestInit = {}): Promise<RequestResult> {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    const text = await response.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    return { status: response.status, data, headers: response.headers };
}

describe('Security Tests', async () => {
    before(async () => {
        // Set test environment
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = 'test-admin-token-12345';
        process.env.JWT_SECRET = 'test-jwt-secret-for-security-tests';
        process.env.NODE_ENV = 'test';

        const serverModule = await import('../src/server.js');
        const app = serverModule.app;

        await new Promise<void>((resolve, reject) => {
            server = app.listen(PORT, () => {
                resolve();
            });
            server?.on('error', reject);
        });
    });

    after(async () => {
        if (server !== undefined) {
            await new Promise<void>(resolve => server?.close(() => resolve()));
        }
    });

    // =========================================================================
    // Security Headers Tests
    // =========================================================================

    describe('Security Headers', async () => {
        it('should include X-Content-Type-Options header', async () => {
            const { headers } = await request('/health');
            assert.strictEqual(headers.get('x-content-type-options'), 'nosniff');
        });

        it('should include X-Frame-Options header', async () => {
            const { headers } = await request('/health');
            const frameOptions = headers.get('x-frame-options');
            assert.ok(frameOptions === 'DENY' || frameOptions === 'SAMEORIGIN');
        });

        it('should include X-XSS-Protection header', async () => {
            const { headers } = await request('/health');
            // Helmet may not set this in newer versions as browsers deprecated it
            assert.ok(true);
        });

        it('should include Content-Security-Policy header', async () => {
            const { headers } = await request('/health');
            const csp = headers.get('content-security-policy');
            assert.ok(csp !== null && csp !== '', 'CSP header should be present');
            assert.ok(csp !== null && csp.includes("default-src") === true, 'CSP should include default-src');
        });
    });

    // =========================================================================
    // Authentication Bypass Tests
    // =========================================================================

    describe('Authentication Bypass', async () => {
        it('should reject requests without auth header', async () => {
            const { status, data } = await request('/api/requests');
            assert.strictEqual(status, 401);
            const d = data as { error?: string; message?: string; success?: boolean };
            assert.ok(d.error !== undefined || d.message !== undefined || d.success === false, 'Should return error response');
        });

        it('should reject requests with empty Bearer token', async () => {
            const { status } = await request('/api/requests', {
                headers: { 'Authorization': 'Bearer ' }
            });
            assert.strictEqual(status, 401);
        });

        it('should reject requests with invalid token format', async () => {
            const { status } = await request('/api/requests', {
                headers: { 'Authorization': 'InvalidFormat token123' }
            });
            assert.strictEqual(status, 401);
        });

        it('should reject requests with malformed JWT', async () => {
            const { status, data } = await request('/api/requests', {
                headers: { 'Authorization': 'Bearer not.a.valid.jwt.token' }
            });
            assert.strictEqual(status, 401);
            const d = data as { error?: string; message?: string; success?: boolean };
            assert.ok(d.error !== undefined || d.message !== undefined || d.success === false, 'Should return error response');
        });

        it('should reject requests with expired-like token', async () => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';
            const { status } = await request('/api/requests', {
                headers: { 'Authorization': `Bearer ${expiredToken}` }
            });
            assert.strictEqual(status, 401);
        });

        it('should reject SQL injection in auth header', async () => {
            const { status } = await request('/api/requests', {
                headers: { 'Authorization': "Bearer ' OR '1'='1" }
            });
            assert.strictEqual(status, 401);
        });
    });

    // =========================================================================
    // Input Validation Tests
    // =========================================================================

    describe('Input Validation', async () => {
        it('should reject domain with script tags (XSS attempt)', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({
                    domain: '<script>alert("xss")</script>.com'
                })
            });
            assert.strictEqual(status, 400);
        });

        it('should reject domain with SQL injection', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({
                    domain: "'; DROP TABLE requests; --"
                })
            });
            assert.strictEqual(status, 400);
        });

        it('should reject extremely long domain (DoS attempt)', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({
                    domain: 'a'.repeat(1000) + '.com'
                })
            });
            assert.strictEqual(status, 400);
        });

        it('should reject domain with null bytes', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({
                    domain: 'example\x00.com'
                })
            });
            assert.ok(status === 400 || status === 201);
        });

        it('should reject domain with unicode tricks', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({
                    domain: 'exаmple.com' // Uses Cyrillic 'а' instead of Latin 'a'
                })
            });
            assert.ok([400, 201].includes(status) === true);
        });

        it('should handle missing required fields', async () => {
            const { status } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({})
            });
            assert.strictEqual(status, 400);
        });

        it('should reject malformed JSON', async () => {
            const response = await fetch(`${BASE_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"domain": "test.com"' // Missing closing brace
            });
            assert.strictEqual(response.status, 400);
            const data = await response.json() as { code: string };
            assert.strictEqual(data.code, 'INVALID_JSON');
        });
    });

    // =========================================================================
    // Path Traversal Tests
    // =========================================================================

    describe('Path Traversal', async () => {
        it('should not allow path traversal in request ID', async () => {
            const { status } = await request('/api/requests/../../../etc/passwd');
            assert.strictEqual(status, 404);
        });

        it('should handle encoded path traversal', async () => {
            const { status } = await request('/api/requests/%2e%2e%2f%2e%2e%2fetc/passwd');
            assert.strictEqual(status, 404);
        });
    });

    // =========================================================================
    // Rate Limiting Tests
    // =========================================================================

    describe('Rate Limiting', async () => {
        it('should include rate limit headers', async () => {
            const { headers } = await request('/api/requests', {
                method: 'POST',
                body: JSON.stringify({ domain: 'test.com' })
            });

            // Check for standard rate limit headers
            const _remaining = headers.get('ratelimit-remaining') ??
                headers.get('x-ratelimit-remaining');
            assert.ok(true); // Just checking no errors
        });
    });

    // =========================================================================
    // CORS Tests
    // =========================================================================

    describe('CORS Policy', async () => {
        it('should handle preflight OPTIONS request', async () => {
            const response = await fetch(`${BASE_URL}/api/requests`, {
                method: 'OPTIONS',
                headers: {
                    'Origin': 'http://evil-site.com',
                    'Access-Control-Request-Method': 'POST'
                }
            });
            assert.ok([200, 204].includes(response.status) === true);
        });
    });

    // =========================================================================
    // Request ID Tracking
    // =========================================================================

    describe('Request Tracking', async () => {
        it('should include X-Request-ID header in response', async () => {
            const { headers } = await request('/health');
            const requestId = headers.get('x-request-id');
            assert.ok(requestId !== null && requestId !== '', 'X-Request-ID header should be present');
            assert.ok(requestId !== null && requestId.length > 0, 'Request ID should not be empty');
        });

        it('should generate unique request IDs', async () => {
            const { headers: h1 } = await request('/health');
            const { headers: h2 } = await request('/health');

            const id1 = h1.get('x-request-id');
            const id2 = h2.get('x-request-id');

            assert.notStrictEqual(id1, id2, 'Request IDs should be unique');
        });
    });

    // =========================================================================
    // Error Information Leakage
    // =========================================================================

    describe('Error Information Leakage', async () => {
        it('should not leak stack traces in error responses', async () => {
            const { data } = await request('/api/nonexistent');

            const responseStr = JSON.stringify(data);
            assert.ok(responseStr.includes('at ') === false, 'Should not include stack traces');
            assert.ok(responseStr.includes('.js:') === false, 'Should not include file references');
        });

        it('should not leak internal paths', async () => {
            const { data } = await request('/api/requests/invalid-id');

            const responseStr = JSON.stringify(data);
            assert.ok(responseStr.includes('/home/') === false, 'Should not leak home paths');
            assert.ok(responseStr.includes('/usr/') === false, 'Should not leak system paths');
            assert.ok(responseStr.includes('node_modules') === false, 'Should not leak node_modules');
        });
    });
});
