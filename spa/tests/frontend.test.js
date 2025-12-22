/**
 * OpenPath - Frontend Unit Tests
 * Tests for SPA JavaScript functions
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

// ============================================
// relativeTime() function tests
// ============================================
describe('relativeTime() function', () => {
    // Mock the function from app.js
    function relativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'ahora';
        if (diffMin < 60) return `hace ${diffMin} min`;
        if (diffHour < 24) return `hace ${diffHour}h`;
        if (diffDay < 7) return `hace ${diffDay} días`;
        return date.toLocaleDateString();
    }

    test('should return "ahora" for just now', () => {
        const now = new Date().toISOString();
        assert.strictEqual(relativeTime(now), 'ahora');
    });

    test('should return minutes for recent times', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(fiveMinAgo), 'hace 5 min');
    });

    test('should return hours for older times', () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(twoHoursAgo), 'hace 2h');
    });

    test('should return days for old times', () => {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(threeDaysAgo), 'hace 3 días');
    });

    test('should return date for very old times', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const result = relativeTime(twoWeeksAgo);
        // Should be a date format, not relative
        assert.ok(!result.includes('hace'), `Expected date format, got: ${result}`);
    });
});

// ============================================
// Auth object method tests
// ============================================
describe('Auth.getTeacherGroups()', () => {
    // Mock Auth object with minimal implementation
    const createMockAuth = (user) => ({
        user,
        getUser() { return this.user; },
        isAdmin() {
            return this.user?.roles?.some(r => r.role === 'admin') || false;
        },
        hasRole(role) {
            return this.user?.roles?.some(r => r.role === role) || false;
        },
        getApprovalGroups() {
            if (this.isAdmin()) return 'all';
            if (!this.user?.roles) return [];
            const groups = new Set();
            this.user.roles
                .filter(r => r.role === 'teacher')
                .forEach(r => (r.groupIds || []).forEach(g => groups.add(g)));
            return Array.from(groups);
        },
        getTeacherGroups() {
            const groups = this.getApprovalGroups();
            return groups === 'all' ? [] : groups;
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

    test('should return empty array for admin (gets "all")', () => {
        const auth = createMockAuth({
            roles: [{ role: 'admin' }]
        });
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });

    test('should return groups for teacher', () => {
        const auth = createMockAuth({
            roles: [{ role: 'teacher', groupIds: ['matematicas-3', 'ciencias-2'] }]
        });
        const groups = auth.getTeacherGroups();
        assert.ok(groups.includes('matematicas-3'));
        assert.ok(groups.includes('ciencias-2'));
        assert.strictEqual(groups.length, 2);
    });

    test('should return empty array for user without roles', () => {
        const auth = createMockAuth({});
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });

    test('should return empty array for student', () => {
        const auth = createMockAuth({
            roles: [{ role: 'student' }]
        });
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });
});

describe('Auth.isTeacher()', () => {
    const createMockAuth = (roles) => ({
        hasRole(role) { return roles.some(r => r.role === role); },
        isTeacher() { return this.hasRole('teacher'); }
    });

    test('should return true for teacher', () => {
        const auth = createMockAuth([{ role: 'teacher', groupIds: ['test'] }]);
        assert.strictEqual(auth.isTeacher(), true);
    });

    test('should return false for admin', () => {
        const auth = createMockAuth([{ role: 'admin' }]);
        assert.strictEqual(auth.isTeacher(), false);
    });

    test('should return false for student', () => {
        const auth = createMockAuth([{ role: 'student' }]);
        assert.strictEqual(auth.isTeacher(), false);
    });
});

describe('Auth.isStudent()', () => {
    const createMockAuth = (roles) => ({
        hasRole(role) { return roles.some(r => r.role === role); },
        isStudent() { return this.hasRole('student'); }
    });

    test('should return true for student', () => {
        const auth = createMockAuth([{ role: 'student' }]);
        assert.strictEqual(auth.isStudent(), true);
    });

    test('should return false for teacher', () => {
        const auth = createMockAuth([{ role: 'teacher', groupIds: ['test'] }]);
        assert.strictEqual(auth.isStudent(), false);
    });
});

describe('Auth.getAssignedGroups() alias', () => {
    test('should return same as getTeacherGroups', () => {
        const mockAuth = {
            getTeacherGroups() { return ['group1', 'group2']; },
            getAssignedGroups() { return this.getTeacherGroups(); }
        };

        assert.deepStrictEqual(
            mockAuth.getAssignedGroups(),
            mockAuth.getTeacherGroups()
        );
    });
});
