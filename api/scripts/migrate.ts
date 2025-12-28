/* eslint-disable */
/**
 * OpenPath - Database Migration Script
 * Migrates JSON data to PostgreSQL
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
const SCHEMA_FILE = path.join(__dirname, '..', 'src', 'db', 'schema.sql');

// =============================================================================
// Initialize Schema
// =============================================================================

async function initializeSchema(): Promise<void> {
    console.log('📋 Initializing database schema...');
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf-8');
    await db.query(schema);
    console.log('✓ Schema initialized');
}

// =============================================================================
// Load JSON Data
// =============================================================================

function loadJSON<T>(filename: string): T | null {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.log(`⚠️  ${filename} not found, skipping...`);
        return null;
    }
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data) as T;
}

// =============================================================================
// Migrate Users
// =============================================================================

interface JSONUser {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: string;
    updated_at: string;
}

async function migrateUsers(): Promise<void> {
    const data = loadJSON<{ users: JSONUser[] }>('users.json');
    if (!data || !data.users.length) return;

    console.log(`📦 Migrating ${data.users.length} users...`);
    let migrated = 0;
    for (const user of data.users) {
        // Skip users without valid password hashes (test users)
        if (!user.password_hash) {
            console.log(`  ⚠️  Skipping user ${user.email} - no password hash`);
            continue;
        }
        await db.query(
            `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [user.id, user.email, user.name, user.password_hash, user.created_at, user.updated_at]
        );
        migrated++;
    }
    console.log(`✓ Users migrated (${migrated}/${data.users.length})`);
}

// =============================================================================
// Migrate Roles
// =============================================================================

interface JSONRole {
    id: string;
    user_id: string;
    role: string;
    groups: string[];
    created_by: string;
    created_at: string;
    updated_at: string;
}

async function migrateRoles(): Promise<void> {
    const data = loadJSON<{ roles: JSONRole[] }>('roles.json');
    if (!data || !data.roles.length) return;

    console.log(`📦 Migrating ${data.roles.length} roles...`);
    for (const role of data.roles) {
        await query(
            `INSERT INTO roles (id, user_id, role, groups, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id) DO UPDATE SET
                role = EXCLUDED.role,
                groups = EXCLUDED.groups,
                updated_at = EXCLUDED.updated_at`,
            [role.id, role.user_id, role.role, role.groups, role.created_by, role.created_at, role.updated_at]
        );
    }
    console.log('✓ Roles migrated');
}

// =============================================================================
// Migrate Requests
// =============================================================================

interface JSONRequest {
    id: string;
    domain: string;
    reason: string;
    requester_email: string;
    group_id: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution_note?: string;
}

async function migrateRequests(): Promise<void> {
    const data = loadJSON<{ requests: JSONRequest[] }>('requests.json');
    if (!data || !data.requests.length) return;

    console.log(`📦 Migrating ${data.requests.length} requests...`);
    for (const req of data.requests) {
        await query(
            `INSERT INTO requests (id, domain, reason, requester_email, group_id, priority, status, created_at, updated_at, resolved_at, resolved_by, resolution_note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [
                req.id,
                req.domain,
                req.reason,
                req.requester_email,
                req.group_id,
                req.priority,
                req.status,
                req.created_at,
                req.updated_at,
                req.resolved_at,
                req.resolved_by,
                req.resolution_note ?? null
            ]
        );
    }
    console.log('✓ Requests migrated');
}

// =============================================================================
// Migrate Classrooms
// =============================================================================

interface JSONClassroom {
    id: string;
    name: string;
    display_name: string;
    default_group_id: string | null;
    active_group_id: string | null;
    created_at: string;
    updated_at: string;
}

async function migrateClassrooms(): Promise<void> {
    const data = loadJSON<{ classrooms: JSONClassroom[] }>('classrooms.json');
    if (!data || !data.classrooms.length) return;

    console.log(`📦 Migrating ${data.classrooms.length} classrooms...`);
    for (const classroom of data.classrooms) {
        await query(
            `INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [
                classroom.id,
                classroom.name,
                classroom.display_name,
                classroom.default_group_id,
                classroom.active_group_id,
                classroom.created_at,
                classroom.updated_at
            ]
        );
    }
    console.log('✓ Classrooms migrated');
}

// =============================================================================
// Migrate Machines
// =============================================================================

interface JSONMachine {
    id: string;
    hostname: string;
    classroom_id: string;
    version: string;
    last_seen: string;
    created_at: string;
    updated_at: string;
}

async function migrateMachines(): Promise<void> {
    const data = loadJSON<{ machines: JSONMachine[] }>('machines.json');
    if (!data || !data.machines.length) return;

    console.log(`📦 Migrating ${data.machines.length} machines...`);
    for (const machine of data.machines) {
        await query(
            `INSERT INTO machines (id, hostname, classroom_id, version, last_seen, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [
                machine.id,
                machine.hostname,
                machine.classroom_id,
                machine.version,
                machine.last_seen,
                machine.created_at,
                machine.updated_at
            ]
        );
    }
    console.log('✓ Machines migrated');
}

// =============================================================================
// Migrate Schedules
// =============================================================================

interface JSONSchedule {
    id: string;
    classroom_id: string;
    teacher_id: string;
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    recurrence: string;
    created_at: string;
    updated_at: string;
}

async function migrateSchedules(): Promise<void> {
    const data = loadJSON<{ schedules: JSONSchedule[] }>('schedules.json');
    if (!data || !data.schedules.length) return;

    console.log(`📦 Migrating ${data.schedules.length} schedules...`);
    for (const schedule of data.schedules) {
        await query(
            `INSERT INTO schedules (id, classroom_id, teacher_id, group_id, day_of_week, start_time, end_time, recurrence, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [
                schedule.id,
                schedule.classroom_id,
                schedule.teacher_id,
                schedule.group_id,
                schedule.day_of_week,
                schedule.start_time,
                schedule.end_time,
                schedule.recurrence,
                schedule.created_at,
                schedule.updated_at
            ]
        );
    }
    console.log('✓ Schedules migrated');
}

// =============================================================================
// Migrate Settings
// =============================================================================

interface JSONSetup {
    registration_token?: string;
    setup_completed_at?: string;
    setup_by_user_id?: string;
}

async function migrateSettings(): Promise<void> {
    const data = loadJSON<JSONSetup>('setup.json');
    if (!data) return;

    console.log('📦 Migrating settings...');
    if (data.registration_token) {
        await query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            ['registration_token', data.registration_token]
        );
    }
    if (data.setup_completed_at) {
        await query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            ['setup_completed_at', data.setup_completed_at]
        );
    }
    if (data.setup_by_user_id) {
        await query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            ['setup_by_user_id', data.setup_by_user_id]
        );
    }
    console.log('✓ Settings migrated');
}

// =============================================================================
// Main Migration
// =============================================================================

async function main(): Promise<void> {
    try {
        console.log('🚀 Starting database migration...\n');

        await initializeSchema();
        console.log('');

        await migrateUsers();
        await migrateRoles();
        await migrateRequests();
        await migrateClassrooms();
        await migrateMachines();
        await migrateSchedules();
        await migrateSettings();

        console.log('\n✅ Migration completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Backup your data/ directory');
        console.log('   2. Test the application');
        console.log('   3. Update .env with DB credentials for production\n');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

void main();
