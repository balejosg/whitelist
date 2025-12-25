/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage Module
 * Manages classroom schedules (recurring reservations by teachers)
 */
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
interface CreateScheduleInput {
    classroom_id: string;
    teacher_id: string;
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
}
interface UpdateScheduleInput {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    group_id?: string;
}
export declare function timeToMinutes(time: string): number;
export declare function timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean;
export declare function getSchedulesByClassroom(classroomId: string): StoredSchedule[];
export declare function getSchedulesByTeacher(teacherId: string): StoredSchedule[];
export declare function getScheduleById(id: string): StoredSchedule | null;
export declare function findConflict(classroomId: string, dayOfWeek: number, startTime: string, endTime: string, excludeId?: string | null): StoredSchedule | null;
export declare function createSchedule(scheduleData: CreateScheduleInput): StoredSchedule;
export declare function updateSchedule(id: string, updates: UpdateScheduleInput): StoredSchedule | null;
export declare function deleteSchedule(id: string): boolean;
export declare function getCurrentSchedule(classroomId: string, date?: Date): StoredSchedule | null;
export declare function deleteSchedulesByClassroom(classroomId: string): number;
declare const _default: {
    getSchedulesByClassroom: typeof getSchedulesByClassroom;
    getSchedulesByTeacher: typeof getSchedulesByTeacher;
    getScheduleById: typeof getScheduleById;
    findConflict: typeof findConflict;
    createSchedule: typeof createSchedule;
    updateSchedule: typeof updateSchedule;
    deleteSchedule: typeof deleteSchedule;
    getCurrentSchedule: typeof getCurrentSchedule;
    deleteSchedulesByClassroom: typeof deleteSchedulesByClassroom;
    timeToMinutes: typeof timeToMinutes;
    timesOverlap: typeof timesOverlap;
};
export default _default;
//# sourceMappingURL=schedule-storage.d.ts.map