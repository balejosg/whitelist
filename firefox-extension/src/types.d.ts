import { Browser } from 'webextension-polyfill';

declare global {
    const browser: Browser;

    interface Config {
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
        [key: string]: unknown;
    }

    // Extend Window interface for type-safe global config access
    // Config is set by config.ts which is loaded before popup.ts via manifest
    interface Window {
        OPENPATH_CONFIG?: Config;
        loadOpenPathConfig?: () => Promise<Config>;
        saveOpenPathConfig?: (c: Partial<Config>) => Promise<void>;
        getApiUrl?: () => string;
        getAllApiUrls?: () => string[];
    }
}

