/* eslint-disable */
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Integration Tests - API-to-client workflow validation (tRPC)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

const PORT = 3010;
const BASE_URL = `http://localhost:${String(PORT)}`;

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'integration-test-admin-token';
process.env.SHARED_SECRET = 'integration-test-shared-secret';
process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.PORT = String(PORT);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SHARED_SECRET = process.env.SHARED_SECRET;

let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(procedure: string, input: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${BASE_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input)
    });
    return response;
}

// Helper to call tRPC queries
async function trpcQuery(procedure: string, input?: unknown, headers: Record<string, string> = {}) {
    let url = `${BASE_URL}/trpc/${procedure}`;
    if (input !== undefined) {
        url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const response = await fetch(url, { headers });
    return response;
}

// Parse tRPC response
interface TRPCResponse<T = unknown> {
    result?: { data: T };
    error?: { message: string; code: string };
}

async function parseTRPC<T>(response: Response): Promise<{ data?: T; error?: string }> {
    const json = await response.json() as TRPCResponse<T>;
    if (json.result) {
        return { data: json.result.data };
    }
    if (json.error) {
        return { error: json.error.message };
    }
    return {};
}

interface UserResult {
    id: string;
    email: string;
    name: string;
}

interface AuthResult {
    accessToken?: string;
    refreshToken?: string;
    user?: UserResult;
}

interface HostResult {
    hostname: string;
    status: string;
}

interface ClassroomResult {
    id: string;
    name: string;
    capacity?: number;
}

interface RequestResult {
    id: string;
    domain?: string;
    status?: string;
}

await describe('Integration: Complete User Workflow (tRPC)', async () => {
    let accessToken: string | undefined;

    before(async () => {
        const { app } = await import('../src/server.js');
        server = app.listen(PORT);
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    after(() => {
        if (server !== undefined) server.close();
    });

    await it('should complete user registration → login → profile access flow', async () => {
        // Step 1: Register a new user
        const registerRes = await trpcMutate('auth.register', {
            email: 'integration@test.com',
            password: 'IntegrationTest123!',
            name: 'Integration Test User'
        });

        assert.ok([200, 409].includes(registerRes.status), 'Registration should succeed or user exists');

        // Step 2: Login with credentials
        const loginRes = await trpcMutate('auth.login', {
            email: 'integration@test.com',
            password: 'IntegrationTest123!'
        });

        assert.strictEqual(loginRes.status, 200, 'Login should succeed');
        const { data: loginData } = await parseTRPC<AuthResult>(loginRes);
        assert.ok(loginData?.accessToken, 'Login should return access token');
        accessToken = loginData.accessToken;

        // Step 3: Access profile with token
        const profileRes = await trpcQuery('auth.me', undefined, {
            'Authorization': `Bearer ${accessToken}`
        });

        assert.strictEqual(profileRes.status, 200, 'Profile access should succeed');
        const { data: profileData } = await parseTRPC<{ user: UserResult }>(profileRes);
        assert.strictEqual(profileData?.user?.email, 'integration@test.com');
    });
});

await describe('Integration: Health Report Flow (tRPC)', async () => {
    before(async () => {
        if (server === undefined) {
            const { app } = await import('../src/server.js');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server !== undefined) server.close();
    });

    await it('should complete health report submission → retrieval flow', async () => {
        const testHostname = 'test-machine-' + String(Date.now());

        // Step 1: Submit health report via tRPC
        const reportRes = await trpcMutate('health.report', {
            hostname: testHostname,
            status: 'healthy',
            version: '3.5',
            uptime: 3600,
            services: {
                dnsmasq: 'running',
                firewall: 'active'
            }
        }, {
            'X-Shared-Secret': SHARED_SECRET
        });

        assert.ok([200, 201].includes(reportRes.status), 'Health report submission should succeed');

        // Step 2: Retrieve reports as admin
        const listRes = await trpcQuery('health.list', undefined, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.strictEqual(listRes.status, 200, 'Should retrieve health reports');
        const { data } = await parseTRPC<HostResult[]>(listRes);
        assert.ok(Array.isArray(data), 'Response should contain hosts data');
    });
});

await describe('Integration: Classroom Management Flow (tRPC)', async () => {
    let classroomId: string | undefined;

    before(async () => {
        if (server === undefined) {
            const { app } = await import('../src/server.js');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server !== undefined) server.close();
    });

    await it('should complete classroom create → get → delete flow', async () => {
        // Step 1: Create classroom
        const createRes = await trpcMutate('classrooms.create', {
            name: 'Integration Test Lab',
            description: 'Test classroom for integration testing',
            groups: ['default'],
            capacity: 30
        }, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.ok([200, 201].includes(createRes.status), 'Classroom creation should succeed');
        const { data: createData } = await parseTRPC<ClassroomResult>(createRes);
        assert.ok(createData?.id, 'Response should contain classroom ID');
        classroomId = createData.id;

        // Step 2: Get classroom details
        const getRes = await trpcQuery('classrooms.get', { id: classroomId }, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.strictEqual(getRes.status, 200, 'Classroom retrieval should succeed');

        // Step 3: Delete classroom
        const deleteRes = await trpcMutate('classrooms.delete', { id: classroomId }, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.strictEqual(deleteRes.status, 200, 'Classroom deletion should succeed');
    });
});

await describe('Integration: Domain Request Workflow (tRPC)', async () => {
    let requestId: string | undefined;

    before(async () => {
        if (server === undefined) {
            const { app } = await import('../src/server.js');
            server = app.listen(PORT);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    after(() => {
        if (server !== undefined) server.close();
    });

    await it('should complete domain request → review → decision flow', async () => {
        // Step 1: Submit domain request (public)
        const submitRes = await trpcMutate('requests.create', {
            domain: 'integration-test-' + String(Date.now()) + '.example.com',
            reason: 'Integration test request',
            requester_email: 'student@test.com'
        });

        assert.strictEqual(submitRes.status, 200, 'Request submission should succeed');
        const { data: submitData } = await parseTRPC<RequestResult>(submitRes);
        assert.ok(submitData?.id, 'Response should contain request ID');
        requestId = submitData.id;

        // Step 2: List requests as admin
        const listRes = await trpcQuery('requests.list', {}, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.strictEqual(listRes.status, 200, 'Request listing should succeed');
        const { data: listData } = await parseTRPC<RequestResult[]>(listRes);
        assert.ok(Array.isArray(listData), 'Response should contain requests array');

        // Step 3: Get request status
        const getRes = await trpcQuery('requests.getStatus', { id: requestId });

        assert.strictEqual(getRes.status, 200, 'Request retrieval should succeed');
        const { data: getStatusData } = await parseTRPC<RequestResult>(getRes);
        assert.strictEqual(getStatusData?.status, 'pending');

        // Step 4: Reject the request
        const rejectRes = await trpcMutate('requests.reject', {
            id: requestId,
            reason: 'Integration test rejection'
        }, {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        });

        assert.strictEqual(rejectRes.status, 200, 'Request rejection should succeed');
    });
});

console.log('Running Integration Tests...');
