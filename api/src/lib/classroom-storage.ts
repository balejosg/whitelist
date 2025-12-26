/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Storage - JSON file-based classroom and machine management
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type { Classroom, MachineStatus } from '../types/index.js';
import type { IClassroomStorage, CreateClassroomData, UpdateClassroomData } from '../types/storage.js';

// =============================================================================
// Constants
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CLASSROOMS_FILE = path.join(DATA_DIR, 'classrooms.json');
const MACHINES_FILE = path.join(DATA_DIR, 'machines.json');

// =============================================================================
// Types
// =============================================================================

interface StoredClassroom {
    id: string;
    name: string;
    display_name: string;
    default_group_id: string | null;
    active_group_id: string | null;
    created_at: string;
    updated_at: string;
}

interface StoredMachine {
    id: string;
    hostname: string;
    classroom_id: string;
    version: string;
    last_seen: string;
    created_at: string;
    updated_at: string;
}

interface ClassroomsData {
    classrooms: StoredClassroom[];
}

interface MachinesData {
    machines: StoredMachine[];
}

interface ClassroomWithCount extends StoredClassroom {
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
// Initialization
// =============================================================================

if (fs.existsSync(DATA_DIR) === false) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (fs.existsSync(CLASSROOMS_FILE) === false) {
    fs.writeFileSync(CLASSROOMS_FILE, JSON.stringify({ classrooms: [] }, null, 2));
}

if (fs.existsSync(MACHINES_FILE) === false) {
    fs.writeFileSync(MACHINES_FILE, JSON.stringify({ machines: [] }, null, 2));
}

// =============================================================================
// Data Access
// =============================================================================

function loadClassrooms(): ClassroomsData {
    try {
        const data = fs.readFileSync(CLASSROOMS_FILE, 'utf-8');
        return JSON.parse(data) as ClassroomsData;
    } catch (error) {
        console.error('Error loading classrooms:', error);
        return { classrooms: [] };
    }
}

function saveClassrooms(data: ClassroomsData): void {
    fs.writeFileSync(CLASSROOMS_FILE, JSON.stringify(data, null, 2));
}

function loadMachines(): MachinesData {
    try {
        const data = fs.readFileSync(MACHINES_FILE, 'utf-8');
        return JSON.parse(data) as MachinesData;
    } catch (error) {
        console.error('Error loading machines:', error);
        return { machines: [] };
    }
}

function saveMachines(data: MachinesData): void {
    fs.writeFileSync(MACHINES_FILE, JSON.stringify(data, null, 2));
}

function toClassroomType(stored: StoredClassroom, machines: StoredMachine[] = []): Classroom {
    return {
        id: stored.id,
        name: stored.name,
        display_name: stored.display_name,
        machines: machines.map((m) => ({
            hostname: m.hostname,
            last_seen: m.last_seen,
            status: 'unknown' as MachineStatus
        })),
        created_at: stored.created_at,
        updated_at: stored.updated_at
    };
}

// =============================================================================
// Classroom CRUD
// =============================================================================

export function getAllClassrooms(): ClassroomWithCount[] {
    const data = loadClassrooms();
    const machinesData = loadMachines();

    return data.classrooms.map((c) => ({
        ...c,
        machine_count: machinesData.machines.filter((m) => m.classroom_id === c.id).length
    }));
}

export function getClassroomById(id: string): StoredClassroom | null {
    const data = loadClassrooms();
    return data.classrooms.find((c) => c.id === id) ?? null;
}

export function getClassroomByName(name: string): StoredClassroom | null {
    const data = loadClassrooms();
    return data.classrooms.find((c) => c.name === name.toLowerCase()) ?? null;
}

export function createClassroom(classroomData: CreateClassroomData & { defaultGroupId?: string }): StoredClassroom {
    const data = loadClassrooms();
    const { name, displayName, defaultGroupId } = classroomData;

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (data.classrooms.find((c) => c.name === slug)) {
        throw new Error(`Classroom with name "${slug}" already exists`);
    }

    const classroom: StoredClassroom = {
        id: `room_${uuidv4().slice(0, 8)}`,
        name: slug,
        display_name: displayName ?? name,
        default_group_id: defaultGroupId ?? null,
        active_group_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.classrooms.push(classroom);
    saveClassrooms(data);

    return classroom;
}

export function updateClassroom(id: string, updates: UpdateClassroomData & { defaultGroupId?: string }): StoredClassroom | null {
    const data = loadClassrooms();
    const index = data.classrooms.findIndex((c) => c.id === id);

    if (index === -1) return null;
    const classroom = data.classrooms[index];
    if (classroom === undefined) return null;

    if (updates.displayName !== undefined) {
        classroom.display_name = updates.displayName;
    }
    if (updates.defaultGroupId !== undefined) {
        classroom.default_group_id = updates.defaultGroupId;
    }

    classroom.updated_at = new Date().toISOString();
    saveClassrooms(data);

    return classroom;
}

export function setActiveGroup(id: string, groupId: string | null): StoredClassroom | null {
    const data = loadClassrooms();
    const index = data.classrooms.findIndex((c) => c.id === id);

    if (index === -1) return null;
    const classroom = data.classrooms[index];
    if (classroom === undefined) return null;

    classroom.active_group_id = groupId;
    classroom.updated_at = new Date().toISOString();
    saveClassrooms(data);

    return classroom;
}

export function getCurrentGroupId(id: string): string | null {
    const classroom = getClassroomById(id);
    if (classroom === null) return null;
    return classroom.active_group_id ?? classroom.default_group_id;
}

export function deleteClassroom(id: string): boolean {
    const data = loadClassrooms();
    const initialLength = data.classrooms.length;
    data.classrooms = data.classrooms.filter((c) => c.id !== id);

    if (data.classrooms.length < initialLength) {
        saveClassrooms(data);
        removeMachinesByClassroom(id);
        return true;
    }
    return false;
}

// =============================================================================
// Machine CRUD
// =============================================================================

export function getAllMachines(): StoredMachine[] {
    const data = loadMachines();
    return data.machines;
}

export function getMachinesByClassroom(classroomId: string): StoredMachine[] {
    const data = loadMachines();
    return data.machines.filter((m) => m.classroom_id === classroomId);
}

export function getMachineByHostname(hostname: string): StoredMachine | null {
    const data = loadMachines();
    return data.machines.find((m) => m.hostname.toLowerCase() === hostname.toLowerCase()) ?? null;
}

export function registerMachine(machineData: { hostname: string; classroomId: string; version?: string }): StoredMachine {
    const data = loadMachines();
    const { hostname, classroomId, version } = machineData;
    const normalizedHostname = hostname.toLowerCase();

    const existingIndex = data.machines.findIndex(
        (m) => m.hostname.toLowerCase() === normalizedHostname
    );

    if (existingIndex !== -1) {
        const existing = data.machines[existingIndex];
        if (existing !== undefined) {
            existing.classroom_id = classroomId;
            existing.version = version ?? existing.version;
            existing.last_seen = new Date().toISOString();
            existing.updated_at = new Date().toISOString();
            saveMachines(data);
            return existing;
        }
    }

    const machine: StoredMachine = {
        id: `machine_${uuidv4().slice(0, 8)}`,
        hostname: normalizedHostname,
        classroom_id: classroomId,
        version: version ?? 'unknown',
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.machines.push(machine);
    saveMachines(data);

    return machine;
}

export function updateMachineLastSeen(hostname: string): StoredMachine | null {
    const data = loadMachines();
    const index = data.machines.findIndex(
        (m) => m.hostname.toLowerCase() === hostname.toLowerCase()
    );

    if (index === -1) return null;
    const machine = data.machines[index];
    if (machine === undefined) return null;

    machine.last_seen = new Date().toISOString();
    saveMachines(data);

    return machine;
}

export function deleteMachine(hostname: string): boolean {
    const data = loadMachines();
    const initialLength = data.machines.length;
    data.machines = data.machines.filter(
        (m) => m.hostname.toLowerCase() !== hostname.toLowerCase()
    );

    if (data.machines.length < initialLength) {
        saveMachines(data);
        return true;
    }
    return false;
}

export function removeMachinesByClassroom(classroomId: string): number {
    const data = loadMachines();
    const initialLength = data.machines.length;
    data.machines = data.machines.filter((m) => m.classroom_id !== classroomId);

    if (data.machines.length < initialLength) {
        saveMachines(data);
    }
    return initialLength - data.machines.length;
}

export function getWhitelistUrlForMachine(hostname: string): WhitelistUrlResult | null {
    const machine = getMachineByHostname(hostname);
    if (machine === null) return null;

    const classroom = getClassroomById(machine.classroom_id);
    if (classroom === null) return null;

    let groupId = classroom.active_group_id;
    let source: 'manual' | 'schedule' | 'default' = 'manual';

    if (groupId === null || groupId === undefined) {
        try {
            // Dynamic import would be better but keeping consistent with original
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const scheduleStorage = require('./schedule-storage.js');
            const currentSchedule = scheduleStorage.getCurrentSchedule(classroom.id);
            if (currentSchedule !== null && currentSchedule !== undefined) {
                groupId = currentSchedule.group_id;
                source = 'schedule';
            }
        } catch {
            // Schedule storage not available
        }
    }

    if (groupId === null || groupId === undefined) {
        groupId = classroom.default_group_id;
        source = 'default';
    }

    if (groupId === null || groupId === undefined) return null;

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

export function getStats(): ClassroomStats {
    const classrooms = loadClassrooms();
    const machines = loadMachines();

    return {
        classrooms: classrooms.classrooms.length,
        machines: machines.machines.length,
        classroomsWithActiveGroup: classrooms.classrooms.filter((c) => c.active_group_id !== null && c.active_group_id !== undefined).length
    };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const classroomStorage: IClassroomStorage = {
    getAllClassrooms: () => {
        const machinesData = loadMachines();
        return loadClassrooms().classrooms.map((c) =>
            toClassroomType(c, machinesData.machines.filter((m) => m.classroom_id === c.id))
        );
    },
    getClassroomById: (id: string) => {
        const stored = getClassroomById(id);
        if (!stored) return null;
        const machines = getMachinesByClassroom(id);
        return toClassroomType(stored, machines);
    },
    getClassroomByName: (name: string) => {
        const stored = getClassroomByName(name);
        if (!stored) return null;
        const machines = getMachinesByClassroom(stored.id);
        return toClassroomType(stored, machines);
    },
    createClassroom: (data: CreateClassroomData) => {
        const stored = createClassroom(data);
        return toClassroomType(stored);
    },
    updateClassroom: (id: string, data: UpdateClassroomData) => {
        const stored = updateClassroom(id, data);
        if (!stored) return null;
        const machines = getMachinesByClassroom(id);
        return toClassroomType(stored, machines);
    },
    deleteClassroom,
    addMachine: (classroomId: string, hostname: string) => {
        const machine = registerMachine({ hostname, classroomId });
        return {
            hostname: machine.hostname,
            last_seen: machine.last_seen,
            status: 'unknown' as MachineStatus
        };
    },
    removeMachine: (classroomId: string, hostname: string) => {
        const machine = getMachineByHostname(hostname);
        if (machine === null || machine === undefined || machine.classroom_id !== classroomId) return false;
        return deleteMachine(hostname);
    },
    getMachineByHostname: (hostname: string) => {
        const machine = getMachineByHostname(hostname);
        if (machine === null) return null;
        const classroom = getClassroomById(machine.classroom_id);
        if (classroom === null) return null;
        return {
            classroom: toClassroomType(classroom),
            machine: {
                hostname: machine.hostname,
                last_seen: machine.last_seen,
                status: 'unknown' as MachineStatus
            }
        };
    },
    updateMachineStatus: (hostname: string, _status: 'online' | 'offline') => {
        const machine = updateMachineLastSeen(hostname);
        return machine !== null;
    }
};

export default classroomStorage;
