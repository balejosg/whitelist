/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for Schedule Storage and API
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Set test data directory
process.env.DATA_DIR = path.join(__dirname, '../data-test');
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.ADMIN_TOKEN = 'test-admin-token';

// Use dynamic import pattern for fresh module state
let scheduleStorage;
let app;

// Test data
const testClassroomId = 'test-classroom-1';
const testTeacherId = 'teacher-1';
const testGroupId = 'group-math-3eso';

describe('Schedule Storage', () => {
    before(() => {
        // Clean test data directory
        const testDataDir = process.env.DATA_DIR;
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
        fs.mkdirSync(testDataDir, { recursive: true });

        // Initialize empty files
        fs.writeFileSync(path.join(testDataDir, 'schedules.json'), JSON.stringify({ schedules: [] }));
        fs.writeFileSync(path.join(testDataDir, 'classrooms.json'), JSON.stringify({ classrooms: [] }));
        fs.writeFileSync(path.join(testDataDir, 'machines.json'), JSON.stringify({ machines: [] }));

        // Load modules after setting env
        scheduleStorage = require('../lib/schedule-storage');
    });

    beforeEach(() => {
        // Reset schedules before each test
        const schedulesFile = path.join(process.env.DATA_DIR, 'schedules.json');
        fs.writeFileSync(schedulesFile, JSON.stringify({ schedules: [] }));
    });

    after(() => {
        // Cleanup
        const testDataDir = process.env.DATA_DIR;
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
            // Clear overlap
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '09:00', '10:00'), false);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '10:00', '11:00'), false);

            // Overlapping
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '08:30', '09:30'), true);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '09:00', '09:30'), true);

            // Same time
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
                    day_of_week: 6, // Saturday - not allowed
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
                    start_time: '8:00', // Missing leading zero
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
            // Create first schedule
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            // Try to create overlapping schedule
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
            // Create first schedule
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            // Create adjacent schedule (should work)
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
            // Create test schedules
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
            // Reset schedules
            const schedulesFile = path.join(process.env.DATA_DIR, 'schedules.json');
            fs.writeFileSync(schedulesFile, JSON.stringify({ schedules: [] }));
        });

        it('should return null on weekends', () => {
            // Create a schedule for Monday
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 1,
                start_time: '08:00',
                end_time: '09:00'
            });

            // Test with a Sunday
            const sunday = new Date('2025-01-05T09:00:00'); // Sunday
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, sunday);
            assert.strictEqual(result, null);
        });

        it('should return correct schedule for current time', () => {
            // Create schedule for Wednesday 08:00-09:00
            scheduleStorage.createSchedule({
                classroom_id: testClassroomId,
                teacher_id: testTeacherId,
                group_id: testGroupId,
                day_of_week: 3, // Wednesday
                start_time: '08:00',
                end_time: '09:00'
            });

            // Test at 08:30 on Wednesday
            const wednesday = new Date('2025-01-08T08:30:00'); // Wednesday
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);

            assert.ok(result);
            assert.strictEqual(result.group_id, testGroupId);
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

            // Test at 10:00 (outside 08:00-09:00)
            const wednesday = new Date('2025-01-08T10:00:00');
            const result = scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);
            assert.strictEqual(result, null);
        });
    });

    describe('Whitelist Integration', () => {
        let classroomStorage;

        before(() => {
            classroomStorage = require('../lib/classroom-storage');
        });

        beforeEach(() => {
            // Reset all data
            const testDataDir = process.env.DATA_DIR;
            fs.writeFileSync(path.join(testDataDir, 'schedules.json'), JSON.stringify({ schedules: [] }));
            fs.writeFileSync(path.join(testDataDir, 'classrooms.json'), JSON.stringify({ classrooms: [] }));
            fs.writeFileSync(path.join(testDataDir, 'machines.json'), JSON.stringify({ machines: [] }));
        });

        it('should use schedule group when no manual override', () => {
            // Create classroom with default group
            const classroom = classroomStorage.createClassroom({
                name: 'aula-test',
                displayName: 'Aula Test',
                defaultGroupId: 'default-group'
            });

            // Register a machine
            classroomStorage.registerMachine({
                hostname: 'pc-test-01',
                classroomId: classroom.id
            });

            // Create schedule for current time (simulate)
            const now = new Date();
            const dayOfWeek = now.getDay();

            // Skip test on weekends
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return; // Skip - can't test schedule on weekend
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

            // Get whitelist URL
            const result = classroomStorage.getWhitelistUrlForMachine('pc-test-01');

            assert.ok(result);
            assert.strictEqual(result.group_id, 'scheduled-group');
            assert.strictEqual(result.source, 'schedule');
        });

        it('should prefer manual override over schedule', () => {
            // Create classroom with active group override
            const classroom = classroomStorage.createClassroom({
                name: 'aula-override',
                displayName: 'Aula Override',
                defaultGroupId: 'default-group'
            });

            // Set manual override
            classroomStorage.setActiveGroup(classroom.id, 'manual-group');

            // Register a machine
            classroomStorage.registerMachine({
                hostname: 'pc-override-01',
                classroomId: classroom.id
            });

            // Get whitelist URL
            const result = classroomStorage.getWhitelistUrlForMachine('pc-override-01');

            assert.ok(result);
            assert.strictEqual(result.group_id, 'manual-group');
            assert.strictEqual(result.source, 'manual');
        });

        it('should fall back to default group when no schedule', () => {
            // Create classroom
            const classroom = classroomStorage.createClassroom({
                name: 'aula-default',
                displayName: 'Aula Default',
                defaultGroupId: 'fallback-group'
            });

            // Register machine
            classroomStorage.registerMachine({
                hostname: 'pc-default-01',
                classroomId: classroom.id
            });

            // Get whitelist URL (no schedule, no override)
            const result = classroomStorage.getWhitelistUrlForMachine('pc-default-01');

            assert.ok(result);
            assert.strictEqual(result.group_id, 'fallback-group');
            assert.strictEqual(result.source, 'default');
        });
    });
});
