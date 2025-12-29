/**
 * Dashboard API Integration Tests (Node.js native test runner)
 * Tests for Express routes in index.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/index.js';
import * as db from '../src/db.js';

// Cookie jar for maintaining session
let sessionCookie: string | undefined;

await describe('API Routes', async () => {
    before(async () => {
        // Wait for DB connection
        await db.waitForDb();
        // Reset database to ensure admin user exists
        await db.resetDb();
    });

    after(async () => {
        await db.resetDb();
    });

    await describe('Authentication', async () => {
        await it('POST /api/auth/login returns 401 for invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'wrong-password' });

            assert.strictEqual(response.status, 401);
            const body = response.body as { error?: string };
            assert.ok(body.error);
        });

        await it('POST /api/auth/login returns 400 for missing credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({});

            assert.strictEqual(response.status, 400);
        });

        await it('POST /api/auth/login succeeds with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            assert.strictEqual(response.status, 200);
            const body = response.body as { success?: boolean; user?: unknown };
            assert.strictEqual(body.success, true);
            assert.ok(body.user);

            // Save session cookie for subsequent requests
            const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
            if (Array.isArray(cookies) && cookies.length > 0) {
                sessionCookie = cookies[0];
            }
        });

        await it('POST /api/auth/logout logs out successfully', async () => {
            // Login first
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            const cookies = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
            const cookie = Array.isArray(cookies) ? cookies[0] : undefined;

            // Then logout
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', cookie ?? '');

            assert.strictEqual(response.status, 200);
            const body = response.body as { success?: boolean };
            assert.strictEqual(body.success, true);
        });
    });

    await describe('Protected Routes (require authentication)', async () => {
        before(async () => {
            // Login before running protected route tests
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
            if (Array.isArray(cookies) && cookies.length > 0) {
                sessionCookie = cookies[0];
            }
        });

        await it('GET /api/auth/check returns current user', async () => {
            const response = await request(app)
                .get('/api/auth/check')
                .set('Cookie', sessionCookie ?? '');

            assert.strictEqual(response.status, 200);
            const body = response.body as { authenticated?: boolean; user?: unknown };
            assert.strictEqual(body.authenticated, true);
            assert.ok(body.user);
        });

        await it('GET /api/stats returns statistics', async () => {
            const response = await request(app)
                .get('/api/stats')
                .set('Cookie', sessionCookie ?? '');

            assert.strictEqual(response.status, 200);
            const body = response.body as Record<string, unknown>;
            assert.ok('groupCount' in body);
            assert.ok('whitelistCount' in body);
            assert.ok('blockedCount' in body);
        });

        await it('GET /api/groups returns groups array', async () => {
            const response = await request(app)
                .get('/api/groups')
                .set('Cookie', sessionCookie ?? '');

            assert.strictEqual(response.status, 200);
            const body = response.body as unknown[];
            assert.ok(Array.isArray(body));
        });

        await it('GET /api/system/status returns system status', async () => {
            const response = await request(app)
                .get('/api/system/status')
                .set('Cookie', sessionCookie ?? '');

            assert.strictEqual(response.status, 200);
            const body = response.body as Record<string, unknown>;
            assert.ok('enabled' in body);
            assert.ok('totalGroups' in body);
        });
    });

    await describe('Unauthenticated Access', async () => {
        // Use fresh requests without session cookie
        await it('GET /api/groups returns 401 without auth', async () => {
            const response = await request(app).get('/api/groups');

            assert.strictEqual(response.status, 401);
        });

        await it('GET /api/stats returns 401 without auth', async () => {
            const response = await request(app).get('/api/stats');

            assert.strictEqual(response.status, 401);
        });
    });
});
