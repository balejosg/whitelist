/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage - PostgreSQL-based schedule management using Drizzle ORM
 */

import crypto from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, schedules } from '../db/index.js';

// =============================================================================
// Types
// =============================================================================

type DBSchedule = typeof schedules.$inferSelect;

interface ScheduleConflictError extends Error {
    conflict?: DBSchedule;
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

export async function getSchedulesByClassroom(classroomId: string): Promise<DBSchedule[]> {
    const result = await db.select()
        .from(schedules)
        .where(eq(schedules.classroomId, classroomId))
        .orderBy(schedules.dayOfWeek, schedules.startTime);

    return result;
}

export async function getSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
    const result = await db.select()
        .from(schedules)
        .where(eq(schedules.teacherId, teacherId))
        .orderBy(schedules.dayOfWeek, schedules.startTime);

    return result;
}

export async function getScheduleById(id: string): Promise<DBSchedule | null> {
    const result = await db.select()
        .from(schedules)
        .where(eq(schedules.id, id))
        .limit(1);

    return result[0] ?? null;
}

export async function findConflict(
    classroomId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId: string | null = null
): Promise<DBSchedule | null> {
    // Use raw SQL for OVERLAPS operator
    const conditions = excludeId !== null
        ? and(
            eq(schedules.classroomId, classroomId),
            eq(schedules.dayOfWeek, dayOfWeek),
            sql`(${startTime}::time, ${endTime}::time) OVERLAPS (${schedules.startTime}, ${schedules.endTime})`,
            sql`${schedules.id} != ${excludeId}::uuid`
        )
        : and(
            eq(schedules.classroomId, classroomId),
            eq(schedules.dayOfWeek, dayOfWeek),
            sql`(${startTime}::time, ${endTime}::time) OVERLAPS (${schedules.startTime}, ${schedules.endTime})`
        );

    const result = await db.select()
        .from(schedules)
        .where(conditions)
        .limit(1);

    return result[0] ?? null;
}

export async function createSchedule(scheduleData: CreateScheduleInput): Promise<DBSchedule> {
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
        const error: ScheduleConflictError = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    const id = crypto.randomUUID();

    const [result] = await db.insert(schedules)
        .values({
            id,
            classroomId: classroom_id,
            teacherId: teacher_id,
            groupId: group_id,
            dayOfWeek: day_of_week,
            startTime: start_time,
            endTime: end_time,
            recurrence: 'weekly',
        })
        .returning();

    if (!result) throw new Error('Failed to create schedule');
    return result;
}

export async function updateSchedule(id: string, updates: UpdateScheduleInput): Promise<DBSchedule | null> {
    const schedule = await getScheduleById(id);
    if (!schedule) return null;

    const newDayOfWeek = updates.day_of_week ?? schedule.dayOfWeek;
    const newStartTime = updates.start_time ?? schedule.startTime;
    const newEndTime = updates.end_time ?? schedule.endTime;

    const conflict = await findConflict(schedule.classroomId, newDayOfWeek, newStartTime, newEndTime, id);
    if (conflict !== null) {
        const error: ScheduleConflictError = new Error('Schedule conflict');
        error.conflict = conflict;
        throw error;
    }

    const updateValues: Partial<typeof schedules.$inferInsert> = {};

    if (updates.day_of_week !== undefined) {
        updateValues.dayOfWeek = updates.day_of_week;
    }
    if (updates.start_time !== undefined) {
        updateValues.startTime = updates.start_time;
    }
    if (updates.end_time !== undefined) {
        updateValues.endTime = updates.end_time;
    }
    if (updates.group_id !== undefined) {
        updateValues.groupId = updates.group_id;
    }

    if (Object.keys(updateValues).length === 0) {
        return schedule;
    }

    const [result] = await db.update(schedules)
        .set(updateValues)
        .where(eq(schedules.id, id))
        .returning();

    return result ?? null;
}

export async function deleteSchedule(id: string): Promise<boolean> {
    const result = await db.delete(schedules)
        .where(eq(schedules.id, id));

    return (result.rowCount ?? 0) > 0;
}

export async function getCurrentSchedule(classroomId: string, date: Date = new Date()): Promise<DBSchedule | null> {
    const dayOfWeek = date.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return null;
    }

    const currentTime = date.toTimeString().slice(0, 5);

    const result = await db.select()
        .from(schedules)
        .where(and(
            eq(schedules.classroomId, classroomId),
            eq(schedules.dayOfWeek, dayOfWeek),
            sql`${schedules.startTime} <= ${currentTime}::time`,
            sql`${schedules.endTime} > ${currentTime}::time`
        ))
        .limit(1);

    return result[0] ?? null;
}

export async function deleteSchedulesByClassroom(classroomId: string): Promise<number> {
    const result = await db.delete(schedules)
        .where(eq(schedules.classroomId, classroomId));

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
