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
 * API Tests for Whitelist Web Manager
 * Phase 1 of Quality Improvement Plan
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Set test data directory before requiring app
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'test-data');
process.env.DATA_DIR = TEST_DATA_DIR;

const app = require('../index');

describe('Whitelist Web API', () => {
    let agent;

    beforeAll(() => {
        // Create test data directory
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(path.join(TEST_DATA_DIR, 'export'))) {
            fs.mkdirSync(path.join(TEST_DATA_DIR, 'export'), { recursive: true });
        }
        agent = request.agent(app);
    });

    afterAll(() => {
        // Clean up test data
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    // ============== Auth Tests ==============
    describe('Authentication', () => {
        test('POST /api/auth/login - should reject invalid credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'wrongpassword' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Credenciales inválidas');
        });

        test('POST /api/auth/login - should accept valid credentials', async () => {
            const res = await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.user.username).toBe('admin');
        });

        test('GET /api/auth/check - should return authenticated after login', async () => {
            const res = await agent.get('/api/auth/check');

            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(true);
        });

        test('POST /api/auth/logout - should logout successfully', async () => {
            const res = await agent.post('/api/auth/logout');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test('GET /api/auth/check - should return unauthenticated after logout', async () => {
            const res = await agent.get('/api/auth/check');

            expect(res.body.authenticated).toBe(false);
        });
    });

    // ============== Protected Routes ==============
    describe('Protected Routes', () => {
        test('GET /api/groups - should reject unauthenticated requests', async () => {
            const res = await request(app).get('/api/groups');

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('No autorizado');
        });
    });

    // ============== Groups CRUD ==============
    describe('Groups', () => {
        let groupId;

        beforeAll(async () => {
            // Login first
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });
        });

        test('POST /api/groups - should create a new group', async () => {
            const res = await agent
                .post('/api/groups')
                .send({ name: 'test-group', displayName: 'Test Group' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.id).toBeDefined();
            groupId = res.body.id;
        });

        test('POST /api/groups - should reject duplicate group names', async () => {
            const res = await agent
                .post('/api/groups')
                .send({ name: 'test-group', displayName: 'Duplicate Group' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('existe');
        });

        test('POST /api/groups - should reject missing fields', async () => {
            const res = await agent
                .post('/api/groups')
                .send({ name: 'incomplete' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('requerido');
        });

        test('GET /api/groups - should list all groups', async () => {
            const res = await agent.get('/api/groups');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        test('GET /api/groups/:id - should get group by ID', async () => {
            const res = await agent.get(`/api/groups/${groupId}`);

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('test-group');
            expect(res.body.display_name).toBe('Test Group');
        });

        test('PUT /api/groups/:id - should update group', async () => {
            const res = await agent
                .put(`/api/groups/${groupId}`)
                .send({ displayName: 'Updated Test Group', enabled: true });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // ============== Rules CRUD ==============
    describe('Rules', () => {
        let groupId;
        let ruleId;

        beforeAll(async () => {
            // Login and create a group
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            const groupRes = await agent
                .post('/api/groups')
                .send({ name: 'rules-test', displayName: 'Rules Test' });
            groupId = groupRes.body.id;
        });

        test('POST /api/groups/:id/rules - should create a whitelist rule', async () => {
            const res = await agent
                .post(`/api/groups/${groupId}/rules`)
                .send({ type: 'whitelist', value: 'google.com', comment: 'Search engine' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.id).toBeDefined();
            ruleId = res.body.id;
        });

        test('POST /api/groups/:id/rules - should normalize domain to lowercase', async () => {
            const res = await agent
                .post(`/api/groups/${groupId}/rules`)
                .send({ type: 'whitelist', value: 'GitHub.COM' });

            expect(res.status).toBe(200);

            // Check it was normalized
            const rulesRes = await agent.get(`/api/groups/${groupId}/rules`);
            const rule = rulesRes.body.find(r => r.value === 'github.com');
            expect(rule).toBeDefined();
        });

        test('POST /api/groups/:id/rules - should reject duplicate rules', async () => {
            const res = await agent
                .post(`/api/groups/${groupId}/rules`)
                .send({ type: 'whitelist', value: 'google.com' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('existe');
        });

        test('POST /api/groups/:id/rules - should reject missing fields', async () => {
            const res = await agent
                .post(`/api/groups/${groupId}/rules`)
                .send({ type: 'whitelist' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('requeridos');
        });

        test('POST /api/groups/:id/rules/bulk - should create multiple rules', async () => {
            const res = await agent
                .post(`/api/groups/${groupId}/rules/bulk`)
                .send({
                    type: 'whitelist',
                    values: ['example.com', 'test.org', 'sample.net']
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(3);
        });

        test('GET /api/groups/:id/rules - should list all rules', async () => {
            const res = await agent.get(`/api/groups/${groupId}/rules`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(4);
        });

        test('GET /api/groups/:id/rules?type=whitelist - should filter by type', async () => {
            // First add a blocked subdomain
            await agent
                .post(`/api/groups/${groupId}/rules`)
                .send({ type: 'blocked_subdomain', value: 'ads.google.com' });

            const res = await agent.get(`/api/groups/${groupId}/rules?type=whitelist`);

            expect(res.status).toBe(200);
            expect(res.body.every(r => r.type === 'whitelist')).toBe(true);
        });

        test('DELETE /api/rules/:id - should delete a rule', async () => {
            const res = await agent.delete(`/api/rules/${ruleId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // ============== Export Tests ==============
    describe('Export', () => {
        let groupId;

        beforeAll(async () => {
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });

            const groupRes = await agent
                .post('/api/groups')
                .send({ name: 'export-test', displayName: 'Export Test' });
            groupId = groupRes.body.id;

            // Add various rules
            await agent.post(`/api/groups/${groupId}/rules`)
                .send({ type: 'whitelist', value: 'allowed.com' });
            await agent.post(`/api/groups/${groupId}/rules`)
                .send({ type: 'blocked_subdomain', value: 'blocked.allowed.com' });
            await agent.post(`/api/groups/${groupId}/rules`)
                .send({ type: 'blocked_path', value: 'allowed.com/ads' });
        });

        test('GET /export/:name.txt - should return dnsmasq format', async () => {
            const res = await request(app).get('/export/export-test.txt');

            expect(res.status).toBe(200);
            expect(res.type).toBe('text/plain');
            expect(res.text).toContain('## WHITELIST');
            expect(res.text).toContain('allowed.com');
            expect(res.text).toContain('## BLOCKED-SUBDOMAINS');
            expect(res.text).toContain('blocked.allowed.com');
            expect(res.text).toContain('## BLOCKED-PATHS');
            expect(res.text).toContain('allowed.com/ads');
        });

        test('GET /export/:name.txt - should return 404 for unknown group', async () => {
            const res = await request(app).get('/export/unknown-group.txt');

            expect(res.status).toBe(404);
        });

        test('GET /export/:name.txt - public endpoint (no auth required)', async () => {
            // Use a new agent without session
            const res = await request(app).get('/export/export-test.txt');

            expect(res.status).toBe(200);
        });
    });

    // ============== Stats Tests ==============
    describe('Stats', () => {
        beforeAll(async () => {
            await agent
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'admin123' });
        });

        test('GET /api/stats - should return statistics', async () => {
            const res = await agent.get('/api/stats');

            expect(res.status).toBe(200);
            expect(res.body.groupCount).toBeDefined();
            expect(res.body.whitelistCount).toBeDefined();
            expect(res.body.blockedCount).toBeDefined();
        });
    });
});
