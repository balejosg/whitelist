/**
 * Configuration for OpenPath Firefox Extension
 * 
 * Settings can be overridden via browser.storage.sync
 * Use the extension options page to configure.
 */

const DEFAULT_CONFIG = {
    // Home server URL for domain requests API
    // Change this to your DuckDNS domain when deployed
    // Example: 'https://openpath-requests.duckdns.org'
    REQUEST_API_URL: 'http://localhost:3000',

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
    SHARED_SECRET: 'openpath-secret-2024'  // Change in production
};

// Runtime config (merged with stored settings)
let CONFIG = { ...DEFAULT_CONFIG };

/**
 * Load configuration from browser storage
 * @returns {Promise<Object>} Current configuration
 */
async function loadConfig() {
    try {
        if (typeof browser !== 'undefined' && browser.storage) {
            const stored = await browser.storage.sync.get('config');
            if (stored.config) {
                CONFIG = { ...DEFAULT_CONFIG, ...stored.config };
            }
        }
    } catch (error) {
        console.warn('[Config] Failed to load stored config:', error);
    }
    return CONFIG;
}

/**
 * Save configuration to browser storage
 * @param {Object} newConfig - Configuration to save
 */
async function saveConfig(newConfig) {
    try {
        CONFIG = { ...DEFAULT_CONFIG, ...newConfig };
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
 * @returns {string} Current API URL
 */
function getApiUrl() {
    return CONFIG.REQUEST_API_URL;
}

/**
 * Get all API URLs (primary + fallbacks)
 * @returns {string[]} List of API URLs to try
 */
function getAllApiUrls() {
    return [CONFIG.REQUEST_API_URL, ...CONFIG.FALLBACK_API_URLS].filter(Boolean);
}

// Make config available globally
if (typeof window !== 'undefined') {
    window.OPENPATH_CONFIG = CONFIG;
    window.loadOpenPathConfig = loadConfig;
    window.saveOpenPathConfig = saveConfig;
}

if (typeof self !== 'undefined') {
    self.OPENPATH_CONFIG = CONFIG;
    self.loadOpenPathConfig = loadConfig;
    self.saveOpenPathConfig = saveConfig;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        DEFAULT_CONFIG,
        loadConfig,
        saveConfig,
        getApiUrl,
        getAllApiUrls
    };
}

