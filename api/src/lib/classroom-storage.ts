/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Storage - PostgreSQL-based classroom and machine management
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
import type { Classroom, MachineStatus } from '../types/index.js';
import type { IClassroomStorage, CreateClassroomData, UpdateClassroomData } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

interface DBClassroom {
    id: string;
    name: string;
    display_name: string;
    default_group_id: string | null;
    active_group_id: string | null;
    created_at: string;
    updated_at: string;
}

interface DBMachine {
    id: string;
    hostname: string;
    classroom_id: string;
    version: string;
    last_seen: string;
    created_at: string;
    updated_at: string;
}

interface ClassroomWithCount extends DBClassroom {
    machine_count: number;
}

interface WhitelistUrlResult {
    url: string;
    group_id: string;
    classroom_id: string;
    classroom_name: string;
    source: 'manual' | 'schedule' | 'default';
}

interface ClassroomStats {
    classrooms: number;
    machines: number;
    classroomsWithActiveGroup: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function toClassroomType(classroom: DBClassroom, machines: DBMachine[] = []): Classroom {
    return {
        id: classroom.id,
        name: classroom.name,
        display_name: classroom.display_name,
        machines: machines.map((m) => ({
            hostname: m.hostname,
            last_seen: m.last_seen,
            status: 'unknown' as MachineStatus
        })),
        created_at: classroom.created_at,
        updated_at: classroom.updated_at
    };
}

// =============================================================================
// Classroom CRUD
// =============================================================================

export async function getAllClassrooms(): Promise<ClassroomWithCount[]> {
    const result = await query<ClassroomWithCount>(
        `SELECT c.*, COUNT(m.id)::int as machine_count
         FROM classrooms c
         LEFT JOIN machines m ON m.classroom_id = c.id
         GROUP BY c.id
         ORDER BY c.created_at DESC`
    );
    return result.rows;
}

export async function getClassroomById(id: string): Promise<DBClassroom | null> {
    const result = await query<DBClassroom>(
        'SELECT * FROM classrooms WHERE id = $1',
        [id]
    );
    return result.rows[0] ?? null;
}

export async function getClassroomByName(name: string): Promise<DBClassroom | null> {
    const result = await query<DBClassroom>(
        'SELECT * FROM classrooms WHERE LOWER(name) = LOWER($1)',
        [name]
    );
    return result.rows[0] ?? null;
}

export async function createClassroom(
    classroomData: CreateClassroomData & { defaultGroupId?: string }
): Promise<DBClassroom> {
    const { name, displayName, defaultGroupId } = classroomData;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check if exists
    const existing = await getClassroomByName(slug);
    if (existing) {
        throw new Error(`Classroom with name "${slug}" already exists`);
    }

    const id = `room_${uuidv4().slice(0, 8)}`;

    const result = await query<DBClassroom>(
        `INSERT INTO classrooms (id, name, display_name, default_group_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, slug, displayName ?? name, defaultGroupId ?? null]
    );

    return result.rows[0]!;
}

export async function updateClassroom(
    id: string,
    updates: UpdateClassroomData & { defaultGroupId?: string }
): Promise<DBClassroom | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
        setClauses.push(`display_name = $${paramIndex++}`);
        values.push(updates.displayName);
    }
    if (updates.defaultGroupId !== undefined) {
        setClauses.push(`default_group_id = $${paramIndex++}`);
        values.push(updates.defaultGroupId);
    }

    if (setClauses.length === 0) {
        return getClassroomById(id);
    }

    values.push(id);
    const result = await query<DBClassroom>(
        `UPDATE classrooms SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
    );

    return result.rows[0] ?? null;
}

export async function setActiveGroup(id: string, groupId: string | null): Promise<DBClassroom | null> {
    const result = await query<DBClassroom>(
        'UPDATE classrooms SET active_group_id = $1 WHERE id = $2 RETURNING *',
        [groupId, id]
    );
    return result.rows[0] ?? null;
}

export async function getCurrentGroupId(id: string): Promise<string | null> {
    const classroom = await getClassroomById(id);
    if (!classroom) return null;
    return classroom.active_group_id ?? classroom.default_group_id;
}

export async function deleteClassroom(id: string): Promise<boolean> {
    const result = await query(
        'DELETE FROM classrooms WHERE id = $1',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

// =============================================================================
// Machine CRUD
// =============================================================================

export async function getAllMachines(): Promise<DBMachine[]> {
    const result = await query<DBMachine>(
        'SELECT * FROM machines ORDER BY created_at DESC'
    );
    return result.rows;
}

export async function getMachinesByClassroom(classroomId: string): Promise<DBMachine[]> {
    const result = await query<DBMachine>(
        'SELECT * FROM machines WHERE classroom_id = $1',
        [classroomId]
    );
    return result.rows;
}

export async function getMachineByHostname(hostname: string): Promise<DBMachine | null> {
    const result = await query<DBMachine>(
        'SELECT * FROM machines WHERE LOWER(hostname) = LOWER($1)',
        [hostname]
    );
    return result.rows[0] ?? null;
}

export async function registerMachine(machineData: {
    hostname: string;
    classroomId: string;
    version?: string;
}): Promise<DBMachine> {
    const { hostname, classroomId, version } = machineData;
    const normalizedHostname = hostname.toLowerCase();

    // Check if machine already exists
    const existing = await getMachineByHostname(normalizedHostname);
    if (existing) {
        // Update existing machine
        const result = await query<DBMachine>(
            `UPDATE machines 
             SET classroom_id = $1, version = $2, last_seen = NOW()
             WHERE id = $3
             RETURNING *`,
            [classroomId, version ?? existing.version, existing.id]
        );
        return result.rows[0]!;
    }

    // Create new machine
    const id = `machine_${uuidv4().slice(0, 8)}`;
    const result = await query<DBMachine>(
        `INSERT INTO machines (id, hostname, classroom_id, version)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, normalizedHostname, classroomId, version ?? 'unknown']
    );

    return result.rows[0]!;
}

export async function updateMachineLastSeen(hostname: string): Promise<DBMachine | null> {
    const result = await query<DBMachine>(
        'UPDATE machines SET last_seen = NOW() WHERE LOWER(hostname) = LOWER($1) RETURNING *',
        [hostname]
    );
    return result.rows[0] ?? null;
}

export async function deleteMachine(hostname: string): Promise<boolean> {
    const result = await query(
        'DELETE FROM machines WHERE LOWER(hostname) = LOWER($1)',
        [hostname]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function removeMachinesByClassroom(classroomId: string): Promise<number> {
    const result = await query(
        'DELETE FROM machines WHERE classroom_id = $1',
        [classroomId]
    );
    return result.rowCount ?? 0;
}

export async function getWhitelistUrlForMachine(hostname: string): Promise<WhitelistUrlResult | null> {
    const machine = await getMachineByHostname(hostname);
    if (!machine) return null;

    const classroom = await getClassroomById(machine.classroom_id);
    if (!classroom) return null;

    let groupId = classroom.active_group_id;
    let source: 'manual' | 'schedule' | 'default' = 'manual';

    if (groupId === null) {
        // Try to get from schedule
        try {
            const { getCurrentSchedule } = await import('./schedule-storage.js');
            const currentSchedule = await getCurrentSchedule(classroom.id);
            if (currentSchedule) {
                groupId = currentSchedule.group_id;
                source = 'schedule';
            }
        } catch {
            // Schedule storage not available
        }
    }

    if (groupId === null) {
        groupId = classroom.default_group_id;
        source = 'default';
    }

    if (groupId === null) return null;

    const owner = process.env.GITHUB_OWNER ?? 'LasEncinasIT';
    const repo = process.env.GITHUB_REPO ?? 'Whitelist-por-aula';
    const branch = process.env.GITHUB_BRANCH ?? 'main';
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${encodeURIComponent(groupId)}.txt`;

    return {
        url,
        group_id: groupId,
        classroom_id: classroom.id,
        classroom_name: classroom.name,
        source
    };
}

export async function getStats(): Promise<ClassroomStats> {
    const classroomResult = await query<{ total: string; active: string }>(
        `SELECT 
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE active_group_id IS NOT NULL)::text as active
         FROM classrooms`
    );

    const machineResult = await query<{ total: string }>(
        'SELECT COUNT(*)::text as total FROM machines'
    );

    return {
        classrooms: parseInt(classroomResult.rows[0]?.total ?? '0', 10),
        machines: parseInt(machineResult.rows[0]?.total ?? '0', 10),
        classroomsWithActiveGroup: parseInt(classroomResult.rows[0]?.active ?? '0', 10)
    };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const classroomStorage: IClassroomStorage = {
    getAllClassrooms: async () => {
        const classrooms = await getAllClassrooms();
        const result: Classroom[] = [];

        for (const c of classrooms) {
            const machines = await getMachinesByClassroom(c.id);
            result.push(toClassroomType(c, machines));
        }

        return result;
    },
    getClassroomById: async (id: string) => {
        const classroom = await getClassroomById(id);
        if (!classroom) return null;
        const machines = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machines);
    },
    getClassroomByName: async (name: string) => {
        const classroom = await getClassroomByName(name);
        if (!classroom) return null;
        const machines = await getMachinesByClassroom(classroom.id);
        return toClassroomType(classroom, machines);
    },
    createClassroom: async (data: CreateClassroomData) => {
        const classroom = await createClassroom(data);
        return toClassroomType(classroom);
    },
    updateClassroom: async (id: string, data: UpdateClassroomData) => {
        const classroom = await updateClassroom(id, data);
        if (!classroom) return null;
        const machines = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machines);
    },
    deleteClassroom,
    addMachine: async (classroomId: string, hostname: string) => {
        const machine = await registerMachine({ hostname, classroomId });
        return {
            hostname: machine.hostname,
            last_seen: machine.last_seen,
            status: 'unknown' as MachineStatus
        };
    },
    removeMachine: async (classroomId: string, hostname: string) => {
        const machine = await getMachineByHostname(hostname);
        if (machine?.classroom_id !== classroomId) return false;
        return deleteMachine(hostname);
    },
    getMachineByHostname: async (hostname: string) => {
        const machine = await getMachineByHostname(hostname);
        if (!machine) return null;
        const classroom = await getClassroomById(machine.classroom_id);
        if (!classroom) return null;
        return {
            classroom: toClassroomType(classroom),
            machine: {
                hostname: machine.hostname,
                last_seen: machine.last_seen,
                status: 'unknown' as MachineStatus
            }
        };
    },
    updateMachineStatus: async (hostname: string, _status: 'online' | 'offline') => {
        const machine = await updateMachineLastSeen(hostname);
        return machine !== null;
    }
};

export default classroomStorage;
