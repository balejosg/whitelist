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
 * Classroom Storage - JSON file-based classroom and machine management
 * Stores classrooms in data/classrooms.json
 * Stores machines in data/machines.json
 * 
 * Model:
 * - Classroom: Physical room with computers, can host multiple groups at different times
 * - Machine: Individual computer assigned to a classroom
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CLASSROOMS_FILE = path.join(DATA_DIR, 'classrooms.json');
const MACHINES_FILE = path.join(DATA_DIR, 'machines.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize files if they don't exist
if (!fs.existsSync(CLASSROOMS_FILE)) {
    fs.writeFileSync(CLASSROOMS_FILE, JSON.stringify({ classrooms: [] }, null, 2));
}
if (!fs.existsSync(MACHINES_FILE)) {
    fs.writeFileSync(MACHINES_FILE, JSON.stringify({ machines: [] }, null, 2));
}

// =============================================================================
// Data Access - Classrooms
// =============================================================================

function loadClassrooms() {
    try {
        const data = fs.readFileSync(CLASSROOMS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading classrooms:', error);
        return { classrooms: [] };
    }
}

function saveClassrooms(data) {
    fs.writeFileSync(CLASSROOMS_FILE, JSON.stringify(data, null, 2));
}

// =============================================================================
// Data Access - Machines
// =============================================================================

function loadMachines() {
    try {
        const data = fs.readFileSync(MACHINES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading machines:', error);
        return { machines: [] };
    }
}

function saveMachines(data) {
    fs.writeFileSync(MACHINES_FILE, JSON.stringify(data, null, 2));
}

// =============================================================================
// Classroom CRUD
// =============================================================================

/**
 * Get all classrooms
 * @returns {Array}
 */
function getAllClassrooms() {
    const data = loadClassrooms();
    const machinesData = loadMachines();

    // Add machine count to each classroom
    return data.classrooms.map(c => ({
        ...c,
        machine_count: machinesData.machines.filter(m => m.classroom_id === c.id).length
    }));
}

/**
 * Get classroom by ID
 * @param {string} id 
 * @returns {Object|null}
 */
function getClassroomById(id) {
    const data = loadClassrooms();
    return data.classrooms.find(c => c.id === id) || null;
}

/**
 * Get classroom by name (slug)
 * @param {string} name 
 * @returns {Object|null}
 */
function getClassroomByName(name) {
    const data = loadClassrooms();
    return data.classrooms.find(c => c.name === name.toLowerCase()) || null;
}

/**
 * Create a new classroom
 * @param {Object} classroomData - { name, displayName, defaultGroupId }
 * @returns {Object}
 */
function createClassroom(classroomData) {
    const data = loadClassrooms();
    const { name, displayName, defaultGroupId } = classroomData;

    // Normalize name to slug
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check for duplicate name
    if (data.classrooms.find(c => c.name === slug)) {
        throw new Error(`Classroom with name "${slug}" already exists`);
    }

    const classroom = {
        id: `room_${uuidv4().slice(0, 8)}`,
        name: slug,
        display_name: displayName || name,
        default_group_id: defaultGroupId || null,
        active_group_id: null,  // Manual override (MVP)
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.classrooms.push(classroom);
    saveClassrooms(data);

    return classroom;
}

/**
 * Update a classroom
 * @param {string} id 
 * @param {Object} updates - { displayName, defaultGroupId }
 * @returns {Object|null}
 */
function updateClassroom(id, updates) {
    const data = loadClassrooms();
    const index = data.classrooms.findIndex(c => c.id === id);

    if (index === -1) {
        return null;
    }

    if (updates.displayName !== undefined) {
        data.classrooms[index].display_name = updates.displayName;
    }
    if (updates.defaultGroupId !== undefined) {
        data.classrooms[index].default_group_id = updates.defaultGroupId;
    }

    data.classrooms[index].updated_at = new Date().toISOString();
    saveClassrooms(data);

    return data.classrooms[index];
}

/**
 * Set the active group for a classroom (manual override)
 * @param {string} id 
 * @param {string|null} groupId - null to use default
 * @returns {Object|null}
 */
function setActiveGroup(id, groupId) {
    const data = loadClassrooms();
    const index = data.classrooms.findIndex(c => c.id === id);

    if (index === -1) {
        return null;
    }

    data.classrooms[index].active_group_id = groupId;
    data.classrooms[index].updated_at = new Date().toISOString();
    saveClassrooms(data);

    return data.classrooms[index];
}

/**
 * Get the current active group for a classroom
 * Returns active_group_id if set, otherwise default_group_id
 * @param {string} id 
 * @returns {string|null}
 */
function getCurrentGroupId(id) {
    const classroom = getClassroomById(id);
    if (!classroom) {
        return null;
    }
    return classroom.active_group_id || classroom.default_group_id;
}

/**
 * Delete a classroom (also removes all machines)
 * @param {string} id 
 * @returns {boolean}
 */
function deleteClassroom(id) {
    const data = loadClassrooms();
    const initialLength = data.classrooms.length;
    data.classrooms = data.classrooms.filter(c => c.id !== id);

    if (data.classrooms.length < initialLength) {
        saveClassrooms(data);
        // Also remove all machines from this classroom
        removeMachinesByClassroom(id);
        return true;
    }
    return false;
}

// =============================================================================
// Machine CRUD
// =============================================================================

/**
 * Get all machines
 * @returns {Array}
 */
function getAllMachines() {
    const data = loadMachines();
    return data.machines;
}

/**
 * Get machines by classroom
 * @param {string} classroomId 
 * @returns {Array}
 */
function getMachinesByClassroom(classroomId) {
    const data = loadMachines();
    return data.machines.filter(m => m.classroom_id === classroomId);
}

/**
 * Get machine by hostname
 * @param {string} hostname 
 * @returns {Object|null}
 */
function getMachineByHostname(hostname) {
    const data = loadMachines();
    return data.machines.find(m => m.hostname.toLowerCase() === hostname.toLowerCase()) || null;
}

/**
 * Register a machine in a classroom
 * If machine already exists, update its classroom
 * @param {Object} machineData - { hostname, classroomId, version }
 * @returns {Object}
 */
function registerMachine(machineData) {
    const data = loadMachines();
    const { hostname, classroomId, version } = machineData;
    const normalizedHostname = hostname.toLowerCase();

    // Check if machine already exists
    const existingIndex = data.machines.findIndex(
        m => m.hostname.toLowerCase() === normalizedHostname
    );

    if (existingIndex !== -1) {
        // Update existing machine
        data.machines[existingIndex].classroom_id = classroomId;
        data.machines[existingIndex].version = version || data.machines[existingIndex].version;
        data.machines[existingIndex].last_seen = new Date().toISOString();
        data.machines[existingIndex].updated_at = new Date().toISOString();
        saveMachines(data);
        return data.machines[existingIndex];
    }

    // Create new machine
    const machine = {
        id: `machine_${uuidv4().slice(0, 8)}`,
        hostname: normalizedHostname,
        classroom_id: classroomId,
        version: version || 'unknown',
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.machines.push(machine);
    saveMachines(data);

    return machine;
}

/**
 * Update machine last seen timestamp
 * @param {string} hostname 
 * @returns {Object|null}
 */
function updateMachineLastSeen(hostname) {
    const data = loadMachines();
    const index = data.machines.findIndex(
        m => m.hostname.toLowerCase() === hostname.toLowerCase()
    );

    if (index === -1) {
        return null;
    }

    data.machines[index].last_seen = new Date().toISOString();
    saveMachines(data);

    return data.machines[index];
}

/**
 * Delete a machine
 * @param {string} hostname 
 * @returns {boolean}
 */
function deleteMachine(hostname) {
    const data = loadMachines();
    const initialLength = data.machines.length;
    data.machines = data.machines.filter(
        m => m.hostname.toLowerCase() !== hostname.toLowerCase()
    );

    if (data.machines.length < initialLength) {
        saveMachines(data);
        return true;
    }
    return false;
}

/**
 * Remove all machines from a classroom
 * @param {string} classroomId 
 * @returns {number} Number of machines removed
 */
function removeMachinesByClassroom(classroomId) {
    const data = loadMachines();
    const initialLength = data.machines.length;
    data.machines = data.machines.filter(m => m.classroom_id !== classroomId);

    if (data.machines.length < initialLength) {
        saveMachines(data);
    }
    return initialLength - data.machines.length;
}

/**
 * Get the whitelist URL for a machine based on its classroom's active group
 * Priority: 1) Manual override (active_group_id), 2) Current schedule, 3) Default group
 * @param {string} hostname 
 * @returns {Object} { url, groupId, classroomId, source } or null if not found
 */
function getWhitelistUrlForMachine(hostname) {
    const machine = getMachineByHostname(hostname);
    if (!machine) {
        return null;
    }

    const classroom = getClassroomById(machine.classroom_id);
    if (!classroom) {
        return null;
    }

    // Priority 1: Manual override (active_group_id set by admin)
    let groupId = classroom.active_group_id;
    let source = 'manual';

    // Priority 2: Check current schedule if no manual override
    if (!groupId) {
        try {
            const scheduleStorage = require('./schedule-storage');
            const currentSchedule = scheduleStorage.getCurrentSchedule(classroom.id);
            if (currentSchedule) {
                groupId = currentSchedule.group_id;
                source = 'schedule';
            }
        } catch (e) {
            // Schedule storage not available, continue without it
            console.warn('Schedule storage not available:', e.message);
        }
    }

    // Priority 3: Default group
    if (!groupId) {
        groupId = classroom.default_group_id;
        source = 'default';
    }

    if (!groupId) {
        return null;
    }

    // Construct GitHub raw URL for the whitelist file
    const owner = process.env.GITHUB_OWNER || 'LasEncinasIT';
    const repo = process.env.GITHUB_REPO || 'Whitelist-por-aula';
    const branch = process.env.GITHUB_BRANCH || 'main';
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${encodeURIComponent(groupId)}.txt`;

    return {
        url,
        group_id: groupId,
        classroom_id: classroom.id,
        classroom_name: classroom.name,
        source // 'manual', 'schedule', or 'default'
    };
}

/**
 * Get statistics
 * @returns {Object}
 */
function getStats() {
    const classrooms = loadClassrooms();
    const machines = loadMachines();

    return {
        classrooms: classrooms.classrooms.length,
        machines: machines.machines.length,
        classroomsWithActiveGroup: classrooms.classrooms.filter(c => c.active_group_id).length
    };
}

module.exports = {
    // Classrooms
    getAllClassrooms,
    getClassroomById,
    getClassroomByName,
    createClassroom,
    updateClassroom,
    setActiveGroup,
    getCurrentGroupId,
    deleteClassroom,
    // Machines
    getAllMachines,
    getMachinesByClassroom,
    getMachineByHostname,
    registerMachine,
    updateMachineLastSeen,
    deleteMachine,
    removeMachinesByClassroom,
    getWhitelistUrlForMachine,
    // Stats
    getStats
};
