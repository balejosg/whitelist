/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - Abstraction for token blacklist storage
 * Supports Memory and Redis backends
 */

import jwt from 'jsonwebtoken';
import type { ITokenStore } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

interface DecodedTokenBase {
    exp?: number;
}

interface TokenStore {
    add(token: string): Promise<boolean>;
    has(token: string): Promise<boolean>;
    delete(token: string): Promise<boolean>;
    size(): Promise<number>;
    cleanup(secret: string): Promise<void>;
    destroy(): void | Promise<void>;
}

// =============================================================================
// Memory Token Store (Default)
// =============================================================================

export class MemoryTokenStore implements TokenStore {
    private readonly blacklist: Set<string>;
    private cleanupInterval: ReturnType<typeof setInterval> | null;

    constructor() {
        this.blacklist = new Set();
        this.cleanupInterval = null;
        this._startCleanup();
    }

    async add(token: string): Promise<boolean> {
        this.blacklist.add(token);
        return true;
    }

    async has(token: string): Promise<boolean> {
        return this.blacklist.has(token);
    }

    async delete(token: string): Promise<boolean> {
        return this.blacklist.delete(token);
    }

    async size(): Promise<number> {
        return this.blacklist.size;
    }

    async cleanup(secret: string): Promise<void> {
        for (const token of this.blacklist) {
            try {
                jwt.verify(token, secret, { ignoreExpiration: false });
            } catch (error) {
                if (error instanceof Error && error.name === 'TokenExpiredError') {
                    this.blacklist.delete(token);
                }
            }
        }
    }

    private _startCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            // Cleanup will be triggered by auth.js with the secret
        }, 5 * 60 * 1000);
        this.cleanupInterval.unref();
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// =============================================================================
// Redis Token Store (Production)
// =============================================================================

interface RedisClient {
    on(event: string, callback: (arg?: unknown) => void): void;
    connect(): Promise<void>;
    setEx(key: string, ttl: number, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    quit(): Promise<void>;
}

export class RedisTokenStore implements TokenStore {
    private readonly redisUrl: string;
    private client: RedisClient | null;
    private connected: boolean;

    constructor(redisUrl: string) {
        this.redisUrl = redisUrl;
        this.client = null;
        this.connected = false;
        void this._connect();
    }

    private async _connect(): Promise<void> {
        try {
            // Dynamic import for optional redis dependency
            // @ts-expect-error - redis is an optional dependency
            const redis = await import('redis');
            this.client = redis.createClient({ url: this.redisUrl }) as unknown as RedisClient;

            this.client.on('error', (err: unknown) => {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error('Redis error:', message);
                this.connected = false;
            });

            this.client.on('connect', () => {
                console.log('✓ Redis connected for token storage');
                this.connected = true;
            });

            await this.client.connect();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn('⚠️ Redis not available, falling back to memory store:', message);
            this.connected = false;
        }
    }

    async add(token: string): Promise<boolean> {
        if (this.connected === false || this.client === undefined || this.client === null) {
            return false;
        }

        try {
            const decoded = jwt.decode(token) as DecodedTokenBase | null;
            const ttl = decoded?.exp !== undefined ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;

            if (ttl > 0) {
                await this.client.setEx(`blacklist:${token}`, ttl, '1');
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis add error:', message);
            return false;
        }
    }

    async has(token: string): Promise<boolean> {
        if (this.connected === false || this.client === undefined || this.client === null) {
            return false;
        }

        try {
            const result = await this.client.get(`blacklist:${token}`);
            return result !== null;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis has error:', message);
            return false;
        }
    }

    async delete(token: string): Promise<boolean> {
        if (this.connected === false || this.client === undefined || this.client === null) {
            return false;
        }

        try {
            await this.client.del(`blacklist:${token}`);
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis delete error:', message);
            return false;
        }
    }

    async size(): Promise<number> {
        if (this.connected === false || this.client === undefined || this.client === null) {
            return 0;
        }

        try {
            const keys = await this.client.keys('blacklist:*');
            return keys.length;
        } catch {
            return 0;
        }
    }

    async cleanup(): Promise<void> {
        // No-op: Redis handles expiration automatically via TTL
    }

    async destroy(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
    }
}

// =============================================================================
// Factory Function
// =============================================================================

let _instance: TokenStore | null = null;

export function getTokenStore(): TokenStore {
    if (_instance !== null) {
        return _instance;
    }

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl !== undefined && redisUrl !== '') {
        console.log('🔴 Using Redis for token blacklist storage');
        _instance = new RedisTokenStore(redisUrl);
    } else {
        console.log('💾 Using in-memory token blacklist (set REDIS_URL for persistence)');
        _instance = new MemoryTokenStore();
    }

    return _instance;
}

export function resetTokenStore(): void {
    if (_instance !== null) {
        void _instance.destroy();
        _instance = null;
    }
}

export function createTokenStoreAdapter(store: TokenStore): ITokenStore {
    return {
        async blacklist(token: string, _expiresAt: Date): Promise<void> {
            await store.add(token);
        },
        async isBlacklisted(token: string): Promise<boolean> {
            return store.has(token);
        },
        async cleanup(): Promise<number> {
            return 0;
        }
    };
}
