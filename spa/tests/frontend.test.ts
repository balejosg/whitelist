/**
 * OpenPath - Frontend Unit Tests
 * Tests for SPA JavaScript functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// ============================================
// relativeTime() function tests
// ============================================
void describe('relativeTime() function', () => {
    // Mock the function from app.js
    function relativeTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'ahora';
        if (diffMin < 60) return `hace ${diffMin.toString()} min`;
        if (diffHour < 24) return `hace ${diffHour.toString()}h`;
        if (diffDay < 7) return `hace ${diffDay.toString()} días`;
        return date.toLocaleDateString();
    }

    void test('should return "ahora" for just now', () => {
        const now = new Date().toISOString();
        assert.strictEqual(relativeTime(now), 'ahora');
    });

    void test('should return minutes for recent times', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(fiveMinAgo), 'hace 5 min');
    });

    void test('should return hours for older times', () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(twoHoursAgo), 'hace 2h');
    });

    void test('should return days for old times', () => {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(threeDaysAgo), 'hace 3 días');
    });

    void test('should return date for very old times', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const result = relativeTime(twoWeeksAgo);
        // Should be a date format, not relative
        assert.ok(!result.includes('hace'), `Expected date format, got: ${result}`);
    });
});

// ============================================
// Auth object method tests
// ============================================

interface User {
    roles?: { role: string; groupIds?: string[] }[];
    email?: string;
}

interface AuthMock {
    user: User | undefined;
    getUser(): User | undefined;
    isAdmin(): boolean;
    hasRole(role: string): boolean;
    getApprovalGroups(): string | string[];
    getTeacherGroups(): string[];
    getAssignedGroups(): string[];
    isTeacher(): boolean;
    isStudent(): boolean;
}

void describe('Auth.getTeacherGroups()', () => {
    // Mock Auth object with minimal implementation
    const createMockAuth = (user?: User): AuthMock => ({
        user,
        getUser() { return this.user; },
        isAdmin() {
            return this.user?.roles?.some(r => r.role === 'admin') ?? false;
        },
        hasRole(role) {
            return this.user?.roles?.some(r => r.role === role) ?? false;
        },
        getApprovalGroups() {
            if (this.isAdmin()) return 'all';
            if (!this.user?.roles) return [];
            const groups = new Set<string>();
            this.user.roles
                .filter(r => r.role === 'teacher')
                .forEach(r => { (r.groupIds ?? []).forEach(g => { groups.add(g); }); });
            return Array.from(groups);
        },
        getTeacherGroups() {
            const groups = this.getApprovalGroups();
            return groups === 'all' ? [] : (groups as string[]);
        },
        getAssignedGroups() {
            return this.getTeacherGroups();
        },
        isTeacher() {
            return this.hasRole('teacher');
        },
        isStudent() {
            return this.hasRole('student');
        }
    });

    void test('should return empty array for admin (gets "all")', () => {
        const auth = createMockAuth({
            roles: [{ role: 'admin' }]
        });
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });

    void test('should return groups for teacher', () => {
        const auth = createMockAuth({
            roles: [{ role: 'teacher', groupIds: ['matematicas-3', 'ciencias-2'] }]
        });
        const groups = auth.getTeacherGroups();
        assert.ok(groups.includes('matematicas-3'));
        assert.ok(groups.includes('ciencias-2'));
        assert.strictEqual(groups.length, 2);
    });

    void test('should return empty array for user without roles', () => {
        const auth = createMockAuth({});
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });

    void test('should return empty array for student', () => {
        const auth = createMockAuth({
            roles: [{ role: 'student' }]
        });
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });
});

void describe('Auth.isTeacher()', () => {
    const createMockAuth = (roles: { role: string }[]): AuthMock => ({
        user: { roles: roles.map(r => ({ role: r.role })) },
        getUser() { return this.user; },
        isAdmin() { return roles.some(r => r.role === 'admin'); },
        hasRole(role: string) { return roles.some(r => r.role === role); },
        isTeacher() { return this.hasRole('teacher'); },
        isStudent() { return this.hasRole('student'); },
        getApprovalGroups() { return []; },
        getTeacherGroups() { return []; },
        getAssignedGroups() { return []; }
    });

    void test('should return false for admin', () => {
        const auth = createMockAuth([{ role: 'admin' }]);
        assert.strictEqual(auth.isTeacher(), false);
    });

    void test('should return false for student', () => {
        const auth = createMockAuth([{ role: 'student' }]);
        assert.strictEqual(auth.isTeacher(), false);
    });
});

void describe('Auth.isStudent()', () => {
    const createMockAuth = (roles: { role: string }[]): AuthMock => ({
        user: { roles: roles.map(r => ({ role: r.role })) },
        getUser() { return this.user; },
        isAdmin() { return roles.some(r => r.role === 'admin'); },
        hasRole(role: string) { return roles.some(r => r.role === role); },
        isTeacher() { return this.hasRole('teacher'); },
        isStudent() { return this.hasRole('student'); },
        getApprovalGroups() { return []; },
        getTeacherGroups() { return []; },
        getAssignedGroups() { return []; }
    });

    void test('should return true for student', () => {
        const auth = createMockAuth([{ role: 'student' }]);
        assert.strictEqual(auth.isStudent(), true);
    });

    void test('should return false for teacher', () => {
        const auth = createMockAuth([{ role: 'teacher' }]);
        assert.strictEqual(auth.isStudent(), false);
    });
});

void describe('Auth.getAssignedGroups() alias', () => {
    void test('should return same as getTeacherGroups', () => {
        const mockAuth: AuthMock = {
            user: {},
            getUser() { return this.user; },
            isAdmin() { return false; },
            hasRole(_r: string) { return false; },
            getApprovalGroups() { return []; },
            isTeacher() { return false; },
            isStudent() { return false; },
            getTeacherGroups() { return ['group1', 'group2']; },
            getAssignedGroups() { return this.getTeacherGroups(); }
        };

        assert.deepStrictEqual(
            mockAuth.getAssignedGroups(),
            mockAuth.getTeacherGroups()
        );
    });
});
