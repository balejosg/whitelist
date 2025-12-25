/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for Schedule Storage and API
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set test data directory
process.env.DATA_DIR = path.join(__dirname, '../data-test');
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.ADMIN_TOKEN = 'test-admin-token';

// Test data
const testClassroomId = 'test-classroom-1';
const testTeacherId = 'teacher-1';
const testGroupId = 'group-math-3eso';

interface Schedule {
    id: string;
    classroom_id: string;
    teacher_id: string;
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    recurrence: string;
}

interface ScheduleStorage {
    timeToMinutes: (time: string) => number;
    timesOverlap: (start1: string, end1: string, start2: string, end2: string) => boolean;
    createSchedule: (data: Partial<Schedule>) => Schedule;
    updateSchedule: (id: string, data: Partial<Schedule>) => Schedule;
    deleteSchedule: (id: string) => boolean;
    getScheduleById: (id: string) => Schedule | null;
    getSchedulesByClassroom: (classroomId: string) => Schedule[];
    getSchedulesByTeacher: (teacherId: string) => Schedule[];
    getCurrentSchedule: (classroomId: string, date?: Date) => Schedule | null;
}

interface Classroom {
    id: string;
    name: string;
}

interface ClassroomStorage {
    createClassroom: (data: { name: string; displayName: string; defaultGroupId: string }) => Classroom;
    registerMachine: (data: { hostname: string; classroomId: string }) => void;
    setActiveGroup: (classroomId: string, groupId: string) => void;
    getWhitelistUrlForMachine: (hostname: string) => { group_id: string; source: string } | null;
}

let scheduleStorage: ScheduleStorage;

describe('Schedule Storage', () => {
    before(async () => {
        const testDataDir = process.env.DATA_DIR!;
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
        fs.mkdirSync(testDataDir, { recursive: true });

        fs.writeFileSync(path.join(testDataDir, 'schedules.json'), JSON.stringify({ schedules: [] }));
        fs.writeFileSync(path.join(testDataDir, 'classrooms.json'), JSON.stringify({ classrooms: [] }));
        fs.writeFileSync(path.join(testDataDir, 'machines.json'), JSON.stringify({ machines: [] }));

        scheduleStorage = await import('../src/lib/schedule-storage.js') as unknown as ScheduleStorage;
    });

    beforeEach(() => {
        const schedulesFile = path.join(process.env.DATA_DIR!, 'schedules.json');
        fs.writeFileSync(schedulesFile, JSON.stringify({ schedules: [] }));
    });

    after(() => {
        const testDataDir = process.env.DATA_DIR!;
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
    });

    describe('Time Utilities', () => {
        it('should convert time string to minutes', () => {
            assert.strictEqual(scheduleStorage.timeToMinutes('00:00'), 0);
            assert.strictEqual(scheduleStorage.timeToMinutes('01:00'), 60);
            assert.strictEqual(scheduleStorage.timeToMinutes('08:30'), 510);
            assert.strictEqual(scheduleStorage.timeToMinutes('23:59'), 1439);
        });

        it('should detect overlapping time ranges', () => {
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '09:00', '10:00'), false);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '10:00', '11:00'), false);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '08:30', '09:30'), true);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '09:00', '09:30'), true);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '08:00', '09:00'), true);
        });
    });

    describe('CRUD Operations', () => {
        it('should create a schedule', () => {
            const schedule = scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            assert.ok(schedule.id);
            assert.strictEqual(schedule.classroom_id, testClassroomId);
            assert.strictEqual(schedule.teacher_id, testTeacherId);
            assert.strictEqual(schedule.recurrence, 'weekly');
        });

        it('should reject invalid day of week', () => {
            assert.throws(() => {
                scheduleStorage.createSchedule({
                    classroom_id: testClassroomId,
                    teacher_id: testTeacherId,
                    group_id: testGroupId,
                    day_of_week: 6,
                    start_time: '08:00',
                    end_time: '09:00'
                });
            }, /day_of_week must be between 1.*and 5/);
        });

        it('should reject invalid time format', () => {
            assert.throws(() => {
                scheduleStorage.createSchedule({
                    classroom_id: testClassroomId,
                    teacher_id: testTeacherId,
                    group_id: testGroupId,
                    day_of_week: 1,
                    start_time: '8:00',
                    end_time: '09:00'
                });
            }, /Invalid time format/);
        });

        it('should reject start_time >= end_time', () => {
            assert.throws(() => {
                scheduleStorage.createSchedule({
                    classroom_id: testClassroomId,
                    teacher_id: testTeacherId,
                    group_id: testGroupId,
                    day_of_week: 1,
                    start_time: '09:00',
                    end_time: '08:00'
                });
            }, /start_time must be before end_time/);
        });

        it('should detect conflicts', () => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            assert.throws(() => {
                scheduleStorage.createSchedule({
                    classroom_id: testClassroomId,
                    teacher_id: 'teacher-2',
                    group_id: 'group-other',
                    day_of_week: 1,
                    start_time: '08:30',
                    end_time: '09:30'
                });
            }, /Schedule conflict/);
        });

        it('should allow non-overlapping schedules', () => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            const schedule2 = scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: 'teacher-2',
                group_id: 'group-other',
                day_of_week: 1,
                start_time: '09:00',
                end_time: '10:00'
            });

            assert.ok(schedule2.id);
        });

        it('should update a schedule', () => {
            const schedule = scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            const updated = scheduleStorage.updateSchedule(schedule.id, {
                start_time: '08:30',
                end_time: '09:30'
            });

            assert.strictEqual(updated.start_time, '08:30');
            assert.strictEqual(updated.end_time, '09:30');
        });

        it('should delete a schedule', () => {
            const schedule = scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            const deleted = scheduleStorage.deleteSchedule(schedule.id);
            assert.strictEqual(deleted, true);

            const retrieved = scheduleStorage.getScheduleById(schedule.id);
            assert.strictEqual(retrieved, null);
        });
    });

    describe('Query Operations', () => {
        beforeEach(() => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: 'teacher-2',
                group_id: 'group-other',
                day_of_week: 1,
                start_time: '09:00',
                end_time: '10:00'
            });
        });

        it('should get schedules by classroom', () => {
            const schedules = scheduleStorage.getSchedulesByClassroom(testClassroomId);
            assert.strictEqual(schedules.length, 2);
        });

        it('should get schedules by teacher', () => {
            const schedules = scheduleStorage.getSchedulesByTeacher(testTeacherId);
            assert.strictEqual(schedules.length, 1);
            assert.strictEqual(schedules[0].teacher_id, testTeacherId);
        });
    });

    describe('getCurrentSchedule', () => {
        beforeEach(() => {
            const schedulesFile = path.join(process.env.DATA_DIR!, 'schedules.json');
            fs.writeFileSync(schedulesFile, JSON.stringify({ schedules: [] }));
        });

        it('should return null on weekends', () => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            const sunday = new Date('2025-01-05T09:00:00');
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, sunday);
            assert.strictEqual(result, null);
        });

        it('should return correct schedule for current time', () => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 3,
                start_time: '08:00',
                end_time: '09:00'
            });

            const wednesday = new Date('2025-01-08T08:30:00');
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);

            assert.ok(result);
            assert.strictEqual(result?.group_id, testGroupId);
        });

        it('should return null outside scheduled times', () => {
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 3,
                start_time: '08:00',
                end_time: '09:00'
            });

            const wednesday = new Date('2025-01-08T10:00:00');
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);
            assert.strictEqual(result, null);
        });
    });

    describe('Whitelist Integration', () => {
        let classroomStorage: ClassroomStorage;

        before(async () => {
            classroomStorage = await import('../src/lib/classroom-storage.js') as unknown as ClassroomStorage;
        });

        beforeEach(() => {
            const testDataDir = process.env.DATA_DIR!;
            fs.writeFileSync(path.join(testDataDir, 'schedules.json'), JSON.stringify({ schedules: [] }));
            fs.writeFileSync(path.join(testDataDir, 'classrooms.json'), JSON.stringify({ classrooms: [] }));
            fs.writeFileSync(path.join(testDataDir, 'machines.json'), JSON.stringify({ machines: [] }));
        });

        it('should use schedule group when no manual override', () => {
            const classroom = classroomStorage.createClassroom({
                name: 'aula-test',
                displayName: 'Aula Test',
                defaultGroupId: 'default-group'
            });

            classroomStorage.registerMachine({
                hostname: 'pc-test-01',
                classroomId: classroom.id
            });

            const now = new Date();
            const dayOfWeek = now.getDay();

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return;
            }

            const currentHour = now.getHours();
            const startTime = `${String(currentHour).padStart(2, '0')}:00`;
            const endTime = `${String(currentHour + 1).padStart(2, '0')}:00`;

            scheduleStorage.createSchedule({
                classroom_id: classroom.id,
                teacher_id: testTeacherId,
                group_id: 'scheduled-group',
                day_of_week: dayOfWeek,
                start_time: startTime,
                end_time: endTime
            });

            const result = classroomStorage.getWhitelistUrlForMachine('pc-test-01');

            assert.ok(result);
            assert.strictEqual(result?.group_id, 'scheduled-group');
            assert.strictEqual(result?.source, 'schedule');
        });

        it('should prefer manual override over schedule', () => {
            const classroom = classroomStorage.createClassroom({
                name: 'aula-override',
                displayName: 'Aula Override',
                defaultGroupId: 'default-group'
            });

            classroomStorage.setActiveGroup(classroom.id, 'manual-group');

            classroomStorage.registerMachine({
                hostname: 'pc-override-01',
                classroomId: classroom.id
            });

            const result = classroomStorage.getWhitelistUrlForMachine('pc-override-01');

            assert.ok(result);
            assert.strictEqual(result?.group_id, 'manual-group');
            assert.strictEqual(result?.source, 'manual');
        });

        it('should fall back to default group when no schedule', () => {
            const classroom = classroomStorage.createClassroom({
                name: 'aula-default',
                displayName: 'Aula Default',
                defaultGroupId: 'fallback-group'
            });

            classroomStorage.registerMachine({
                hostname: 'pc-default-01',
                classroomId: classroom.id
            });

            const result = classroomStorage.getWhitelistUrlForMachine('pc-default-01');

            assert.ok(result);
            assert.strictEqual(result?.group_id, 'fallback-group');
            assert.strictEqual(result?.source, 'default');
        });
    });
});
