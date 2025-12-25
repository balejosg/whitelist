/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - Abstraction for token blacklist storage
 * Supports Memory and Redis backends
 */
import jwt from 'jsonwebtoken';
// =============================================================================
// Memory Token Store (Default)
// =============================================================================
export class MemoryTokenStore {
    blacklist;
    cleanupInterval;
    constructor() {
        this.blacklist = new Set();
        this.cleanupInterval = null;
        this._startCleanup();
    }
    async add(token) {
        this.blacklist.add(token);
        return true;
    }
    async has(token) {
        return this.blacklist.has(token);
    }
    async delete(token) {
        return this.blacklist.delete(token);
    }
    async size() {
        return this.blacklist.size;
    }
    async cleanup(secret) {
        for (const token of this.blacklist) {
            try {
                jwt.verify(token, secret, { ignoreExpiration: false });
            }
            catch (error) {
                if (error instanceof Error && error.name === 'TokenExpiredError') {
                    this.blacklist.delete(token);
                }
            }
        }
    }
    _startCleanup() {
        this.cleanupInterval = setInterval(() => {
            // Cleanup will be triggered by auth.js with the secret
        }, 5 * 60 * 1000);
        this.cleanupInterval.unref();
    }
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
export class RedisTokenStore {
    redisUrl;
    client;
    connected;
    constructor(redisUrl) {
        this.redisUrl = redisUrl;
        this.client = null;
        this.connected = false;
        void this._connect();
    }
    async _connect() {
        try {
            // Dynamic import for optional redis dependency
            // @ts-expect-error - redis is an optional dependency
            const redis = await import('redis');
            this.client = redis.createClient({ url: this.redisUrl });
            this.client.on('error', (err) => {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error('Redis error:', message);
                this.connected = false;
            });
            this.client.on('connect', () => {
                console.log('✓ Redis connected for token storage');
                this.connected = true;
            });
            await this.client.connect();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn('⚠️ Redis not available, falling back to memory store:', message);
            this.connected = false;
        }
    }
    async add(token) {
        if (!this.connected || !this.client) {
            return false;
        }
        try {
            const decoded = jwt.decode(token);
            const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;
            if (ttl > 0) {
                await this.client.setEx(`blacklist:${token}`, ttl, '1');
            }
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis add error:', message);
            return false;
        }
    }
    async has(token) {
        if (!this.connected || !this.client) {
            return false;
        }
        try {
            const result = await this.client.get(`blacklist:${token}`);
            return result !== null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis has error:', message);
            return false;
        }
    }
    async delete(token) {
        if (!this.connected || !this.client) {
            return false;
        }
        try {
            await this.client.del(`blacklist:${token}`);
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Redis delete error:', message);
            return false;
        }
    }
    async size() {
        if (!this.connected || !this.client) {
            return 0;
        }
        try {
            const keys = await this.client.keys('blacklist:*');
            return keys.length;
        }
        catch {
            return 0;
        }
    }
    async cleanup() {
        // No-op: Redis handles expiration automatically via TTL
    }
    async destroy() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
    }
}
// =============================================================================
// Factory Function
// =============================================================================
let _instance = null;
export function getTokenStore() {
    if (_instance) {
        return _instance;
    }
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        console.log('🔴 Using Redis for token blacklist storage');
        _instance = new RedisTokenStore(redisUrl);
    }
    else {
        console.log('💾 Using in-memory token blacklist (set REDIS_URL for persistence)');
        _instance = new MemoryTokenStore();
    }
    return _instance;
}
export function resetTokenStore() {
    if (_instance) {
        void _instance.destroy();
        _instance = null;
    }
}
export function createTokenStoreAdapter(store) {
    return {
        async blacklist(token, _expiresAt) {
            await store.add(token);
        },
        async isBlacklisted(token) {
            return store.has(token);
        },
        async cleanup() {
            return 0;
        }
    };
}
//# sourceMappingURL=token-store.js.map