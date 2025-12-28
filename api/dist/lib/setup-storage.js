/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Storage - PostgreSQL-backed setup configuration
 */
import crypto from 'node:crypto';
import { query } from './db.js';
// =============================================================================
// Public API
// =============================================================================
export async function getSetupData() {
    const result = await query(`SELECT key, value FROM settings 
         WHERE key IN ('registration_token', 'setup_completed_at', 'setup_by_user_id')`);
    if (result.rows.length === 0) {
        return null;
    }
    const data = {};
    result.rows.forEach((row) => {
        data[row.key] = row.value;
    });
    if (!data.registration_token) {
        return null;
    }
    return {
        registrationToken: data.registration_token,
        setupCompletedAt: data.setup_completed_at ?? new Date().toISOString(),
        setupByUserId: data.setup_by_user_id ?? 'unknown'
    };
}
export async function saveSetupData(data) {
    await query(`INSERT INTO settings (key, value) VALUES ('registration_token', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [data.registrationToken]);
    await query(`INSERT INTO settings (key, value) VALUES ('setup_completed_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [data.setupCompletedAt]);
    await query(`INSERT INTO settings (key, value) VALUES ('setup_by_user_id', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [data.setupByUserId]);
}
export async function isSetupComplete() {
    const data = await getSetupData();
    return data !== null;
}
export async function getRegistrationToken() {
    const data = await getSetupData();
    return data?.registrationToken ?? null;
}
/**
 * Generate a new registration token
 */
export function generateRegistrationToken() {
    return crypto.randomBytes(32).toString('hex');
}
export async function regenerateRegistrationToken() {
    const data = await getSetupData();
    if (data === null) {
        return null;
    }
    const newToken = generateRegistrationToken();
    data.registrationToken = newToken;
    await saveSetupData(data);
    return newToken;
}
export async function validateRegistrationToken(token) {
    const storedToken = await getRegistrationToken();
    if (storedToken === null || token === '') {
        return false;
    }
    try {
        const tokenBuffer = Buffer.from(token, 'utf-8');
        const storedBuffer = Buffer.from(storedToken, 'utf-8');
        if (tokenBuffer.length !== storedBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(tokenBuffer, storedBuffer);
    }
    catch {
        return false;
    }
}
export default {
    getSetupData,
    saveSetupData,
    isSetupComplete,
    getRegistrationToken,
    generateRegistrationToken,
    regenerateRegistrationToken,
    validateRegistrationToken
};
//# sourceMappingURL=setup-storage.js.map