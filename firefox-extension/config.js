/**
 * Configuration for Whitelist Firefox Extension
 * 
 * Edit this file to set your home server URL and other settings.
 */

const CONFIG = {
    // Home server URL for domain requests API
    // Change this to your DuckDNS domain when deployed
    // Example: 'https://whitelist-requests.duckdns.org'
    REQUEST_API_URL: 'http://localhost:3000',
    
    // Timeout for API requests (in milliseconds)
    REQUEST_TIMEOUT: 10000,
    
    // Default group for requests (if not specified)
    DEFAULT_GROUP: 'informatica-3',
    
    // Enable/disable request feature
    ENABLE_REQUESTS: true,
    
    // Show detailed error messages
    DEBUG_MODE: false
};

// Make config available to other scripts
if (typeof window !== 'undefined') {
    window.WHITELIST_CONFIG = CONFIG;
}

// For use in background script
if (typeof self !== 'undefined') {
    self.WHITELIST_CONFIG = CONFIG;
}
