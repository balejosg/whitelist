/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage - PostgreSQL-based schedule management
 */
import crypto from 'node:crypto';
import { query } from './db.js';
// =============================================================================
// Time Utilities
// =============================================================================
export function timeToMinutes(time) {
    const parts = time.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    return hours * 60 + minutes;
}
export function timesOverlap(start1, end1, start2, end2) {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);
    return s1 < e2 && s2 < e1;
}
// =============================================================================
// Schedule CRUD
// =============================================================================
export async function getSchedulesByClassroom(classroomId) {
    const result = await query('SELECT * FROM schedules WHERE classroom_id = $1 ORDER BY day_of_week, start_time', [classroomId]);
    return result.rows;
}
export async function getSchedulesByTeacher(teacherId) {
    const result = await query('SELECT * FROM schedules WHERE teacher_id = $1 ORDER BY day_of_week, start_time', [teacherId]);
    return result.rows;
}
export async function getScheduleById(id) {
    const result = await query('SELECT * FROM schedules WHERE id = $1::uuid', [id]);
    return result.rows[0] ?? null;
}
export async function findConflict(classroomId, dayOfWeek, startTime, endTime, excludeId = null) {
    let sql = `
        SELECT * FROM schedules
        WHERE classroom_id = $1
        AND day_of_week = $2
        AND ($3::time, $4::time) OVERLAPS (start_time, end_time)
    `;
    const params = [classroomId, dayOfWeek, startTime, endTime];
    if (excludeId !== null) {
        sql += ' AND id != $5::uuid';
        params.push(excludeId);
    }
    sql += ' LIMIT 1';
    const result = await query(sql, params);
    return result.rows[0] ?? null;
}
export async function createSchedule(scheduleData) {
    const { classroom_id, teacher_id, group_id, day_of_week, start_time, end_time } = scheduleData;
    if (day_of_week < 1 || day_of_week > 5) {
        throw new Error('day_of_week must be between 1 (Monday) and 5 (Friday)');
    }
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
        throw new Error('Invalid time format. Use HH:MM (24h)');
    }
    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
        throw new Error('start_time must be before end_time');
    }
    const conflict = await findConflict(classroom_id, day_of_week, start_time, end_time);
    if (conflict !== null) {
        const error = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }
    const id = crypto.randomUUID();
    const result = await query(`INSERT INTO schedules (
            id, classroom_id, teacher_id, group_id, 
            day_of_week, start_time, end_time, recurrence
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'weekly')
        RETURNING *`, [id, classroom_id, teacher_id, group_id, day_of_week, start_time, end_time]);
    return result.rows[0];
}
export async function updateSchedule(id, updates) {
    const schedule = await getScheduleById(id);
    if (!schedule)
        return null;
    const newDayOfWeek = updates.day_of_week ?? schedule.day_of_week;
    const newStartTime = updates.start_time ?? schedule.start_time;
    const newEndTime = updates.end_time ?? schedule.end_time;
    const conflict = await findConflict(schedule.classroom_id, newDayOfWeek, newStartTime, newEndTime, id);
    if (conflict !== null) {
        const error = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    if (updates.day_of_week !== undefined) {
        setClauses.push(`day_of_week = $${paramIndex++}`);
        values.push(updates.day_of_week);
    }
    if (updates.start_time !== undefined) {
        setClauses.push(`start_time = $${paramIndex++}`);
        values.push(updates.start_time);
    }
    if (updates.end_time !== undefined) {
        setClauses.push(`end_time = $${paramIndex++}`);
        values.push(updates.end_time);
    }
    if (updates.group_id !== undefined) {
        setClauses.push(`group_id = $${paramIndex++}`);
        values.push(updates.group_id);
    }
    if (setClauses.length === 0) {
        return schedule;
    }
    values.push(id);
    const result = await query(`UPDATE schedules SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}::uuid
         RETURNING *`, values);
    return result.rows[0] ?? null;
}
export async function deleteSchedule(id) {
    const result = await query('DELETE FROM schedules WHERE id = $1::uuid', [id]);
    return (result.rowCount ?? 0) > 0;
}
export async function getCurrentSchedule(classroomId, date = new Date()) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null;
    }
    const currentTime = date.toTimeString().slice(0, 5);
    const result = await query(`SELECT * FROM schedules
         WHERE classroom_id = $1
         AND day_of_week = $2
         AND start_time <= $3::time
         AND end_time > $3::time
         LIMIT 1`, [classroomId, dayOfWeek, currentTime]);
    return result.rows[0] ?? null;
}
export async function deleteSchedulesByClassroom(classroomId) {
    const result = await query('DELETE FROM schedules WHERE classroom_id = $1', [classroomId]);
    return result.rowCount ?? 0;
}
export default {
    getSchedulesByClassroom,
    getSchedulesByTeacher,
    getScheduleById,
    findConflict,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getCurrentSchedule,
    deleteSchedulesByClassroom,
    timeToMinutes,
    timesOverlap
};
//# sourceMappingURL=schedule-storage.js.map