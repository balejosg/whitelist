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
 * Integration Tests - API-to-client workflow validation
 * 
 * These tests verify complete workflows across multiple API endpoints,
 * simulating real-world usage patterns.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

// Test configuration
const PORT = 3010;  // Different port to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

// Set test environment
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'integration-test-admin-token';
process.env.SHARED_SECRET = 'integration-test-shared-secret';
process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.PORT = PORT;

let server;

// Helper function for HTTP requests
function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: data ? JSON.parse(data) : null
                    });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

describe('Integration: Complete User Workflow', () => {
    let accessToken;
    let userId;

    before(async () => {
        // Start server
        const { app } = require('../server');
        server = app.listen(PORT);
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    after(() => {
        if (server) server.close();
    });

    it('should complete user registration → login → profile access flow', async () => {
        // Step 1: Register a new user
        const registerRes = await makeRequest('POST', '/api/auth/register', {
            email: 'integration@test.com',
            password: 'IntegrationTest123!',
            name: 'Integration Test User'
        });

        assert.strictEqual(registerRes.status, 201, 'Registration should succeed');
        assert.ok(registerRes.body.success, 'Registration response should indicate success');
        assert.ok(registerRes.body.user, 'Response should contain user data');
        userId = registerRes.body.user.id;

        // Step 2: Login with credentials
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            email: 'integration@test.com',
            password: 'IntegrationTest123!'
        });

        assert.strictEqual(loginRes.status, 200, 'Login should succeed');
        assert.ok(loginRes.body.accessToken, 'Login should return access token');
        accessToken = loginRes.body.accessToken;

        // Step 3: Access profile with token
        const profileRes = await makeRequest('GET', '/api/auth/me', null, {
            'Authorization': `Bearer ${accessToken}`
        });

        assert.strictEqual(profileRes.status, 200, 'Profile access should succeed');
        assert.strictEqual(profileRes.body.user.email, 'integration@test.com');
    });
});

describe('Integration: Health Report Flow', () => {
    before(async () => {
        if (!server) {
            const { app } = require('../server');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server) server.close();
    });

    it('should complete health report submission → retrieval flow', async () => {
        const testHostname = 'test-machine-' + Date.now();

        // Step 1: Submit health report
        const reportRes = await makeRequest('POST', '/api/health-reports', {
            hostname: testHostname,
            status: 'healthy',
            version: '3.5',
            uptime: 3600,
            services: {
                dnsmasq: 'running',
                firewall: 'active'
            }
        }, {
            'X-Shared-Secret': process.env.SHARED_SECRET
        });

        assert.ok([200, 201].includes(reportRes.status), 'Health report submission should succeed');

        // Step 2: Retrieve reports as admin
        const listRes = await makeRequest('GET', '/api/health-reports', null, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(listRes.status, 200, 'Should retrieve health reports');
        assert.ok(Array.isArray(listRes.body.hosts) || listRes.body.success, 'Response should contain hosts data');
    });
});

describe('Integration: Classroom Management Flow', () => {
    let classroomId;

    before(async () => {
        if (!server) {
            const { app } = require('../server');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server) server.close();
    });

    it('should complete classroom create → update → delete flow', async () => {
        // Step 1: Create classroom
        const createRes = await makeRequest('POST', '/api/classrooms', {
            name: 'Integration Test Lab',
            description: 'Test classroom for integration testing',
            groups: ['default'],
            capacity: 30
        }, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(createRes.status, 201, 'Classroom creation should succeed');
        assert.ok(createRes.body.classroom, 'Response should contain classroom');
        classroomId = createRes.body.classroom.id;

        // Step 2: Update classroom
        const updateRes = await makeRequest('PUT', `/api/classrooms/${classroomId}`, {
            name: 'Integration Test Lab (Updated)',
            capacity: 35
        }, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(updateRes.status, 200, 'Classroom update should succeed');
        assert.strictEqual(updateRes.body.classroom.name, 'Integration Test Lab (Updated)');

        // Step 3: Get classroom details
        const getRes = await makeRequest('GET', `/api/classrooms/${classroomId}`, null, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(getRes.status, 200, 'Classroom retrieval should succeed');
        assert.strictEqual(getRes.body.classroom.capacity, 35);

        // Step 4: Delete classroom
        const deleteRes = await makeRequest('DELETE', `/api/classrooms/${classroomId}`, null, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(deleteRes.status, 200, 'Classroom deletion should succeed');
    });
});

describe('Integration: Domain Request Workflow', () => {
    let requestId;

    before(async () => {
        if (!server) {
            const { app } = require('../server');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server) server.close();
    });

    it('should complete domain request → review → decision flow', async () => {
        // Step 1: Submit domain request (public)
        const submitRes = await makeRequest('POST', '/api/requests', {
            domain: 'integration-test-' + Date.now() + '.example.com',
            reason: 'Integration test request',
            requester: 'Test Student'
        });

        assert.strictEqual(submitRes.status, 201, 'Request submission should succeed');
        assert.ok(submitRes.body.request, 'Response should contain request');
        requestId = submitRes.body.request.id;

        // Step 2: List requests as admin
        const listRes = await makeRequest('GET', '/api/requests', null, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(listRes.status, 200, 'Request listing should succeed');
        assert.ok(Array.isArray(listRes.body.requests), 'Response should contain requests array');

        // Step 3: Get request details
        const getRes = await makeRequest('GET', `/api/requests/${requestId}`, null, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(getRes.status, 200, 'Request retrieval should succeed');
        assert.strictEqual(getRes.body.request.status, 'pending');

        // Step 4: Reject the request (approve requires GitHub integration)
        const rejectRes = await makeRequest('POST', `/api/requests/${requestId}/reject`, {
            reason: 'Integration test rejection'
        }, {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`
        });

        assert.strictEqual(rejectRes.status, 200, 'Request rejection should succeed');
    });
});

console.log('Running Integration Tests...');
