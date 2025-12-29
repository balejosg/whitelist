/**
 * OpenPath Dashboard - Database Module
 * PostgreSQL + Drizzle ORM implementation (migrated from JSON file storage)
 */

import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import pg from 'pg';
import {
    whitelistGroups,
    whitelistRules,
    dashboardUsers,
    type WhitelistGroup,
    type WhitelistRule,
} from '@openpath/api';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Legacy export directory (for whitelist file exports)
export const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../data');
export const EXPORT_DIR = path.join(DATA_DIR, 'export');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// =============================================================================
// Database Connection
// =============================================================================

const connectionString = process.env.DATABASE_URL ?? 'postgresql://openpath:openpath@localhost:5432/openpath';
const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool);

// =============================================================================
// Type Definitions (backward compatible with legacy JSON storage)
// =============================================================================

export interface User {
    id: string;
    username: string;
    passwordHash?: string;
    role?: string | null;
}

export interface Group {
    id: string;
    name: string;
    displayName: string;
    enabled: number; // 0 or 1 for backward compat
    createdAt: string;
    updatedAt?: string | null;
    // Computed properties
    whitelistCount?: number;
    blockedSubdomainCount?: number;
    blockedPathCount?: number;
}

export interface Rule {
    id: string;
    groupId: string;
    type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
    value: string;
    comment?: string | null;
    createdAt: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function dbGroupToLegacy(g: WhitelistGroup): Omit<Group, 'whitelistCount' | 'blockedSubdomainCount' | 'blockedPathCount'> {
    return {
        id: g.id,
        name: g.name,
        displayName: g.displayName,
        enabled: g.enabled,
        createdAt: g.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: g.updatedAt?.toISOString() ?? null,
    };
}

function dbRuleToLegacy(r: WhitelistRule): Rule {
    return {
        id: r.id,
        groupId: r.groupId,
        type: r.type as Rule['type'],
        value: r.value,
        comment: r.comment,
        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    };
}

// =============================================================================
// Groups
// =============================================================================

export async function getAllGroups(): Promise<Group[]> {
    const groups = await db.select().from(whitelistGroups);
    const rules = await db.select().from(whitelistRules);

    return groups.map(g => {
        const groupRules = rules.filter(r => r.groupId === g.id);
        return {
            ...dbGroupToLegacy(g),
            whitelistCount: groupRules.filter(r => r.type === 'whitelist').length,
            blockedSubdomainCount: groupRules.filter(r => r.type === 'blocked_subdomain').length,
            blockedPathCount: groupRules.filter(r => r.type === 'blocked_path').length,
        };
    });
}

export async function getGroupById(id: string | number): Promise<Group | undefined> {
    const stringId = String(id);
    const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.id, stringId));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!group) return undefined;

    const rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, stringId));
    return {
        ...dbGroupToLegacy(group),
        whitelistCount: rules.filter(r => r.type === 'whitelist').length,
        blockedSubdomainCount: rules.filter(r => r.type === 'blocked_subdomain').length,
        blockedPathCount: rules.filter(r => r.type === 'blocked_path').length,
    };
}

export async function getGroupByName(name: string): Promise<Group | undefined> {
    const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.name, name));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!group) return undefined;
    return dbGroupToLegacy(group) as Group;
}

export async function createGroup(name: string, displayName: string): Promise<string> {
    const existing = await getGroupByName(name);
    if (existing) {
        throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
    }

    const id = uuidv4();
    await db.insert(whitelistGroups).values({
        id,
        name,
        displayName,
        enabled: 1,
    });

    return id;
}

export async function updateGroup(id: string | number, displayName: string, enabled: boolean): Promise<void> {
    const stringId = String(id);
    await db.update(whitelistGroups)
        .set({
            displayName,
            enabled: enabled ? 1 : 0,
            updatedAt: new Date(),
        })
        .where(eq(whitelistGroups.id, stringId));
}

export async function deleteGroup(id: string | number): Promise<void> {
    const stringId = String(id);
    // Rules are deleted by cascade
    await db.delete(whitelistGroups).where(eq(whitelistGroups.id, stringId));
}

// =============================================================================
// Rules
// =============================================================================

export async function getRulesByGroup(groupId: string | number, type: Rule['type'] | null = null): Promise<Rule[]> {
    const stringGroupId = String(groupId);

    let rules: WhitelistRule[];
    if (type) {
        rules = await db.select().from(whitelistRules)
            .where(and(
                eq(whitelistRules.groupId, stringGroupId),
                eq(whitelistRules.type, type)
            ));
    } else {
        rules = await db.select().from(whitelistRules)
            .where(eq(whitelistRules.groupId, stringGroupId));
    }

    return rules
        .map(dbRuleToLegacy)
        .sort((a, b) => a.value.localeCompare(b.value));
}

export async function createRule(
    groupId: string | number,
    type: Rule['type'],
    value: string,
    comment: string | null = null
): Promise<{ success: boolean; id?: string; error?: string }> {
    const stringGroupId = String(groupId);
    const normalizedValue = value.toLowerCase().trim();

    // Check for existing
    const [existing] = await db.select().from(whitelistRules)
        .where(and(
            eq(whitelistRules.groupId, stringGroupId),
            eq(whitelistRules.type, type),
            eq(whitelistRules.value, normalizedValue)
        ));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (existing) {
        return { success: false, error: 'La regla ya existe' };
    }

    const id = uuidv4();
    await db.insert(whitelistRules).values({
        id,
        groupId: stringGroupId,
        type,
        value: normalizedValue,
        comment,
    });

    return { success: true, id };
}

export async function deleteRule(id: string | number): Promise<void> {
    const stringId = String(id);
    await db.delete(whitelistRules).where(eq(whitelistRules.id, stringId));
}

export async function bulkCreateRules(
    groupId: string | number,
    type: Rule['type'],
    values: string[]
): Promise<number> {
    let count = 0;
    for (const value of values) {
        const trimmed = value.toLowerCase().trim();
        if (trimmed) {
            const result = await createRule(groupId, type, trimmed);
            if (result.success) count++;
        }
    }
    return count;
}

// =============================================================================
// Auth
// =============================================================================

export async function validateUser(username: string, password: string): Promise<{ id: string; username: string } | null> {
    const [user] = await db.select().from(dashboardUsers).where(eq(dashboardUsers.username, username));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (isValid) {
        return { id: user.id, username: user.username };
    }
    return null;
}

export async function changePassword(userId: string | number, newPassword: string): Promise<void> {
    const stringId = String(userId);
    const hash = await bcrypt.hash(newPassword, 10);
    await db.update(dashboardUsers)
        .set({ passwordHash: hash, updatedAt: new Date() })
        .where(eq(dashboardUsers.id, stringId));
}

export async function ensureDefaultAdmin(): Promise<void> {
    const [existing] = await db.select().from(dashboardUsers).where(eq(dashboardUsers.username, 'admin'));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!existing) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'admin123', 10);
        await db.insert(dashboardUsers).values({
            id: uuidv4(),
            username: 'admin',
            passwordHash: hash,
            role: 'admin',
        }).onConflictDoNothing();
    }
}

// =============================================================================
// Export
// =============================================================================

export async function exportGroupToFile(groupId: string | number): Promise<string | null> {
    const group = await getGroupById(groupId);
    if (!group) return null;

    const rules = await getRulesByGroup(groupId);
    let content = '';

    if (group.enabled === 0) {
        content = '#DESACTIVADO\n\n';
    }

    const whitelist = rules.filter(r => r.type === 'whitelist');
    if (whitelist.length > 0) {
        content += '## WHITELIST\n';
        whitelist.forEach(r => content += `${r.value}\n`);
        content += '\n';
    }

    const blockedSub = rules.filter(r => r.type === 'blocked_subdomain');
    if (blockedSub.length > 0) {
        content += '## BLOCKED-SUBDOMAINS\n';
        blockedSub.forEach(r => content += `${r.value}\n`);
        content += '\n';
    }

    const blockedPath = rules.filter(r => r.type === 'blocked_path');
    if (blockedPath.length > 0) {
        content += '## BLOCKED-PATHS\n';
        blockedPath.forEach(r => content += `${r.value}\n`);
        content += '\n';
    }

    const filePath = path.join(EXPORT_DIR, `${group.name}.txt`);
    fs.writeFileSync(filePath, content.trim() + '\n');
    return filePath;
}

export async function exportAllGroups(): Promise<void> {
    const groups = await getAllGroups();
    for (const g of groups) {
        await exportGroupToFile(g.id);
    }
}

// =============================================================================
// Stats
// =============================================================================

export async function getStats(): Promise<{ groupCount: number; whitelistCount: number; blockedCount: number }> {
    const groups = await db.select().from(whitelistGroups);
    const rules = await db.select().from(whitelistRules);

    return {
        groupCount: groups.length,
        whitelistCount: rules.filter(r => r.type === 'whitelist').length,
        blockedCount: rules.filter(r => r.type === 'blocked_subdomain' || r.type === 'blocked_path').length,
    };
}

// =============================================================================
// System Status
// =============================================================================

export async function getSystemStatus(): Promise<{ enabled: boolean; totalGroups: number; activeGroups: number; pausedGroups: number }> {
    const groups = await db.select().from(whitelistGroups);
    const hasEnabledGroups = groups.some(g => g.enabled === 1);

    return {
        enabled: hasEnabledGroups,
        totalGroups: groups.length,
        activeGroups: groups.filter(g => g.enabled === 1).length,
        pausedGroups: groups.filter(g => g.enabled === 0).length,
    };
}

export async function toggleSystemStatus(enable: boolean): Promise<ReturnType<typeof getSystemStatus>> {
    const newStatus = enable ? 1 : 0;
    await db.update(whitelistGroups)
        .set({ enabled: newStatus, updatedAt: new Date() });

    // Re-export all groups
    await exportAllGroups();
    return getSystemStatus();
}

// =============================================================================
// Legacy Compatibility (for tests)
// =============================================================================

export async function waitForDb(retries = 30, delay = 1000): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            await db.execute(sql`SELECT 1`);
            return;
        } catch (error) {
            if (i === retries - 1) {
                console.error('Failed to connect to database after retries:', error);
                throw error;
            }
            console.log(`Waiting for database... (${String(i + 1)}/${String(retries)})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

export async function resetDb(): Promise<void> {
    await db.delete(whitelistRules);
    await db.delete(whitelistGroups);
    await db.delete(dashboardUsers);
    await ensureDefaultAdmin();
}

export function reloadDb(): void {
    // No-op in PostgreSQL version (connection is persistent)
}

// Type alias for backward compatibility
export interface DatabaseSchema {
    users: User[];
    groups: Group[];
    rules: Rule[];
    nextGroupId: number;
    nextRuleId: number;
}

export function getDbInstance(): null {
    // Legacy method - not applicable with PostgreSQL
    return null;
}

// Close pool on process exit
process.on('beforeExit', () => {
    void pool.end();
});
