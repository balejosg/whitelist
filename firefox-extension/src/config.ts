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

/**
 * Configuration for OpenPath Firefox Extension
 * 
 * Settings can be overridden via browser.storage.sync
 * Use the extension options page to configure.
 */

import { logger } from './lib/logger.js';

// We use global declarations because this file is loaded via manifest scripts
// and not bundled.

// Config interface is defined in types.d.ts

const DEFAULT_CONFIG: Config = {
    // Home server URL for domain requests API
    // Production API endpoint
    REQUEST_API_URL: 'https://openpath-api.duckdns.org',

    // Fallback API URLs (tried in order if primary fails)
    FALLBACK_API_URLS: [],

    // Timeout for API requests (in milliseconds)
    REQUEST_TIMEOUT: 10000,

    // Retry configuration
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,  // Initial delay in ms (doubles each retry)

    // Default group for requests (if not specified)
    DEFAULT_GROUP: 'informatica-3',

    // Enable/disable request feature
    ENABLE_REQUESTS: true,

    // Show detailed error messages
    DEBUG_MODE: false,

    // Native messaging retry config
    NATIVE_RETRY_ATTEMPTS: 2,
    NATIVE_RETRY_DELAY: 500,

    // Auto-inclusion settings
    AUTO_INCLUDE_ENABLED: true,

    // Shared secret for machine auto-registration
    // SECURITY: This MUST be configured via browser.storage.sync in production
    // Set via extension options page or programmatically before enabling auto-include
    // Default empty string disables auto-registration until properly configured
    SHARED_SECRET: ''
};

// Runtime config (merged with stored settings)

let CONFIG: Config = { ...DEFAULT_CONFIG };

/**
 * Load configuration from browser storage
 * @returns {Promise<Config>} Current configuration
 */

async function loadConfig(): Promise<Config> {
    try {
        if (typeof browser !== 'undefined') {
            const stored = await browser.storage.sync.get('config');
            if (stored.config) {
                CONFIG = { ...DEFAULT_CONFIG, ...(stored.config as Partial<Config>) };
            }
        }
    } catch (error) {
        logger.warn('[Config] Failed to load stored config', { error: error instanceof Error ? error.message : String(error) });
    }
    return CONFIG;
}

/**
 * Save configuration to browser storage
 * @param {Partial<Config>} newConfig - Configuration to save
 */

async function saveConfig(newConfig: Partial<Config>): Promise<void> {
    try {
        CONFIG = { ...DEFAULT_CONFIG, ...newConfig };
        if (typeof browser !== 'undefined') {
            await browser.storage.sync.set({ config: CONFIG });
        }
    } catch (error) {
        logger.error('[Config] Failed to save config', { error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}

/**
 * Get current API URL
 * @returns {string} Current API URL
 */
function getApiUrl(): string {
    return CONFIG.REQUEST_API_URL;
}

/**
 * Get all API URLs (primary + fallbacks)
 * @returns {string[]} List of API URLs to try
 */
function getAllApiUrls(): string[] {
    return [CONFIG.REQUEST_API_URL, ...CONFIG.FALLBACK_API_URLS].filter(Boolean);
}

// Window interface is extended in types.d.ts for type-safe global access

// Make config available globally
if (typeof window !== 'undefined') {
    window.OPENPATH_CONFIG = CONFIG;
    window.loadOpenPathConfig = loadConfig;
    window.saveOpenPathConfig = saveConfig;
    window.getApiUrl = getApiUrl;
    window.getAllApiUrls = getAllApiUrls;
}

