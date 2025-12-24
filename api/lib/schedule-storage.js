/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

/**
 * Schedule Storage Module
 * Manages classroom schedules (recurring reservations by teachers)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Data directory (same as other storage files)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize file if it doesn't exist
if (!fs.existsSync(SCHEDULES_FILE)) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ schedules: [] }, null, 2));
}

// =============================================================================
// Data Access
// =============================================================================

function loadSchedules() {
    try {
        const data = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { schedules: [] };
    }
}

function saveSchedules(data) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2));
}

// =============================================================================
// Time Utilities
// =============================================================================

/**
 * Parse time string "HH:MM" to minutes since midnight
 * @param {string} time - Time in "HH:MM" format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time of first range
 * @param {string} end1 - End time of first range
 * @param {string} start2 - Start time of second range
 * @param {string} end2 - End time of second range
 * @returns {boolean}
 */
function timesOverlap(start1, end1, start2, end2) {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);

    // Overlap if one range starts before the other ends
    return s1 < e2 && s2 < e1;
}

// =============================================================================
// Schedule CRUD
// =============================================================================

/**
 * Get all schedules for a classroom
 * @param {string} classroomId
 * @returns {Array}
 */
function getSchedulesByClassroom(classroomId) {
    const data = loadSchedules();
    return data.schedules.filter(s => s.classroom_id === classroomId);
}

/**
 * Get all schedules for a teacher
 * @param {string} teacherId
 * @returns {Array}
 */
function getSchedulesByTeacher(teacherId) {
    const data = loadSchedules();
    return data.schedules.filter(s => s.teacher_id === teacherId);
}

/**
 * Get a schedule by ID
 * @param {string} id
 * @returns {Object|null}
 */
function getScheduleById(id) {
    const data = loadSchedules();
    return data.schedules.find(s => s.id === id) || null;
}

/**
 * Check for conflicting schedules (same classroom, same day, overlapping time)
 * @param {string} classroomId
 * @param {number} dayOfWeek - 1=Monday, 5=Friday
 * @param {string} startTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @param {string} excludeId - Optional ID to exclude (for updates)
 * @returns {Object|null} Conflicting schedule or null
 */
function findConflict(classroomId, dayOfWeek, startTime, endTime, excludeId = null) {
    const data = loadSchedules();

    return data.schedules.find(s =>
        s.classroom_id === classroomId &&
        s.day_of_week === dayOfWeek &&
        s.id !== excludeId &&
        timesOverlap(s.start_time, s.end_time, startTime, endTime)
    ) || null;
}

/**
 * Create a new schedule (reservation)
 * @param {Object} scheduleData
 * @returns {Object} Created schedule or error
 */
function createSchedule(scheduleData) {
    const { classroom_id, teacher_id, group_id, day_of_week, start_time, end_time } = scheduleData;

    // Validate required fields
    if (!classroom_id || !teacher_id || !group_id || !day_of_week || !start_time || !end_time) {
        throw new Error('Missing required fields');
    }

    // Validate day of week (1-5 for weekdays)
    if (day_of_week < 1 || day_of_week > 5) {
        throw new Error('day_of_week must be between 1 (Monday) and 5 (Friday)');
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
        throw new Error('Invalid time format. Use HH:MM (24h)');
    }

    // Validate start < end
    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
        throw new Error('start_time must be before end_time');
    }

    // Check for conflicts
    const conflict = findConflict(classroom_id, day_of_week, start_time, end_time);
    if (conflict) {
        const error = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    const data = loadSchedules();

    const schedule = {
        id: crypto.randomUUID(),
        classroom_id,
        teacher_id,
        group_id,
        day_of_week,
        start_time,
        end_time,
        recurrence: 'weekly', // MVP: always weekly
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.schedules.push(schedule);
    saveSchedules(data);

    return schedule;
}

/**
 * Update an existing schedule
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null}
 */
function updateSchedule(id, updates) {
    const data = loadSchedules();
    const index = data.schedules.findIndex(s => s.id === id);

    if (index === -1) return null;

    const schedule = data.schedules[index];

    // If updating time/day, check for conflicts
    const newDayOfWeek = updates.day_of_week ?? schedule.day_of_week;
    const newStartTime = updates.start_time ?? schedule.start_time;
    const newEndTime = updates.end_time ?? schedule.end_time;

    const conflict = findConflict(schedule.classroom_id, newDayOfWeek, newStartTime, newEndTime, id);
    if (conflict) {
        const error = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    // Apply updates (only allowed fields)
    const allowedUpdates = ['day_of_week', 'start_time', 'end_time', 'group_id'];
    for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
            data.schedules[index][key] = updates[key];
        }
    }
    data.schedules[index].updated_at = new Date().toISOString();

    saveSchedules(data);
    return data.schedules[index];
}

/**
 * Delete a schedule
 * @param {string} id
 * @returns {boolean}
 */
function deleteSchedule(id) {
    const data = loadSchedules();
    const initialLength = data.schedules.length;
    data.schedules = data.schedules.filter(s => s.id !== id);

    if (data.schedules.length < initialLength) {
        saveSchedules(data);
        return true;
    }
    return false;
}

/**
 * Get the current active schedule for a classroom
 * Based on current day/time (or provided day/time)
 * @param {string} classroomId
 * @param {Date} date - Optional, defaults to now
 * @returns {Object|null} Active schedule or null
 */
function getCurrentSchedule(classroomId, date = new Date()) {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday...

    // Convert to our 1-5 format (weekdays only)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null; // Weekend
    }

    const currentTime = date.toTimeString().slice(0, 5); // "HH:MM"
    const currentMinutes = timeToMinutes(currentTime);

    const data = loadSchedules();

    return data.schedules.find(s =>
        s.classroom_id === classroomId &&
        s.day_of_week === dayOfWeek &&
        timeToMinutes(s.start_time) <= currentMinutes &&
        timeToMinutes(s.end_time) > currentMinutes
    ) || null;
}

/**
 * Delete all schedules for a classroom (when classroom is deleted)
 * @param {string} classroomId
 * @returns {number} Number of deleted schedules
 */
function deleteSchedulesByClassroom(classroomId) {
    const data = loadSchedules();
    const initialLength = data.schedules.length;
    data.schedules = data.schedules.filter(s => s.classroom_id !== classroomId);
    saveSchedules(data);
    return initialLength - data.schedules.length;
}

module.exports = {
    getSchedulesByClassroom,
    getSchedulesByTeacher,
    getScheduleById,
    findConflict,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getCurrentSchedule,
    deleteSchedulesByClassroom,
    // Utilities exposed for testing
    timeToMinutes,
    timesOverlap
};
