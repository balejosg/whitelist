import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface User {
    id: number;
    username: string;
    password_hash?: string;
    role?: string;
}

export interface Group {
    id: number;
    name: string;
    display_name: string;
    enabled: number; // 0 or 1
    created_at: string;
    updated_at?: string;
    // Computed properties for API responses
    whitelist_count?: number;
    blocked_subdomain_count?: number;
    blocked_path_count?: number;
}

export interface Rule {
    id: number;
    group_id: number;
    type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
    value: string;
    comment?: string | null;
    created_at: string;
}

export interface DatabaseSchema {
    users: User[];
    groups: Group[];
    rules: Rule[];
    nextGroupId: number;
    nextRuleId: number;
}

export const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../data');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const EXPORT_DIR = path.join(DATA_DIR, 'export');

// Asegurar directorios
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const defaultDb: DatabaseSchema = {
    users: [{ id: 1, username: 'admin', password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD ?? 'admin123', 10) }],
    groups: [],
    rules: [],
    nextGroupId: 1,
    nextRuleId: 1
};

function loadDb(): DatabaseSchema {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf-8');
            return JSON.parse(data) as DatabaseSchema;
        }
    } catch (e) {
        console.error('Error loading db:', e);
    }
    return JSON.parse(JSON.stringify(defaultDb)) as DatabaseSchema;
}

function saveDb(data: DatabaseSchema): void {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Keep db in memory as per original implementation
let db = loadDb();

export function reloadDb(): void {
    db = loadDb();
}

// Reset database to default state (for testing)
export function resetDb(): void {
    db = JSON.parse(JSON.stringify(defaultDb)) as DatabaseSchema;
    // Clear any persisted file
    if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
    }
}

// ============================================================================
// Groups
// ============================================================================

export function getAllGroups(): Group[] {
    return db.groups.map(g => ({
        ...g,
        whitelist_count: db.rules.filter(r => r.group_id === g.id && r.type === 'whitelist').length,
        blocked_subdomain_count: db.rules.filter(r => r.group_id === g.id && r.type === 'blocked_subdomain').length,
        blocked_path_count: db.rules.filter(r => r.group_id === g.id && r.type === 'blocked_path').length
    }));
}

export function getGroupById(id: string | number): Group | undefined {
    return db.groups.find(g => g.id === (typeof id === 'string' ? parseInt(id, 10) : id));
}

export function getGroupByName(name: string): Group | undefined {
    return db.groups.find(g => g.name === name);
}

export function createGroup(name: string, displayName: string): number {
    if (db.groups.find(g => g.name === name)) {
        throw new Error('SQLITE_CONSTRAINT_UNIQUE');
    }
    const group: Group = {
        id: db.nextGroupId++,
        name,
        display_name: displayName,
        enabled: 1,
        created_at: new Date().toISOString()
    };
    db.groups.push(group);
    saveDb(db);
    return group.id;
}

export function updateGroup(id: string | number, displayName: string, enabled: boolean): void {
    const group = getGroupById(id);
    if (group) {
        group.display_name = displayName;
        group.enabled = enabled ? 1 : 0;
        group.updated_at = new Date().toISOString();
        saveDb(db);
    }
}

export function deleteGroup(id: string | number): void {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const idx = db.groups.findIndex(g => g.id === numericId);
    if (idx !== -1) {
        db.groups.splice(idx, 1);
        db.rules = db.rules.filter(r => r.group_id !== numericId);
        saveDb(db);
    }
}

// ============================================================================
// Rules
// ============================================================================

export function getRulesByGroup(groupId: string | number, type: Rule['type'] | null = null): Rule[] {
    const numericGroupId = typeof groupId === 'string' ? parseInt(groupId, 10) : groupId;
    let rules = db.rules.filter(r => r.group_id === numericGroupId);
    if (type) rules = rules.filter(r => r.type === type);
    return rules.sort((a, b) => a.value.localeCompare(b.value));
}

export function createRule(groupId: string | number, type: Rule['type'], value: string, comment: string | null = null): { success: boolean; id?: number; error?: string } {
    const numericGroupId = typeof groupId === 'string' ? parseInt(groupId, 10) : groupId;
    const normalizedValue = value.toLowerCase().trim();

    const exists = db.rules.find(r =>
        r.group_id === numericGroupId &&
        r.type === type &&
        r.value === normalizedValue
    );

    if (exists) {
        return { success: false, error: 'La regla ya existe' };
    }

    const rule: Rule = {
        id: db.nextRuleId++,
        group_id: numericGroupId,
        type,
        value: normalizedValue,
        comment,
        created_at: new Date().toISOString()
    };
    db.rules.push(rule);
    saveDb(db);
    return { success: true, id: rule.id };
}

export function deleteRule(id: string | number): void {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const idx = db.rules.findIndex(r => r.id === numericId);
    if (idx !== -1) {
        db.rules.splice(idx, 1);
        saveDb(db);
    }
}

export function bulkCreateRules(groupId: string | number, type: Rule['type'], values: string[]): number {
    let count = 0;
    for (const value of values) {
        const trimmed = value.toLowerCase().trim();
        if (trimmed) {
            const result = createRule(groupId, type, trimmed);
            if (result.success) count++;
        }
    }
    return count;
}

// ============================================================================
// Auth
// ============================================================================

export function validateUser(username: string, password: string): { id: number; username: string } | null {
    const user = db.users.find(u => u.username === username);
    if (!user) return null;
    if (!user.password_hash) return null;
    if (bcrypt.compareSync(password, user.password_hash)) {
        return { id: user.id, username: user.username };
    }
    return null;
}

export function changePassword(userId: number, newPassword: string): void {
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.password_hash = bcrypt.hashSync(newPassword, 10);
        saveDb(db);
    }
}

// ============================================================================
// Export
// ============================================================================

export function exportGroupToFile(groupId: string | number): string | null {
    const group = getGroupById(groupId);
    if (!group) return null;

    const rules = getRulesByGroup(groupId);
    let content = '';

    if (!group.enabled) {
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

export function exportAllGroups(): void {
    db.groups.forEach(g => exportGroupToFile(g.id));
}

// ============================================================================
// Stats
// ============================================================================

export function getStats(): { groupCount: number; whitelistCount: number; blockedCount: number } {
    return {
        groupCount: db.groups.length,
        whitelistCount: db.rules.filter(r => r.type === 'whitelist').length,
        blockedCount: db.rules.filter(r => r.type === 'blocked_subdomain' || r.type === 'blocked_path').length
    };
}

// ============================================================================
// System Status
// ============================================================================

export function getSystemStatus(): { enabled: boolean; totalGroups: number; activeGroups: number; pausedGroups: number } {
    // System is active if at least one group is enabled
    const hasEnabledGroups = db.groups.some(g => g.enabled === 1);
    return {
        enabled: hasEnabledGroups,
        totalGroups: db.groups.length,
        activeGroups: db.groups.filter(g => g.enabled === 1).length,
        pausedGroups: db.groups.filter(g => g.enabled === 0).length
    };
}

export function toggleSystemStatus(enable: boolean): ReturnType<typeof getSystemStatus> {
    const newStatus = enable ? 1 : 0;
    db.groups.forEach(g => {
        g.enabled = newStatus;
        g.updated_at = new Date().toISOString();
    });
    saveDb(db);
    // Re-export all groups with new status
    db.groups.forEach(g => exportGroupToFile(g.id));
    return getSystemStatus();
}

// Helpers for index.ts to access db directly if needed
export function getDbInstance(): DatabaseSchema {
    return db;
}
