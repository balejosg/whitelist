
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Management API Tests (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { Server } from 'node:http';

const PORT = 3004;
const API_URL = `http://localhost:${String(PORT)}`;
const ADMIN_TOKEN = 'test-admin-token';

let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(procedure: string, input: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const response = await fetch(`${API_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input)
    });
    return response;
}

// Helper to call tRPC queries
async function trpcQuery(procedure: string, input?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    let url = `${API_URL}/trpc/${procedure}`;
    if (input !== undefined) {
        url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const response = await fetch(url, { headers });
    return response;
}

// Parse tRPC response
interface TRPCResponse {
    result?: { data: unknown };
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

async function parseTRPC(response: Response): Promise<{ data?: unknown; error?: string }> {
    const json = await response.json() as TRPCResponse;
    if (json.result !== undefined) {
        return { data: json.result.data };
    }
    if (json.error !== undefined) {
        return { error: json.error.message };
    }
    return {};
}

await describe('Classroom Management API Tests (tRPC)', async () => {
    before(async () => {
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = ADMIN_TOKEN;

        // Ensure etc exists
        const etcPath = path.join(process.cwd(), 'etc');
        if (!fs.existsSync(etcPath)) fs.mkdirSync(etcPath, { recursive: true });

        const { app } = await import('../src/server.js');
        server = app.listen(PORT, () => {
            console.log(`Classroom test server started on port ${String(PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        if (server !== undefined) {
            await new Promise<void>((resolve) => {
                server?.close(() => {
                    console.log('Classroom test server closed');
                    resolve();
                });
            });
        }
    });

    await describe('Classroom CRUD Operations', async () => {
        await test('classrooms.create - creates a new classroom', async (): Promise<void> => {
            const response = await trpcMutate('classrooms.create', {
                name: 'informatica-3',
                display_name: 'Aula de Informática 3',
                default_group_id: 'ciencias-3eso'
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);

            const res = await parseTRPC(response);
            const data = res.data as ClassroomResult;
            assert.strictEqual(data.name, 'informatica-3');
        });

        await test('classrooms.list - lists rooms', async (): Promise<void> => {
            const response = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            assert.strictEqual(response.status, 200);
            const res = await parseTRPC(response);
            const data = res.data as ClassroomResult[];
            assert.ok(Array.isArray(data));
            assert.ok(data.length > 0);
        });

        await test('classrooms.get - gets by id', async (): Promise<void> => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const resList = await parseTRPC(listResponse);
            const listData = resList.data as ClassroomResult[];
            const classroomId = listData[0]?.id;
            if (!classroomId) throw new Error('No classroom ID found');

            const response = await trpcQuery('classrooms.get', { id: classroomId }, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            assert.strictEqual(response.status, 200);

            const res = await parseTRPC(response);
            const data = res.data as ClassroomResult;
            assert.ok(Array.isArray(data.machines));
        });

        await test('classrooms.setActiveGroup - sets active group', async (): Promise<void> => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const resList = await parseTRPC(listResponse);
            const listData = resList.data as ClassroomResult[];
            const classroomId = listData[0]?.id;
            if (!classroomId) throw new Error('No classroom ID found');

            const response = await trpcMutate('classrooms.setActiveGroup', {
                id: classroomId,
                group_id: 'lengua-2eso'
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.strictEqual(response.status, 200);
        });
    });

    await describe('Machine Operations', async () => {
        await test('classrooms.registerMachine - should register computer', async (): Promise<void> => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const resList = await parseTRPC(listResponse);
            const listData = resList.data as ClassroomResult[];
            const firstClassroom = listData[0];
            if (!firstClassroom) throw new Error('No classroom found');
            const classroomName = firstClassroom.name;

            const response = await trpcMutate('classrooms.registerMachine', {
                hostname: 'pc-01',
                classroom: classroomName
            }, { 'Authorization': `Bearer ${ADMIN_TOKEN}` });

            assert.ok([200, 201].includes(response.status), `Expected 200 or 201, got ${String(response.status)}`);
            const res = await parseTRPC(response);
            const data = res.data as { machine: MachineResult };
            assert.strictEqual(data.machine.hostname, 'pc-01');
        });

        await test('classrooms.getWhitelistUrl - returns url and group', async (): Promise<void> => {
            const response = await trpcQuery('classrooms.getWhitelistUrl', {
                hostname: 'pc-01'
            });

            assert.strictEqual(response.status, 200);

            const res = await parseTRPC(response);
            const data = res.data as MachineResult;
            assert.ok(data.url !== undefined);
            assert.strictEqual(data.group_id, 'lengua-2eso');
        });

        await test('classrooms.getWhitelistUrl - 404 for unknown machine', async (): Promise<void> => {
            const response = await trpcQuery('classrooms.getWhitelistUrl', {
                hostname: 'unknown-pc'
            });
            assert.strictEqual(response.status, 404);
        });
    });

    await describe('Cleanup Operations', async () => {
        await test('classrooms.delete - deletes room', async (): Promise<void> => {
            const listResponse = await trpcQuery('classrooms.list', undefined, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });
            const resList = await parseTRPC(listResponse);
            const listData = resList.data as ClassroomResult[];
            const classroomId = listData[0]?.id;
            if (!classroomId) throw new Error('No classroom ID found');

            const response = await trpcMutate('classrooms.delete', { id: classroomId }, {
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            });

            assert.strictEqual(response.status, 200);
        });
    });
});
