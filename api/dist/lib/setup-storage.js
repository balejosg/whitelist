/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Storage - Manages first-time setup configuration
 * Stores setup data in data/setup.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// =============================================================================
// Constants
// =============================================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETUP_FILE = path.join(DATA_DIR, 'setup.json');
// =============================================================================
// Initialization
// =============================================================================
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// =============================================================================
// Public API
// =============================================================================
/**
 * Get setup configuration data
 * @returns SetupData if setup has been completed, null otherwise
 */
export function getSetupData() {
    if (!fs.existsSync(SETUP_FILE)) {
        return null;
    }
    try {
        const data = fs.readFileSync(SETUP_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error loading setup data:', error);
        return null;
    }
}
/**
 * Save setup configuration data
 */
export function saveSetupData(data) {
    fs.writeFileSync(SETUP_FILE, JSON.stringify(data, null, 2));
}
/**
 * Check if initial setup has been completed
 */
export function isSetupComplete() {
    return getSetupData() !== null;
}
/**
 * Get the current registration token
 * @returns Token string if setup is complete, null otherwise
 */
export function getRegistrationToken() {
    const data = getSetupData();
    return data?.registrationToken ?? null;
}
/**
 * Generate a new registration token
 * @returns The new 64-character hex token
 */
export function generateRegistrationToken() {
    return crypto.randomBytes(32).toString('hex');
}
/**
 * Regenerate the registration token and save it
 * @returns The new registration token, or null if setup not complete
 */
export function regenerateRegistrationToken() {
    const data = getSetupData();
    if (data === null) {
        return null;
    }
    const newToken = generateRegistrationToken();
    data.registrationToken = newToken;
    saveSetupData(data);
    return newToken;
}
/**
 * Validate a registration token using timing-safe comparison
 * @param token Token to validate
 * @returns true if token matches, false otherwise
 */
export function validateRegistrationToken(token) {
    const storedToken = getRegistrationToken();
    if (storedToken === null || token === '') {
        return false;
    }
    try {
        const tokenBuffer = Buffer.from(token, 'utf-8');
        const storedBuffer = Buffer.from(storedToken, 'utf-8');
        // Ensure buffers are same length for timing-safe comparison
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