/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom API Tests
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

interface ClassroomResponse {
    success: boolean;
    classroom?: { id: string; name: string; display_name: string; default_group_id: string; machines?: unknown[] };
    classrooms?: Array<{ id: string; name: string }>;
    current_group_id?: string;
}

interface MachineResponse {
    success: boolean;
    machine?: { hostname: string };
    url?: string;
    group_id?: string;
}

describe('Classroom API Tests', { timeout: 25000 }, () => {
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
            console.log(`Classroom test server started on port ${TEST_PORT}`);
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

        if (server) {
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

    describe('Classroom CRUD', () => {
        test('GET /api/classrooms - requires authentication', async () => {
            const response = await fetch(`${API_URL}/api/classrooms`);
            assert.strictEqual(response.status, 401);
        });

        test('GET /api/classrooms - returns empty list initially', async () => {
            const response = await fetch(`${API_URL}/api/classrooms`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            assert.strictEqual(response.status, 200);

            const data = await response.json() as ClassroomResponse;
            assert.strictEqual(data.success, true);
            assert.ok(Array.isArray(data.classrooms));
        });

        test('POST /api/classrooms - creates classroom', async () => {
            const response = await fetch(`${API_URL}/api/classrooms`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ADMIN_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Informatica 3',
                    display_name: 'Aula Informática 3',
                    default_group_id: 'base-centro'
                })
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as ClassroomResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.classroom?.id);
            assert.strictEqual(data.classroom?.name, 'informatica-3');
            assert.strictEqual(data.classroom?.display_name, 'Aula Informática 3');
            assert.strictEqual(data.classroom?.default_group_id, 'base-centro');
        });

        test('POST /api/classrooms - rejects duplicate name', async () => {
            const response = await fetch(`${API_URL}/api/classrooms`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ADMIN_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Informatica 3'
                })
            });

            assert.strictEqual(response.status, 409);
        });

        test('GET /api/classrooms/:id - returns classroom with machines', async () => {
            const listResponse = await fetch(`${API_URL}/api/classrooms`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            const listData = await listResponse.json() as ClassroomResponse;
            const classroomId = listData.classrooms?.[0]?.id;

            const response = await fetch(`${API_URL}/api/classrooms/${classroomId}`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ClassroomResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.classroom);
            assert.ok(Array.isArray(data.classroom?.machines));
        });

        test('PUT /api/classrooms/:id/active-group - sets active group', async () => {
            const listResponse = await fetch(`${API_URL}/api/classrooms`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            const listData = await listResponse.json() as ClassroomResponse;
            const classroomId = listData.classrooms?.[0]?.id;

            const response = await fetch(`${API_URL}/api/classrooms/${classroomId}/active-group`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${ADMIN_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ group_id: 'lengua-2eso' })
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as ClassroomResponse;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.current_group_id, 'lengua-2eso');
        });
    });

    describe('Machine Registration', () => {
        test('POST /api/classrooms/machines/register - registers machine', async () => {
            const listResponse = await fetch(`${API_URL}/api/classrooms`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            const listData = await listResponse.json() as ClassroomResponse;
            const classroomName = listData.classrooms?.[0]?.name;

            const response = await fetch(`${API_URL}/api/classrooms/machines/register`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SHARED_SECRET}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hostname: 'pc-01',
                    classroom_name: classroomName,
                    version: '3.5'
                })
            });

            assert.strictEqual(response.status, 201);

            const data = await response.json() as MachineResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.machine);
            assert.strictEqual(data.machine?.hostname, 'pc-01');
        });

        test('GET /api/classrooms/machines/:hostname/whitelist-url - returns URL', async () => {
            const response = await fetch(`${API_URL}/api/classrooms/machines/pc-01/whitelist-url`, {
                headers: { 'Authorization': `Bearer ${SHARED_SECRET}` }
            });

            assert.strictEqual(response.status, 200);

            const data = await response.json() as MachineResponse;
            assert.strictEqual(data.success, true);
            assert.ok(data.url);
            assert.strictEqual(data.group_id, 'lengua-2eso');
        });

        test('GET /api/classrooms/machines/:hostname/whitelist-url - 404 for unknown machine', async () => {
            const response = await fetch(`${API_URL}/api/classrooms/machines/unknown-pc/whitelist-url`, {
                headers: { 'Authorization': `Bearer ${SHARED_SECRET}` }
            });

            assert.strictEqual(response.status, 404);
        });
    });

    describe('Cleanup', () => {
        test('DELETE /api/classrooms/machines/:hostname - removes machine', async () => {
            const response = await fetch(`${API_URL}/api/classrooms/machines/pc-01`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });

            assert.strictEqual(response.status, 200);
        });

        test('DELETE /api/classrooms/:id - deletes classroom', async () => {
            const listResponse = await fetch(`${API_URL}/api/classrooms`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });
            const listData = await listResponse.json() as ClassroomResponse;
            const classroomId = listData.classrooms?.[0]?.id;

            const response = await fetch(`${API_URL}/api/classrooms/${classroomId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
            });

            assert.strictEqual(response.status, 200);
        });
    });
});
