/**
 * Dashboard Database Module Tests (Node.js native test runner)
 * Tests for db.ts functions using PostgreSQL
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as db from '../src/db.js';

await describe('Database Module', async () => {
    before(async () => {
        // Reset database to clean state
        await db.resetDb();
    });

    beforeEach(async () => {
        // Clean rules and groups before each test
        const groups = await db.getAllGroups();
        for (const g of groups) {
            await db.deleteGroup(g.id);
        }
    });

    after(async () => {
        // Final cleanup
        await db.resetDb();
    });

    await describe('Group Operations', async () => {
        await it('getAllGroups returns empty array initially', async () => {
            const groups = await db.getAllGroups();
            assert.ok(Array.isArray(groups));
        });

        await it('createGroup creates a new group and returns its ID', async () => {
            const groupId = await db.createGroup('test-group', 'Test Group');
            assert.ok(typeof groupId === 'string');
            assert.ok(groupId.length > 0);
        });

        await it('getGroupById retrieves created group', async () => {
            const groupId = await db.createGroup('my-group', 'My Group');
            const group = await db.getGroupById(groupId);

            assert.ok(group);
            assert.strictEqual(group.name, 'my-group');
            assert.strictEqual(group.display_name, 'My Group');
            assert.strictEqual(group.enabled, 1);
        });

        await it('getGroupByName retrieves group by name', async () => {
            await db.createGroup('named-group', 'Named Group');
            const group = await db.getGroupByName('named-group');

            assert.ok(group);
            assert.strictEqual(group.display_name, 'Named Group');
        });

        await it('createGroup throws on duplicate name', async () => {
            await db.createGroup('unique-group', 'Unique Group');

            await assert.rejects(async () => {
                await db.createGroup('unique-group', 'Another Display Name');
            }, /SQLITE_CONSTRAINT_UNIQUE/);
        });

        await it('updateGroup modifies group properties', async () => {
            const groupId = await db.createGroup('update-test', 'Original Name');
            await db.updateGroup(groupId, 'Updated Name', false);

            const group = await db.getGroupById(groupId);
            assert.ok(group);
            assert.strictEqual(group.display_name, 'Updated Name');
            assert.strictEqual(group.enabled, 0);
        });

        await it('deleteGroup removes group and its rules', async () => {
            const groupId = await db.createGroup('delete-test', 'Delete Test');
            await db.createRule(groupId, 'whitelist', 'example.com');

            await db.deleteGroup(groupId);

            const group = await db.getGroupById(groupId);
            assert.strictEqual(group, undefined);

            const rules = await db.getRulesByGroup(groupId);
            assert.strictEqual(rules.length, 0);
        });
    });

    await describe('Rule Operations', async () => {
        let groupId: string;

        beforeEach(async () => {
            // Clean and create fresh group
            const groups = await db.getAllGroups();
            for (const g of groups) {
                await db.deleteGroup(g.id);
            }
            groupId = await db.createGroup('rule-test-group', 'Rule Test Group');
        });

        await it('createRule adds a new rule', async () => {
            const result = await db.createRule(groupId, 'whitelist', 'example.com');

            assert.strictEqual(result.success, true);
            assert.ok(result.id);
        });

        await it('createRule normalizes domain to lowercase', async () => {
            await db.createRule(groupId, 'whitelist', 'EXAMPLE.COM');
            const rules = await db.getRulesByGroup(groupId);

            assert.strictEqual(rules[0]?.value, 'example.com');
        });

        await it('createRule prevents duplicate rules', async () => {
            await db.createRule(groupId, 'whitelist', 'duplicate.com');
            const result = await db.createRule(groupId, 'whitelist', 'duplicate.com');

            assert.strictEqual(result.success, false);
            assert.ok(result.error);
        });

        await it('getRulesByGroup filters by type', async () => {
            await db.createRule(groupId, 'whitelist', 'allowed.com');
            await db.createRule(groupId, 'blocked_subdomain', 'blocked.example.com');

            const whitelistRules = await db.getRulesByGroup(groupId, 'whitelist');
            const blockedRules = await db.getRulesByGroup(groupId, 'blocked_subdomain');

            assert.strictEqual(whitelistRules.length, 1);
            assert.strictEqual(whitelistRules[0]?.value, 'allowed.com');
            assert.strictEqual(blockedRules.length, 1);
            assert.strictEqual(blockedRules[0]?.value, 'blocked.example.com');
        });

        await it('deleteRule removes a specific rule', async () => {
            const result = await db.createRule(groupId, 'whitelist', 'to-delete.com');
            assert.ok(result.id);

            await db.deleteRule(result.id);
            const rules = await db.getRulesByGroup(groupId);

            assert.strictEqual(rules.length, 0);
        });

        await it('bulkCreateRules adds multiple rules', async () => {
            const count = await db.bulkCreateRules(groupId, 'whitelist', [
                'site1.com',
                'site2.com',
                'site3.com'
            ]);

            assert.strictEqual(count, 3);
            const rules = await db.getRulesByGroup(groupId);
            assert.strictEqual(rules.length, 3);
        });

        await it('bulkCreateRules skips duplicates', async () => {
            await db.createRule(groupId, 'whitelist', 'existing.com');
            const count = await db.bulkCreateRules(groupId, 'whitelist', [
                'existing.com',
                'new1.com',
                'new2.com'
            ]);

            assert.strictEqual(count, 2);
            const rules = await db.getRulesByGroup(groupId);
            assert.strictEqual(rules.length, 3);
        });
    });

    await describe('Authentication', async () => {
        await it('validateUser returns user for valid credentials', async () => {
            // Default admin user with password admin123
            const user = await db.validateUser('admin', 'admin123');

            assert.ok(user);
            assert.strictEqual(user.username, 'admin');
        });

        await it('validateUser returns null for invalid password', async () => {
            const user = await db.validateUser('admin', 'wrong-password');
            assert.strictEqual(user, null);
        });

        await it('validateUser returns null for non-existent user', async () => {
            const user = await db.validateUser('nonexistent', 'password');
            assert.strictEqual(user, null);
        });
    });

    await describe('Stats', async () => {
        await it('getStats returns correct counts', async () => {
            const groupId = await db.createGroup('stats-test', 'Stats Test');
            await db.createRule(groupId, 'whitelist', 'site1.com');
            await db.createRule(groupId, 'whitelist', 'site2.com');
            await db.createRule(groupId, 'blocked_subdomain', 'blocked.com');

            const stats = await db.getStats();

            assert.strictEqual(stats.groupCount, 1);
            assert.strictEqual(stats.whitelistCount, 2);
            assert.strictEqual(stats.blockedCount, 1);
        });
    });

    await describe('System Status', async () => {
        await it('getSystemStatus returns correct status', async () => {
            await db.createGroup('status-test', 'Status Test');

            const status = await db.getSystemStatus();

            assert.strictEqual(status.enabled, true);
            assert.strictEqual(status.totalGroups, 1);
            assert.strictEqual(status.activeGroups, 1);
            assert.strictEqual(status.pausedGroups, 0);
        });

        await it('toggleSystemStatus disables all groups', async () => {
            await db.createGroup('toggle-test', 'Toggle Test');

            const status = await db.toggleSystemStatus(false);

            assert.strictEqual(status.activeGroups, 0);
            assert.strictEqual(status.pausedGroups, 1);
        });
    });
});
