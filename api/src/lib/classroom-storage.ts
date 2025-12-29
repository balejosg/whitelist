/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Storage - PostgreSQL-based classroom and machine management using Drizzle ORM
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, sql, count } from 'drizzle-orm';
import { db, classrooms, machines } from '../db/index.js';
import type { Classroom, MachineStatus } from '../types/index.js';
import type { IClassroomStorage, CreateClassroomData, UpdateClassroomData } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

type DBClassroom = typeof classrooms.$inferSelect;
type DBMachine = typeof machines.$inferSelect;

interface ClassroomWithCount {
    id: string;
    name: string;
    displayName: string;
    defaultGroupId: string | null;
    activeGroupId: string | null;
    createdAt: Date;
    updatedAt: Date;
    machineCount: number;
}

export interface WhitelistUrlResult {
    url: string;
    groupId: string;
    classroomId: string;
    classroomName: string;
    source: 'manual' | 'schedule' | 'default';
}

export interface ClassroomStats {
    classrooms: number;
    machines: number;
    classroomsWithActiveGroup: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function toClassroomType(classroom: DBClassroom, machineList: DBMachine[] = []): Classroom {
    return {
        id: classroom.id,
        name: classroom.name,
        displayName: classroom.displayName,
        machines: machineList.map((m) => ({
            hostname: m.hostname,
            lastSeen: m.lastSeen?.toISOString() ?? null,
            status: 'unknown' as MachineStatus
        })),
        createdAt: classroom.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: classroom.updatedAt?.toISOString() ?? new Date().toISOString(),
        defaultGroupId: classroom.defaultGroupId,
        activeGroupId: classroom.activeGroupId
    };
}

// =============================================================================
// Classroom CRUD
// =============================================================================

export async function getAllClassrooms(): Promise<ClassroomWithCount[]> {
    const result = await db.select({
        id: classrooms.id,
        name: classrooms.name,
        displayName: classrooms.displayName,
        defaultGroupId: classrooms.defaultGroupId,
        activeGroupId: classrooms.activeGroupId,
        createdAt: classrooms.createdAt,
        updatedAt: classrooms.updatedAt,
        machineCount: sql<number>`COUNT(${machines.id})::int`.as('machineCount'),
    })
        .from(classrooms)
        .leftJoin(machines, eq(machines.classroomId, classrooms.id))
        .groupBy(classrooms.id)
        .orderBy(sql`${classrooms.createdAt} DESC`);

    return result.map((row) => ({
        id: row.id,
        name: row.name,
        displayName: row.displayName,
        defaultGroupId: row.defaultGroupId,
        activeGroupId: row.activeGroupId,
        createdAt: row.createdAt ?? new Date(),
        updatedAt: row.updatedAt ?? new Date(),
        machineCount: row.machineCount,
    }));
}

export async function getClassroomById(id: string): Promise<DBClassroom | null> {
    const result = await db.select()
        .from(classrooms)
        .where(eq(classrooms.id, id))
        .limit(1);

    return result[0] ?? null;
}

export async function getClassroomByName(name: string): Promise<DBClassroom | null> {
    const result = await db.select()
        .from(classrooms)
        .where(sql`LOWER(${classrooms.name}) = LOWER(${name})`)
        .limit(1);

    return result[0] ?? null;
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

    const [result] = await db.insert(classrooms)
        .values({
            id,
            name: slug,
            displayName: displayName ?? name,
            defaultGroupId: defaultGroupId ?? null,
        })
        .returning();

    if (!result) {
        throw new Error(`Failed to create classroom "${slug}"`);
    }
    return result;
}

export async function updateClassroom(
    id: string,
    updates: UpdateClassroomData & { defaultGroupId?: string }
): Promise<DBClassroom | null> {
    const updateValues: Partial<typeof classrooms.$inferInsert> = {};

    if (updates.displayName !== undefined) {
        updateValues.displayName = updates.displayName;
    }
    if (updates.defaultGroupId !== undefined) {
        updateValues.defaultGroupId = updates.defaultGroupId;
    }

    if (Object.keys(updateValues).length === 0) {
        return getClassroomById(id);
    }

    const [result] = await db.update(classrooms)
        .set(updateValues)
        .where(eq(classrooms.id, id))
        .returning();

    return result ?? null;
}

export async function setActiveGroup(id: string, groupId: string | null): Promise<DBClassroom | null> {
    const [result] = await db.update(classrooms)
        .set({ activeGroupId: groupId })
        .where(eq(classrooms.id, id))
        .returning();

    return result ?? null;
}

export async function getCurrentGroupId(id: string): Promise<string | null> {
    const classroom = await getClassroomById(id);
    if (!classroom) return null;
    return classroom.activeGroupId ?? classroom.defaultGroupId;
}

export async function deleteClassroom(id: string): Promise<boolean> {
    const result = await db.delete(classrooms)
        .where(eq(classrooms.id, id));

    return (result.rowCount ?? 0) > 0;
}

// =============================================================================
// Machine CRUD
// =============================================================================

export async function getAllMachines(): Promise<DBMachine[]> {
    const result = await db.select()
        .from(machines)
        .orderBy(sql`${machines.createdAt} DESC`);

    return result;
}

export async function getMachinesByClassroom(classroomId: string): Promise<DBMachine[]> {
    const result = await db.select()
        .from(machines)
        .where(eq(machines.classroomId, classroomId));

    return result;
}

export async function getMachineByHostname(hostname: string): Promise<DBMachine | null> {
    const result = await db.select()
        .from(machines)
        .where(sql`LOWER(${machines.hostname}) = LOWER(${hostname})`)
        .limit(1);

    return result[0] ?? null;
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
        const [result] = await db.update(machines)
            .set({
                classroomId,
                version: version ?? existing.version,
                lastSeen: new Date(),
            })
            .where(eq(machines.id, existing.id))
            .returning();

        if (!result) {
            throw new Error(`Failed to update machine "${hostname}"`);
        }
        return result;
    }

    // Create new machine
    const id = `machine_${uuidv4().slice(0, 8)}`;
    const [result] = await db.insert(machines)
        .values({
            id,
            hostname: normalizedHostname,
            classroomId,
            version: version ?? 'unknown',
        })
        .returning();

    if (!result) {
        throw new Error('Failed to register machine');
    }

    return result;
}

export async function updateMachineLastSeen(hostname: string): Promise<DBMachine | null> {
    const machine = await getMachineByHostname(hostname);
    if (!machine) return null;

    const [result] = await db.update(machines)
        .set({ lastSeen: new Date() })
        .where(eq(machines.id, machine.id))
        .returning();

    return result ?? null;
}

export async function deleteMachine(hostname: string): Promise<boolean> {
    const machine = await getMachineByHostname(hostname);
    if (!machine) return false;

    const result = await db.delete(machines)
        .where(eq(machines.id, machine.id));

    return (result.rowCount ?? 0) > 0;
}

export async function removeMachinesByClassroom(classroomId: string): Promise<number> {
    const result = await db.delete(machines)
        .where(eq(machines.classroomId, classroomId));

    return result.rowCount ?? 0;
}

export async function getWhitelistUrlForMachine(hostname: string): Promise<WhitelistUrlResult | null> {
    const machine = await getMachineByHostname(hostname);
    if (!machine) return null;

    const classroomId = machine.classroomId;
    if (!classroomId) return null;

    const classroom = await getClassroomById(classroomId);
    if (!classroom) return null;

    let groupId = classroom.activeGroupId;
    let source: 'manual' | 'schedule' | 'default' = 'manual';

    if (groupId === null) {
        // Try to get from schedule
        try {
            const { getCurrentSchedule } = await import('./schedule-storage.js');
            const currentSchedule = await getCurrentSchedule(classroom.id);
            if (currentSchedule) {
                groupId = currentSchedule.groupId;
                source = 'schedule';
            }
        } catch {
            // Schedule storage not available
        }
    }

    if (groupId === null) {
        groupId = classroom.defaultGroupId;
        source = 'default';
    }

    if (groupId === null) return null;

    const owner = process.env.GITHUB_OWNER ?? 'LasEncinasIT';
    const repo = process.env.GITHUB_REPO ?? 'Whitelist-por-aula';
    const branch = process.env.GITHUB_BRANCH ?? 'main';
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${encodeURIComponent(groupId)}.txt`;

    return {
        url,
        groupId,
        classroomId: classroom.id,
        classroomName: classroom.name,
        source
    };
}

export async function getStats(): Promise<ClassroomStats> {
    const classroomResult = await db.select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE ${classrooms.activeGroupId} IS NOT NULL)`.as('active'),
    })
        .from(classrooms);

    const machineResult = await db.select({
        total: count(),
    })
        .from(machines);

    return {
        classrooms: classroomResult[0]?.total ?? 0,
        machines: machineResult[0]?.total ?? 0,
        classroomsWithActiveGroup: classroomResult[0]?.active ?? 0
    };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const classroomStorage: IClassroomStorage = {
    getAllClassrooms: async () => {
        const allClassrooms = await getAllClassrooms();
        const result: Classroom[] = [];

        for (const c of allClassrooms) {
            const machineList = await getMachinesByClassroom(c.id);
            const classroom = toClassroomType({
                id: c.id,
                name: c.name,
                displayName: c.displayName,
                defaultGroupId: c.defaultGroupId,
                activeGroupId: c.activeGroupId,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            } as DBClassroom, machineList);
            classroom.machineCount = c.machineCount;
            result.push(classroom);
        }

        return result;
    },
    getClassroomById: async (id: string) => {
        const classroom = await getClassroomById(id);
        if (!classroom) return null;
        const machineList = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machineList);
    },
    getClassroomByName: async (name: string) => {
        const classroom = await getClassroomByName(name);
        if (!classroom) return null;
        const machineList = await getMachinesByClassroom(classroom.id);
        return toClassroomType(classroom, machineList);
    },
    createClassroom: async (data: CreateClassroomData) => {
        const classroom = await createClassroom(data);
        return toClassroomType(classroom);
    },
    updateClassroom: async (id: string, data: UpdateClassroomData) => {
        const classroom = await updateClassroom(id, data);
        if (!classroom) return null;
        const machineList = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machineList);
    },
    deleteClassroom,
    addMachine: async (classroomId: string, hostname: string) => {
        const machine = await registerMachine({ hostname, classroomId });
        return {
            hostname: machine.hostname,
            lastSeen: machine.lastSeen?.toISOString() ?? null,
            status: 'unknown' as MachineStatus
        };
    },
    removeMachine: async (classroomId: string, hostname: string) => {
        const machine = await getMachineByHostname(hostname);
        if (machine?.classroomId !== classroomId) return false;
        return deleteMachine(hostname);
    },
    getMachineByHostname: async (hostname: string) => {
        const machine = await getMachineByHostname(hostname);
        if (!machine?.classroomId) return null;
        const classroom = await getClassroomById(machine.classroomId);
        if (!classroom) return null;
        return {
            classroom: toClassroomType(classroom),
            machine: {
                hostname: machine.hostname,
                lastSeen: machine.lastSeen?.toISOString() ?? null,
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

