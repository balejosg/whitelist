/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage Module
 * Manages classroom schedules (recurring reservations by teachers)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// =============================================================================
// Constants
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

// =============================================================================
// Types
// =============================================================================

interface StoredSchedule {
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

interface SchedulesData {
    schedules: StoredSchedule[];
}

interface ScheduleConflictError extends Error {
    conflict?: StoredSchedule;
}

interface CreateScheduleInput {
    classroom_id: string;
    teacher_id: string;
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
}

interface UpdateScheduleInput {
    day_of_week?: number | undefined;
    start_time?: string | undefined;
    end_time?: string | undefined;
    group_id?: string | undefined;
}

// =============================================================================
// Initialization
// =============================================================================

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(SCHEDULES_FILE)) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ schedules: [] }, null, 2));
}

// =============================================================================
// Data Access
// =============================================================================

function loadSchedules(): SchedulesData {
    try {
        const data = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
        return JSON.parse(data) as SchedulesData;
    } catch {
        return { schedules: [] };
    }
}

function saveSchedules(data: SchedulesData): void {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2));
}



// =============================================================================
// Time Utilities
// =============================================================================

export function timeToMinutes(time: string): number {
    const parts = time.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    return hours * 60 + minutes;
}

export function timesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
): boolean {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);

    return s1 < e2 && s2 < e1;
}

// =============================================================================
// Schedule CRUD
// =============================================================================

export function getSchedulesByClassroom(classroomId: string): StoredSchedule[] {
    const data = loadSchedules();
    return data.schedules.filter((s) => s.classroom_id === classroomId);
}

export function getSchedulesByTeacher(teacherId: string): StoredSchedule[] {
    const data = loadSchedules();
    return data.schedules.filter((s) => s.teacher_id === teacherId);
}

export function getScheduleById(id: string): StoredSchedule | null {
    const data = loadSchedules();
    return data.schedules.find((s) => s.id === id) ?? null;
}

export function findConflict(
    classroomId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId: string | null = null
): StoredSchedule | null {
    const data = loadSchedules();

    return data.schedules.find(
        (s) =>
            s.classroom_id === classroomId &&
            s.day_of_week === dayOfWeek &&
            s.id !== excludeId &&
            timesOverlap(s.start_time, s.end_time, startTime, endTime)
    ) ?? null;
}

export function createSchedule(scheduleData: CreateScheduleInput): StoredSchedule {
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

    const conflict = findConflict(classroom_id, day_of_week, start_time, end_time);
    if (conflict !== null) {
        const error: ScheduleConflictError = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    const data = loadSchedules();

    const schedule: StoredSchedule = {
        id: crypto.randomUUID(),
        classroom_id,
        teacher_id,
        group_id,
        day_of_week,
        start_time,
        end_time,
        recurrence: 'weekly',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    data.schedules.push(schedule);
    saveSchedules(data);

    return schedule;
}

export function updateSchedule(id: string, updates: UpdateScheduleInput): StoredSchedule | null {
    const data = loadSchedules();
    const index = data.schedules.findIndex((s) => s.id === id);

    if (index === -1) return null;
    const schedule = data.schedules[index];
    if (schedule === undefined) return null;

    const newDayOfWeek = updates.day_of_week ?? schedule.day_of_week;
    const newStartTime = updates.start_time ?? schedule.start_time;
    const newEndTime = updates.end_time ?? schedule.end_time;

    const conflict = findConflict(schedule.classroom_id, newDayOfWeek, newStartTime, newEndTime, id);
    if (conflict !== null) {
        const error: ScheduleConflictError = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    if (updates.day_of_week !== undefined) schedule.day_of_week = updates.day_of_week;
    if (updates.start_time !== undefined) schedule.start_time = updates.start_time;
    if (updates.end_time !== undefined) schedule.end_time = updates.end_time;
    if (updates.group_id !== undefined) schedule.group_id = updates.group_id;
    schedule.updated_at = new Date().toISOString();

    saveSchedules(data);
    return schedule;
}

export function deleteSchedule(id: string): boolean {
    const data = loadSchedules();
    const initialLength = data.schedules.length;
    data.schedules = data.schedules.filter((s) => s.id !== id);

    if (data.schedules.length < initialLength) {
        saveSchedules(data);
        return true;
    }
    return false;
}

export function getCurrentSchedule(classroomId: string, date: Date = new Date()): StoredSchedule | null {
    const dayOfWeek = date.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null;
    }

    const currentTime = date.toTimeString().slice(0, 5);
    const currentMinutes = timeToMinutes(currentTime);

    const data = loadSchedules();

    return data.schedules.find(
        (s) =>
            s.classroom_id === classroomId &&
            s.day_of_week === dayOfWeek &&
            timeToMinutes(s.start_time) <= currentMinutes &&
            timeToMinutes(s.end_time) > currentMinutes
    ) ?? null;
}

export function deleteSchedulesByClassroom(classroomId: string): number {
    const data = loadSchedules();
    const initialLength = data.schedules.length;
    data.schedules = data.schedules.filter((s) => s.classroom_id !== classroomId);
    saveSchedules(data);
    return initialLength - data.schedules.length;
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
