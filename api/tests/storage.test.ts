import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as storage from '../src/lib/storage.js';
import * as userStorage from '../src/lib/user-storage.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';

void describe('Storage Layer', () => {
    void describe('User Storage', () => {
        void it('should normalize email on creation', async () => {
            const userData = {
                email: ' TEST@Example.com ',
                name: 'Test User',
                password: 'password123'
            };
            const user = await userStorage.createUser(userData);
            assert.strictEqual(user.email, 'test@example.com');
        });
        
        void it('should find user by email (case-insensitive)', async () => {
            const user = await userStorage.getUserByEmail('tEsT@eXamPle.coM');
            assert.ok(user);
            assert.strictEqual(user.email, 'test@example.com');
        });
    });

    void describe('Request Storage', () => {
        void it('should normalize domain on creation', async () => {
            const requestData = {
                domain: ' GOOGLE.com ',
                requesterEmail: 'user@example.com',
                groupId: 'default'
            };
            const request = await storage.createRequest(requestData);
            assert.strictEqual(request.domain, 'google.com');
        });
    });

    void describe('Classroom Storage', () => {
        void it('should generate slug from name', async () => {
            const room = await classroomStorage.createClassroom({
                name: 'Aula de Informática 1'
            });
            assert.strictEqual(room.name, 'aula-de-informatica-1');
        });
    });

    void describe('Schedule Storage', () => {
        void it('should correctly detect overlapping times', () => {
            // Overlapping
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '09:00', '11:00'), true);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '08:30', '09:30'), true);
            // Non-overlapping
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '09:00', '10:00'), false);
            assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '10:00', '11:00'), false);
        });

        void it('should convert time to minutes', () => {
            assert.strictEqual(scheduleStorage.timeToMinutes('01:30'), 90);
            assert.strictEqual(scheduleStorage.timeToMinutes('00:00'), 0);
            assert.strictEqual(scheduleStorage.timeToMinutes('23:59'), 1439);
        });
    });
});
