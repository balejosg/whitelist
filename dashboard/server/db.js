/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const EXPORT_DIR = path.join(DATA_DIR, 'export');

// Asegurar directorios
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// Estructura inicial de la BD
const defaultDb = {
    users: [{ id: 1, username: 'admin', password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10) }],
    groups: [],
    rules: [],
    nextGroupId: 1,
    nextRuleId: 1
};

// Cargar o crear BD
function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading db:', e);
    }
    return { ...defaultDb };
}

function saveDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDb();

// ============== Groups ==============

function getAllGroups() {
    return db.groups.map(g => ({
        ...g,
        whitelist_count: db.rules.filter(r => r.group_id === g.id && r.type === 'whitelist').length,
        blocked_subdomain_count: db.rules.filter(r => r.group_id === g.id && r.type === 'blocked_subdomain').length,
        blocked_path_count: db.rules.filter(r => r.group_id === g.id && r.type === 'blocked_path').length
    }));
}

function getGroupById(id) {
    return db.groups.find(g => g.id === parseInt(id));
}

function getGroupByName(name) {
    return db.groups.find(g => g.name === name);
}

function createGroup(name, displayName) {
    if (db.groups.find(g => g.name === name)) {
        throw { code: 'SQLITE_CONSTRAINT_UNIQUE' };
    }
    const group = {
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

function updateGroup(id, displayName, enabled) {
    const group = getGroupById(id);
    if (group) {
        group.display_name = displayName;
        group.enabled = enabled ? 1 : 0;
        group.updated_at = new Date().toISOString();
        saveDb(db);
    }
}

function deleteGroup(id) {
    const idx = db.groups.findIndex(g => g.id === parseInt(id));
    if (idx !== -1) {
        db.groups.splice(idx, 1);
        db.rules = db.rules.filter(r => r.group_id !== parseInt(id));
        saveDb(db);
    }
}

// ============== Rules ==============

function getRulesByGroup(groupId, type = null) {
    let rules = db.rules.filter(r => r.group_id === parseInt(groupId));
    if (type) rules = rules.filter(r => r.type === type);
    return rules.sort((a, b) => a.value.localeCompare(b.value));
}

function createRule(groupId, type, value, comment = null) {
    const normalizedValue = value.toLowerCase().trim();
    const exists = db.rules.find(r =>
        r.group_id === parseInt(groupId) &&
        r.type === type &&
        r.value === normalizedValue
    );
    if (exists) {
        return { success: false, error: 'La regla ya existe' };
    }
    const rule = {
        id: db.nextRuleId++,
        group_id: parseInt(groupId),
        type,
        value: normalizedValue,
        comment,
        created_at: new Date().toISOString()
    };
    db.rules.push(rule);
    saveDb(db);
    return { success: true, id: rule.id };
}

function deleteRule(id) {
    const idx = db.rules.findIndex(r => r.id === parseInt(id));
    if (idx !== -1) {
        db.rules.splice(idx, 1);
        saveDb(db);
    }
}

function bulkCreateRules(groupId, type, values) {
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

// ============== Auth ==============

function validateUser(username, password) {
    const user = db.users.find(u => u.username === username);
    if (!user) return null;
    if (bcrypt.compareSync(password, user.password_hash)) {
        return { id: user.id, username: user.username };
    }
    return null;
}

function changePassword(userId, newPassword) {
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.password_hash = bcrypt.hashSync(newPassword, 10);
        saveDb(db);
    }
}

// ============== Export ==============

function exportGroupToFile(groupId) {
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
        whitelist.forEach(r => content += r.value + '\n');
        content += '\n';
    }

    const blockedSub = rules.filter(r => r.type === 'blocked_subdomain');
    if (blockedSub.length > 0) {
        content += '## BLOCKED-SUBDOMAINS\n';
        blockedSub.forEach(r => content += r.value + '\n');
        content += '\n';
    }

    const blockedPath = rules.filter(r => r.type === 'blocked_path');
    if (blockedPath.length > 0) {
        content += '## BLOCKED-PATHS\n';
        blockedPath.forEach(r => content += r.value + '\n');
        content += '\n';
    }

    const filePath = path.join(EXPORT_DIR, `${group.name}.txt`);
    fs.writeFileSync(filePath, content.trim() + '\n');
    return filePath;
}

function exportAllGroups() {
    db.groups.forEach(g => exportGroupToFile(g.id));
}

// ============== Stats ==============

function getStats() {
    return {
        groupCount: db.groups.length,
        whitelistCount: db.rules.filter(r => r.type === 'whitelist').length,
        blockedCount: db.rules.filter(r => r.type === 'blocked_subdomain' || r.type === 'blocked_path').length
    };
}

// ============== System Status ==============

function getSystemStatus() {
    // System is active if at least one group is enabled
    const hasEnabledGroups = db.groups.some(g => g.enabled === 1);
    return {
        enabled: hasEnabledGroups,
        totalGroups: db.groups.length,
        activeGroups: db.groups.filter(g => g.enabled === 1).length,
        pausedGroups: db.groups.filter(g => g.enabled === 0).length
    };
}

function toggleSystemStatus(enable) {
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

module.exports = {
    getAllGroups,
    getGroupById,
    getGroupByName,
    createGroup,
    updateGroup,
    deleteGroup,
    getRulesByGroup,
    createRule,
    deleteRule,
    bulkCreateRules,
    validateUser,
    changePassword,
    exportGroupToFile,
    exportAllGroups,
    getStats,
    getSystemStatus,
    toggleSystemStatus,
    EXPORT_DIR
};
