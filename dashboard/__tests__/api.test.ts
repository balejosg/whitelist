/**
 * Dashboard API Integration Tests
 * Tests for Express routes in index.ts
 */

import request from 'supertest';
import app from '../src/index.js';

// Agent for maintaining session cookies
const agent = request.agent(app);

describe('API Routes', () => {
    describe('Authentication', () => {
        test('POST /api/auth/login returns 401 for invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'wrong-password' });

            expect(response.status).toBe(401);
            expect(response.body.error).toBeDefined();
        });

        test('POST /api/auth/login returns 400 for missing credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({});

            expect(response.status).toBe(400);
        });

        test('POST /api/auth/login succeeds with valid credentials', async () => {
            const response = await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user).toBeDefined();
        });

        test('POST /api/auth/logout logs out successfully', async () => {
            // Login first
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            // Then logout
            const response = await agent.post('/api/auth/logout');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Protected Routes (require authentication)', () => {
        beforeAll(async () => {
            // Login before running protected route tests
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });
        });

        test('GET /api/auth/check returns current user', async () => {
            const response = await agent.get('/api/auth/check');

            expect(response.status).toBe(200);
            expect(response.body.authenticated).toBe(true);
            expect(response.body.user).toBeDefined();
        });

        test('GET /api/stats returns statistics', async () => {
            const response = await agent.get('/api/stats');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('groupCount');
            expect(response.body).toHaveProperty('whitelistCount');
            expect(response.body).toHaveProperty('blockedCount');
        });

        test('GET /api/groups returns groups array', async () => {
            const response = await agent.get('/api/groups');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('GET /api/system/status returns system status', async () => {
            const response = await agent.get('/api/system/status');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('enabled');
            expect(response.body).toHaveProperty('totalGroups');
        });
    });

    describe('Unauthenticated Access', () => {
        // Use a fresh request instance (no session)
        test('GET /api/groups returns 401 without auth', async () => {
            const response = await request(app).get('/api/groups');

            expect(response.status).toBe(401);
        });

        test('GET /api/stats returns 401 without auth', async () => {
            const response = await request(app).get('/api/stats');

            expect(response.status).toBe(401);
        });
    });
});
