/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup Storage - JSON file-based setup configuration
 * Stores initial setup data and registration tokens
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
// Types
// =============================================================================

export interface SetupData {
    registrationToken: string;
    setupCompletedAt: string;
    setupByUserId: string;
}

// =============================================================================
// Initialization
// =============================================================================

// Ensure data directory exists
if (fs.existsSync(DATA_DIR) === false) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get setup data from file
 * @returns SetupData or null if setup not completed
 */
export function getSetupData(): SetupData | null {
    try {
        if (fs.existsSync(SETUP_FILE) === false) {
            return null;
        }
        const data = fs.readFileSync(SETUP_FILE, 'utf-8');
        return JSON.parse(data) as SetupData;
    } catch (error) {
        console.error('Error loading setup data:', error);
        return null;
    }
}

/**
 * Save setup data to file
 * @param data Setup configuration to save
 */
export function saveSetupData(data: SetupData): void {
    fs.writeFileSync(SETUP_FILE, JSON.stringify(data, null, 2));
}

/**
 * Check if initial setup is complete
 * @returns true if setup has been completed
 */
export function isSetupComplete(): boolean {
    return getSetupData() !== null;
}

/**
 * Get the current registration token
 * @returns Registration token or null if setup not complete
 */
export function getRegistrationToken(): string | null {
    const data = getSetupData();
    return data ? data.registrationToken : null;
}

/**
 * Generate a new registration token and save it
 * @returns The new registration token
 */
export function regenerateRegistrationToken(): string {
    const data = getSetupData();
    if (data === null) {
        throw new Error('Setup not complete - cannot regenerate token');
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    data.registrationToken = newToken;
    saveSetupData(data);

    return newToken;
}
