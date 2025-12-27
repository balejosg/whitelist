/* eslint-disable */
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom API Tests (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = 'http://localhost:3004';
const TEST_PORT = 3004;
const ADMIN_TOKEN = 'test-admin-token-classrooms';
const SHARED_SECRET = 'test-shared-secret';

const DATA_DIR = path.join(__dirname, '..', 'data');
const CLASSROOMS_FILE = path.join(DATA_DIR, 'classrooms.json');
const MACHINES_FILE = path.join(DATA_DIR, 'machines.json');

let originalClassrooms: string | null = null;
let originalMachines: string | null = null;

const GLOBAL_TIMEOUT = setTimeout(() => {
    console.error('\n❌ Classroom tests timed out! Forcing exit...');
    process.exit(1);
}, 20000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(procedure: string, input: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${API_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input)
    });
    return response;
}

// Helper to call tRPC queries
async function trpcQuery(procedure: string, input?: unknown, headers: Record<string, string> = {}) {
    let url = `${API_URL}/trpc/${procedure}`;
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

interface ClassroomResult {
    id: string;
    name: string;
    display_name?: string;
    default_group_id?: string;
    current_group_id?: string;
    machines?: unknown[];
}

interface MachineResult {
    hostname: string;
    classroom_id?: string;
    url?: string;
    group_id?: string;
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

await describe('Classroom API Tests (tRPC)', { timeout: 25000 }, async () => {
    before(async () => {
        // Backup existing data files
        if (fs.existsSync(CLASSROOMS_FILE)) {
            originalClassrooms = fs.readFileSync(CLASSROOMS_FILE, 'utf-8');
        }
        if (fs.existsSync(MACHINES_FILE)) {
            originalMachines = fs.readFileSync(MACHINES_FILE, 'utf-8');
        }

        // Reset data files for clean tests
        fs.writeFileSync(CLASSROOMS_FILE, JSON.stringify({ classrooms: [] }, null, 2));
        fs.writeFileSync(MACHINES_FILE, JSON.stringify({ machines: [] }, null, 2));

        process.env.PORT = String(TEST_PORT);
        process.env.ADMIN_TOKEN = ADMIN_TOKEN;
        process.env.SHARED_SECRET = SHARED_SECRET;

        const { app } = await import('../src/server.js');
        server = app.listen(TEST_PORT, () => {
            console.log(`Classroom test server started on port ${String(TEST_PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
    });

    after(async () => {
        // Restore original data files
        if (originalClassrooms !== null) {
            fs.writeFileSync(CLASSROOMS_FILE, originalClassrooms);
        } else if (fs.existsSync(CLASSROOMS_FILE)) {
            fs.unlinkSync(CLASSROOMS_FILE);
        }

        if (originalMachines !== null) {
            fs.writeFileSync(MACHINES_FILE, originalMachines);
        } else if (fs.existsSync(MACHINES_FILE)) {
            fs.unlinkSync(MACHINES_FILE);
        }

        if (server !== undefined) {
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise<void>(resolve => {
                server?.close(() => {
                    console.log('Classroom test server closed');
                    resolve();
                });
            });
        }
    });

    await describe('Classroom CRUD', async () => {
        await test('classrooms.list - requires authentication', async () => {
            const response = await trpcQuery('classrooms.list');
            assert.strictEqual(response.status, 401);
        });

        await test('classrooms.list - returns empty list initially', async () => {
            const response = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            assert.strictEqual(response.status, 200);

            const { data } = await parseTRPC<ClassroomResult[]>(response);
            assert.ok(Array.isArray(data));
        });

        await test('classrooms.create - creates classroom', async () => {
            const response = await trpcMutate('classrooms.create', {
                name: 'Informatica 3',
                display_name: 'Aula Informática 3',
                default_group_id: 'base-centro'
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);

            const { data } = await parseTRPC<ClassroomResult>(response);
            assert.ok(data?.id);
            assert.strictEqual(data?.name, 'informatica-3');
        });

        await test('classrooms.create - rejects duplicate name', async () => {
            const response = await trpcMutate('classrooms.create', {
                name: 'Informatica 3'
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.strictEqual(response.status, 409);
        });

        await test('classrooms.get - returns classroom with machines', async () => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const { data: listData } = await parseTRPC<ClassroomResult[]>(listResponse);
            const classroomId = listData?.[0]?.id;

            const response = await trpcQuery('classrooms.get', { id: String(classroomId) }, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });

            assert.strictEqual(response.status, 200);

            const { data } = await parseTRPC<ClassroomResult>(response);
            assert.ok(data?.id);
            assert.ok(Array.isArray(data?.machines));
        });

        await test('classrooms.setActiveGroup - sets active group', async () => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const { data: listData } = await parseTRPC<ClassroomResult[]>(listResponse);
            const classroomId = listData?.[0]?.id;

            const response = await trpcMutate('classrooms.setActiveGroup', {
                id: String(classroomId),
                group_id: 'lengua-2eso'
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.strictEqual(response.status, 200);

            const { data } = await parseTRPC<ClassroomResult>(response);
            assert.strictEqual(data?.current_group_id, 'lengua-2eso');
        });
    });

    await describe('Machine Registration', async () => {
        await test('classrooms.registerMachine - registers machine', async () => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const { data: listData } = await parseTRPC<ClassroomResult[]>(listResponse);
            const classroomName = listData?.[0]?.name;

            const response = await trpcMutate('classrooms.registerMachine', {
                hostname: 'pc-01',
                classroom_name: classroomName,
                version: '3.5'
            }, { 'Authorization': `Bearer ${SHARED_SECRET}` });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);

            const { data } = await parseTRPC<{ machine: MachineResult }>(response);
            assert.strictEqual(data?.machine?.hostname, 'pc-01');
        });

        await test('classrooms.getWhitelistUrl - returns URL', async () => {
            const response = await trpcQuery('classrooms.getWhitelistUrl', { hostname: 'pc-01' }, {
                'Authorization': `Bearer ${SHARED_SECRET}`
            });

            assert.strictEqual(response.status, 200);

            const { data } = await parseTRPC<MachineResult>(response);
            assert.ok(data?.url);
            assert.strictEqual(data?.group_id, 'lengua-2eso');
        });

        await test('classrooms.getWhitelistUrl - 404 for unknown machine', async () => {
            const response = await trpcQuery('classrooms.getWhitelistUrl', { hostname: 'unknown-pc' }, {
                'Authorization': `Bearer ${SHARED_SECRET}`
            });

            assert.strictEqual(response.status, 404);
        });
    });

    await describe('Cleanup', async () => {
        await test('classrooms.deleteMachine - removes machine', async () => {
            const response = await trpcMutate('classrooms.deleteMachine', { hostname: 'pc-01' }, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });

            assert.strictEqual(response.status, 200);
        });

        await test('classrooms.delete - deletes classroom', async () => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const { data: listData } = await parseTRPC<ClassroomResult[]>(listResponse);
            const classroomId = listData?.[0]?.id;

            const response = await trpcMutate('classrooms.delete', { id: String(classroomId) }, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });

            assert.strictEqual(response.status, 200);
        });
    });
});
