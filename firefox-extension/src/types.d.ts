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

declare const browser: any;
