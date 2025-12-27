/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

/**
 * Configuration for OpenPath Firefox Extension
 */

import { Browser } from 'webextension-polyfill';

// Declare global browser if not using webextension-polyfill import everywhere
declare const browser: Browser;

export interface OpenPathConfig {
    REQUEST_API_URL: string;
    FALLBACK_API_URLS: string[];
    REQUEST_TIMEOUT: number;
    RETRY_ATTEMPTS: number;
    RETRY_DELAY: number;
    DEFAULT_GROUP: string;
    ENABLE_REQUESTS: boolean;
    DEBUG_MODE: boolean;
    NATIVE_RETRY_ATTEMPTS: number;
    NATIVE_RETRY_DELAY: number;
    AUTO_INCLUDE_ENABLED: boolean;
    SHARED_SECRET: string;
}

export const DEFAULT_CONFIG: OpenPathConfig = {
    // Home server URL for domain requests API
    REQUEST_API_URL: 'https://openpath-api.duckdns.org',

    // Fallback API URLs
    FALLBACK_API_URLS: [],

    // Timeout for API requests (in milliseconds)
    REQUEST_TIMEOUT: 10000,

    // Retry configuration
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,

    // Default group for requests
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
    SHARED_SECRET: 'openpath-secret-2024'
};

// Runtime config
let CONFIG: OpenPathConfig = { ...DEFAULT_CONFIG };

/**
 * Load configuration from browser storage
 */
export async function loadConfig(): Promise<OpenPathConfig> {
    try {
        if (typeof browser !== 'undefined' && browser.storage) {
            const stored = await browser.storage.sync.get('config');
            if (stored.config) {
                CONFIG = { ...DEFAULT_CONFIG, ...(stored.config as Partial<OpenPathConfig>) };
            }
        }
    } catch (error) {
        console.warn('[Config] Failed to load stored config:', error);
    }
    return CONFIG;
}

/**
 * Save configuration to browser storage
 */
export async function saveConfig(newConfig: Partial<OpenPathConfig>): Promise<void> {
    try {
        CONFIG = { ...CONFIG, ...newConfig };
        if (typeof browser !== 'undefined' && browser.storage) {
            await browser.storage.sync.set({ config: CONFIG });
        }
    } catch (error) {
        console.error('[Config] Failed to save config:', error);
        throw error;
    }
}

/**
 * Get current API URL
 */
export function getApiUrl(): string {
    return CONFIG.REQUEST_API_URL;
}

/**
 * Get all API URLs (primary + fallbacks)
 */
export function getAllApiUrls(): string[] {
    return [CONFIG.REQUEST_API_URL, ...CONFIG.FALLBACK_API_URLS].filter(Boolean);
}
