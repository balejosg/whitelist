/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Storage - PostgreSQL-based classroom and machine management
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
// =============================================================================
// Helper Functions
// =============================================================================
function toClassroomType(classroom, machines = []) {
    return {
        id: classroom.id,
        name: classroom.name,
        display_name: classroom.display_name,
        machines: machines.map((m) => ({
            hostname: m.hostname,
            last_seen: m.last_seen,
            status: 'unknown'
        })),
        created_at: classroom.created_at,
        updated_at: classroom.updated_at
    };
}
// =============================================================================
// Classroom CRUD
// =============================================================================
export async function getAllClassrooms() {
    const result = await query(`SELECT c.*, COUNT(m.id)::int as machine_count
         FROM classrooms c
         LEFT JOIN machines m ON m.classroom_id = c.id
         GROUP BY c.id
         ORDER BY c.created_at DESC`);
    return result.rows;
}
export async function getClassroomById(id) {
    const result = await query('SELECT * FROM classrooms WHERE id = $1', [id]);
    return result.rows[0] ?? null;
}
export async function getClassroomByName(name) {
    const result = await query('SELECT * FROM classrooms WHERE LOWER(name) = LOWER($1)', [name]);
    return result.rows[0] ?? null;
}
export async function createClassroom(classroomData) {
    const { name, displayName, defaultGroupId } = classroomData;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    // Check if exists
    const existing = await getClassroomByName(slug);
    if (existing) {
        throw new Error(`Classroom with name "${slug}" already exists`);
    }
    const id = `room_${uuidv4().slice(0, 8)}`;
    const result = await query(`INSERT INTO classrooms (id, name, display_name, default_group_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, [id, slug, displayName ?? name, defaultGroupId ?? null]);
    return result.rows[0];
}
export async function updateClassroom(id, updates) {
    const setClauses = [];
    const values = [];
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
    const result = await query(`UPDATE classrooms SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`, values);
    return result.rows[0] ?? null;
}
export async function setActiveGroup(id, groupId) {
    const result = await query('UPDATE classrooms SET active_group_id = $1 WHERE id = $2 RETURNING *', [groupId, id]);
    return result.rows[0] ?? null;
}
export async function getCurrentGroupId(id) {
    const classroom = await getClassroomById(id);
    if (!classroom)
        return null;
    return classroom.active_group_id ?? classroom.default_group_id;
}
export async function deleteClassroom(id) {
    const result = await query('DELETE FROM classrooms WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
}
// =============================================================================
// Machine CRUD
// =============================================================================
export async function getAllMachines() {
    const result = await query('SELECT * FROM machines ORDER BY created_at DESC');
    return result.rows;
}
export async function getMachinesByClassroom(classroomId) {
    const result = await query('SELECT * FROM machines WHERE classroom_id = $1', [classroomId]);
    return result.rows;
}
export async function getMachineByHostname(hostname) {
    const result = await query('SELECT * FROM machines WHERE LOWER(hostname) = LOWER($1)', [hostname]);
    return result.rows[0] ?? null;
}
export async function registerMachine(machineData) {
    const { hostname, classroomId, version } = machineData;
    const normalizedHostname = hostname.toLowerCase();
    // Check if machine already exists
    const existing = await getMachineByHostname(normalizedHostname);
    if (existing) {
        // Update existing machine
        const result = await query(`UPDATE machines 
             SET classroom_id = $1, version = $2, last_seen = NOW()
             WHERE id = $3
             RETURNING *`, [classroomId, version ?? existing.version, existing.id]);
        return result.rows[0];
    }
    // Create new machine
    const id = `machine_${uuidv4().slice(0, 8)}`;
    const result = await query(`INSERT INTO machines (id, hostname, classroom_id, version)
         VALUES ($1, $2, $3, $4)
         RETURNING *`, [id, normalizedHostname, classroomId, version ?? 'unknown']);
    return result.rows[0];
}
export async function updateMachineLastSeen(hostname) {
    const result = await query('UPDATE machines SET last_seen = NOW() WHERE LOWER(hostname) = LOWER($1) RETURNING *', [hostname]);
    return result.rows[0] ?? null;
}
export async function deleteMachine(hostname) {
    const result = await query('DELETE FROM machines WHERE LOWER(hostname) = LOWER($1)', [hostname]);
    return (result.rowCount ?? 0) > 0;
}
export async function removeMachinesByClassroom(classroomId) {
    const result = await query('DELETE FROM machines WHERE classroom_id = $1', [classroomId]);
    return result.rowCount ?? 0;
}
export async function getWhitelistUrlForMachine(hostname) {
    const machine = await getMachineByHostname(hostname);
    if (!machine)
        return null;
    const classroom = await getClassroomById(machine.classroom_id);
    if (!classroom)
        return null;
    let groupId = classroom.active_group_id;
    let source = 'manual';
    if (groupId === null) {
        // Try to get from schedule
        try {
            const { getCurrentSchedule } = await import('./schedule-storage.js');
            const currentSchedule = await getCurrentSchedule(classroom.id);
            if (currentSchedule) {
                groupId = currentSchedule.group_id;
                source = 'schedule';
            }
        }
        catch {
            // Schedule storage not available
        }
    }
    if (groupId === null) {
        groupId = classroom.default_group_id;
        source = 'default';
    }
    if (groupId === null)
        return null;
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
export async function getStats() {
    const classroomResult = await query(`SELECT 
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE active_group_id IS NOT NULL)::text as active
         FROM classrooms`);
    const machineResult = await query('SELECT COUNT(*)::text as total FROM machines');
    return {
        classrooms: parseInt(classroomResult.rows[0]?.total ?? '0', 10),
        machines: parseInt(machineResult.rows[0]?.total ?? '0', 10),
        classroomsWithActiveGroup: parseInt(classroomResult.rows[0]?.active ?? '0', 10)
    };
}
// =============================================================================
// Storage Instance
// =============================================================================
export const classroomStorage = {
    getAllClassrooms: async () => {
        const classrooms = await getAllClassrooms();
        const result = [];
        for (const c of classrooms) {
            const machines = await getMachinesByClassroom(c.id);
            result.push(toClassroomType(c, machines));
        }
        return result;
    },
    getClassroomById: async (id) => {
        const classroom = await getClassroomById(id);
        if (!classroom)
            return null;
        const machines = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machines);
    },
    getClassroomByName: async (name) => {
        const classroom = await getClassroomByName(name);
        if (!classroom)
            return null;
        const machines = await getMachinesByClassroom(classroom.id);
        return toClassroomType(classroom, machines);
    },
    createClassroom: async (data) => {
        const classroom = await createClassroom(data);
        return toClassroomType(classroom);
    },
    updateClassroom: async (id, data) => {
        const classroom = await updateClassroom(id, data);
        if (!classroom)
            return null;
        const machines = await getMachinesByClassroom(id);
        return toClassroomType(classroom, machines);
    },
    deleteClassroom,
    addMachine: async (classroomId, hostname) => {
        const machine = await registerMachine({ hostname, classroomId });
        return {
            hostname: machine.hostname,
            last_seen: machine.last_seen,
            status: 'unknown'
        };
    },
    removeMachine: async (classroomId, hostname) => {
        const machine = await getMachineByHostname(hostname);
        if (machine?.classroom_id !== classroomId)
            return false;
        return deleteMachine(hostname);
    },
    getMachineByHostname: async (hostname) => {
        const machine = await getMachineByHostname(hostname);
        if (!machine)
            return null;
        const classroom = await getClassroomById(machine.classroom_id);
        if (!classroom)
            return null;
        return {
            classroom: toClassroomType(classroom),
            machine: {
                hostname: machine.hostname,
                last_seen: machine.last_seen,
                status: 'unknown'
            }
        };
    },
    updateMachineStatus: async (hostname, _status) => {
        const machine = await updateMachineLastSeen(hostname);
        return machine !== null;
    }
};
export default classroomStorage;
//# sourceMappingURL=classroom-storage.js.map