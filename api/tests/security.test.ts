
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Security Tests (tRPC & Standard API)
 */


import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort } from './test-utils.js';

let PORT: number;
let API_URL: string;

let server: Server | undefined;

async function request(path: string): Promise<{ status: number; headers: Headers; body: unknown }> {
    const response = await fetch(`${API_URL}${path}`);
    const headers = response.headers;
    const body: unknown = await response.json();
    return { status: response.status, headers, body };
}

await describe('Security and Hardening Tests', async () => {
    before(async () => {
        PORT = await getAvailablePort();
        API_URL = `http://localhost:${String(PORT)}`;
        process.env.PORT = String(PORT);
        const { app } = await import('../src/server.js');
        server = app.listen(PORT, () => {
            console.log(`Security test server started on port ${String(PORT)}`);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        if (server !== undefined) {
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Security test server closed');
                    resolve();
                });
            });
        }
    });

    await describe('HTTP Headers & Security Hardening', async () => {
        await it('should include X-Content-Type-Options: nosniff', async (): Promise<void> => {
            const { headers } = await request('/health');
            assert.strictEqual(headers.get('x-content-type-options'), 'nosniff');
        });

        await it('should include X-Frame-Options: DENY', async (): Promise<void> => {
            const { headers } = await request('/health');
            assert.strictEqual(headers.get('x-frame-options'), 'DENY');
        });

        await it('should include Content-Security-Policy header', async (): Promise<void> => {
            const { headers } = await request('/health');
            const csp = headers.get('content-security-policy');
            assert.ok(csp !== null && csp !== '', 'CSP header should be present');
            assert.ok(csp.includes('default-src'), 'CSP should include default-src');
        });
    });

    await describe('Authentication and Authorization', async () => {
        await it('should reject access to private routes without token', async (): Promise<void> => {
            const response = await fetch(`${API_URL}/trpc/users.list`);
            assert.strictEqual(response.status, 401);
        });

        await it('should reject invalid auth token format', async (): Promise<void> => {
            const response = await fetch(`${API_URL}/trpc/users.list`, {
                headers: {
                    'Authorization': 'InvalidFormat token123'
                }
            });
            assert.strictEqual(response.status, 401);
        });

        await it('should reject malformed JWT token', async (): Promise<void> => {
            const response = await fetch(`${API_URL}/trpc/users.list`, {
                headers: {
                    'Authorization': 'Bearer not.a.valid.jwt.token'
                }
            });
            assert.strictEqual(response.status, 401);
        });

        await it('should reject expired token signature', async (): Promise<void> => {
            // This is a properly formatted but invalid JWT (wrong signature)
            const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidHlwZSI6ImFjY2VzcyJ9.invalid_signature';
            const response = await fetch(`${API_URL}/trpc/users.list`, {
                headers: {
                    'Authorization': `Bearer ${fakeToken}`
                }
            });
            assert.strictEqual(response.status, 401);
        });
    });

    await describe('Input Validation Security', async () => {
        await it('should reject SQL injection in domain requests', async (): Promise<void> => {
            const response = await fetch(`${API_URL}/trpc/requests.create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    json: {
                        domain: "'; DROP TABLE requests; --",
                        reason: 'test',
                        requesterEmail: 'test@example.com'
                    }
                })
            });
            // Should reject as invalid domain, not cause SQL error
            const body = await response.json() as { error?: { message?: string } };
            const hasInvalidMessage = body.error?.message?.includes('Invalid') === true;
            const is400Status = response.status === 400;
            assert.ok(hasInvalidMessage || is400Status);
        });

        await it('should sanitize XSS in domain name', async (): Promise<void> => {
            const response = await fetch(`${API_URL}/trpc/requests.create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    json: {
                        domain: '<script>alert("xss")</script>.com',
                        reason: 'test',
                        requesterEmail: 'test@example.com'
                    }
                })
            });
            // Should reject as invalid domain
            assert.ok(response.status === 400 || response.status === 500);
        });

        await it('should handle extremely long input gracefully', async (): Promise<void> => {
            const longDomain = 'a'.repeat(1000) + '.com';
            const response = await fetch(`${API_URL}/trpc/requests.create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    json: {
                        domain: longDomain,
                        reason: 'test',
                        requesterEmail: 'test@example.com'
                    }
                })
            });
            // Should reject, not crash
            assert.ok(response.status === 400 || response.status === 500);
        });
    });
});
