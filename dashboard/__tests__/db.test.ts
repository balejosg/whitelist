/**
 * Dashboard Database Module Tests
 * Tests for db.ts functions
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as db from '../src/db.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a separate test data directory
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_EXPORT_DIR = path.join(TEST_DATA_DIR, 'export');

// Helper to reset database state
function resetTestDb(): void {
    // Clean up test data directory
    if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.mkdirSync(TEST_EXPORT_DIR, { recursive: true });

    // Reset the in-memory database to default state
    db.resetDb();
}

describe('Database Module', () => {
    beforeEach(() => {
        resetTestDb();
    });

    afterAll(() => {
        // Clean up test data directory after all tests
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    describe('Group Operations', () => {
        test('getAllGroups returns empty array initially', () => {
            const groups = db.getAllGroups();
            expect(Array.isArray(groups)).toBe(true);
        });

        test('createGroup creates a new group and returns its ID', () => {
            const groupId = db.createGroup('test-group', 'Test Group');
            expect(typeof groupId).toBe('number');
            expect(groupId).toBeGreaterThan(0);
        });

        test('getGroupById retrieves created group', () => {
            const groupId = db.createGroup('my-group', 'My Group');
            const group = db.getGroupById(groupId);

            expect(group).toBeDefined();
            expect(group?.name).toBe('my-group');
            expect(group?.display_name).toBe('My Group');
            expect(group?.enabled).toBe(1);
        });

        test('getGroupByName retrieves group by name', () => {
            db.createGroup('named-group', 'Named Group');
            const group = db.getGroupByName('named-group');

            expect(group).toBeDefined();
            expect(group?.display_name).toBe('Named Group');
        });

        test('createGroup throws on duplicate name', () => {
            db.createGroup('unique-group', 'Unique Group');

            expect(() => {
                db.createGroup('unique-group', 'Another Display Name');
            }).toThrow('SQLITE_CONSTRAINT_UNIQUE');
        });

        test('updateGroup modifies group properties', () => {
            const groupId = db.createGroup('update-test', 'Original Name');
            db.updateGroup(groupId, 'Updated Name', false);

            const group = db.getGroupById(groupId);
            expect(group?.display_name).toBe('Updated Name');
            expect(group?.enabled).toBe(0);
        });

        test('deleteGroup removes group and its rules', () => {
            const groupId = db.createGroup('delete-test', 'Delete Test');
            db.createRule(groupId, 'whitelist', 'example.com');

            db.deleteGroup(groupId);

            expect(db.getGroupById(groupId)).toBeUndefined();
            expect(db.getRulesByGroup(groupId)).toHaveLength(0);
        });
    });

    describe('Rule Operations', () => {
        let groupId: number;

        beforeEach(() => {
            groupId = db.createGroup('rule-test-group', 'Rule Test Group');
        });

        test('createRule adds a new rule', () => {
            const result = db.createRule(groupId, 'whitelist', 'example.com');

            expect(result.success).toBe(true);
            expect(result.id).toBeDefined();
        });

        test('createRule normalizes domain to lowercase', () => {
            db.createRule(groupId, 'whitelist', 'EXAMPLE.COM');
            const rules = db.getRulesByGroup(groupId);

            expect(rules[0]?.value).toBe('example.com');
        });

        test('createRule prevents duplicate rules', () => {
            db.createRule(groupId, 'whitelist', 'duplicate.com');
            const result = db.createRule(groupId, 'whitelist', 'duplicate.com');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('getRulesByGroup filters by type', () => {
            db.createRule(groupId, 'whitelist', 'allowed.com');
            db.createRule(groupId, 'blocked_subdomain', 'blocked.example.com');

            const whitelistRules = db.getRulesByGroup(groupId, 'whitelist');
            const blockedRules = db.getRulesByGroup(groupId, 'blocked_subdomain');

            expect(whitelistRules).toHaveLength(1);
            expect(whitelistRules[0]?.value).toBe('allowed.com');
            expect(blockedRules).toHaveLength(1);
            expect(blockedRules[0]?.value).toBe('blocked.example.com');
        });

        test('deleteRule removes a specific rule', () => {
            const result = db.createRule(groupId, 'whitelist', 'to-delete.com');
            expect(result.id).toBeDefined();

            db.deleteRule(result.id!);
            const rules = db.getRulesByGroup(groupId);

            expect(rules).toHaveLength(0);
        });

        test('bulkCreateRules adds multiple rules', () => {
            const count = db.bulkCreateRules(groupId, 'whitelist', [
                'site1.com',
                'site2.com',
                'site3.com'
            ]);

            expect(count).toBe(3);
            expect(db.getRulesByGroup(groupId)).toHaveLength(3);
        });

        test('bulkCreateRules skips duplicates', () => {
            db.createRule(groupId, 'whitelist', 'existing.com');
            const count = db.bulkCreateRules(groupId, 'whitelist', [
                'existing.com',
                'new1.com',
                'new2.com'
            ]);

            expect(count).toBe(2);
            expect(db.getRulesByGroup(groupId)).toHaveLength(3);
        });
    });

    describe('Authentication', () => {
        test('validateUser returns user for valid credentials', () => {
            // Default admin user with password admin123
            const user = db.validateUser('admin', 'admin123');

            expect(user).not.toBeNull();
            expect(user?.username).toBe('admin');
        });

        test('validateUser returns null for invalid password', () => {
            const user = db.validateUser('admin', 'wrong-password');
            expect(user).toBeNull();
        });

        test('validateUser returns null for non-existent user', () => {
            const user = db.validateUser('nonexistent', 'password');
            expect(user).toBeNull();
        });
    });

    describe('Stats', () => {
        test('getStats returns correct counts', () => {
            const groupId = db.createGroup('stats-test', 'Stats Test');
            db.createRule(groupId, 'whitelist', 'site1.com');
            db.createRule(groupId, 'whitelist', 'site2.com');
            db.createRule(groupId, 'blocked_subdomain', 'blocked.com');

            const stats = db.getStats();

            expect(stats.groupCount).toBe(1);
            expect(stats.whitelistCount).toBe(2);
            expect(stats.blockedCount).toBe(1);
        });
    });

    describe('System Status', () => {
        test('getSystemStatus returns correct status', () => {
            db.createGroup('status-test', 'Status Test');

            const status = db.getSystemStatus();

            expect(status.enabled).toBe(true);
            expect(status.totalGroups).toBe(1);
            expect(status.activeGroups).toBe(1);
            expect(status.pausedGroups).toBe(0);
        });

        test('toggleSystemStatus disables all groups', () => {
            db.createGroup('toggle-test', 'Toggle Test');

            const status = db.toggleSystemStatus(false);

            expect(status.activeGroups).toBe(0);
            expect(status.pausedGroups).toBe(1);
        });
    });
});
