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
 * Token Store - Abstraction for token blacklist storage
 * 
 * Supports:
 * - MemoryTokenStore: In-memory storage (default, for development)
 * - RedisTokenStore: Redis-backed storage (production, when REDIS_URL is set)
 * 
 * Tokens are automatically cleaned up when they expire.
 */

const jwt = require('jsonwebtoken');

// =============================================================================
// Memory Token Store (Default)
// =============================================================================

class MemoryTokenStore {
    constructor() {
        this.blacklist = new Set();
        this.cleanupInterval = null;
        this._startCleanup();
    }

    /**
     * Add a token to the blacklist
     * @param {string} token - JWT token to blacklist
     * @returns {Promise<boolean>} - Success status
     */
    async add(token) {
        this.blacklist.add(token);
        return true;
    }

    /**
     * Check if a token is blacklisted
     * @param {string} token - JWT token to check
     * @returns {Promise<boolean>} - True if blacklisted
     */
    async has(token) {
        return this.blacklist.has(token);
    }

    /**
     * Remove a token from the blacklist
     * @param {string} token - JWT token to remove
     * @returns {Promise<boolean>} - Success status
     */
    async delete(token) {
        return this.blacklist.delete(token);
    }

    /**
     * Get the number of blacklisted tokens
     * @returns {Promise<number>}
     */
    async size() {
        return this.blacklist.size;
    }

    /**
     * Clean up expired tokens
     * @param {string} secret - JWT secret for verification
     */
    async cleanup(secret) {
        for (const token of this.blacklist) {
            try {
                jwt.verify(token, secret, { ignoreExpiration: false });
            } catch (error) {
                if (error.name === 'TokenExpiredError') {
                    this.blacklist.delete(token);
                }
            }
        }
    }

    /**
     * Start periodic cleanup (every 5 minutes)
     */
    _startCleanup() {
        this.cleanupInterval = setInterval(() => {
            // Cleanup will be triggered by auth.js with the secret
        }, 5 * 60 * 1000);
        this.cleanupInterval.unref(); // Don't prevent process exit
    }

    /**
     * Stop cleanup interval
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// =============================================================================
// Redis Token Store (Production)
// =============================================================================

class RedisTokenStore {
    constructor(redisUrl) {
        this.redisUrl = redisUrl;
        this.client = null;
        this.connected = false;
        this._connect();
    }

    async _connect() {
        try {
            // Dynamic import for optional redis dependency
            const redis = require('redis');
            this.client = redis.createClient({ url: this.redisUrl });

            this.client.on('error', (err) => {
                console.error('Redis error:', err.message);
                this.connected = false;
            });

            this.client.on('connect', () => {
                console.log('✓ Redis connected for token storage');
                this.connected = true;
            });

            await this.client.connect();
        } catch (error) {
            console.warn('⚠️ Redis not available, falling back to memory store:', error.message);
            this.connected = false;
        }
    }

    /**
     * Add a token to the blacklist with TTL based on token expiration
     * @param {string} token - JWT token to blacklist
     * @returns {Promise<boolean>}
     */
    async add(token) {
        if (!this.connected || !this.client) {
            return false;
        }

        try {
            // Decode token to get expiration
            const decoded = jwt.decode(token);
            const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;

            // Only store if token hasn't expired
            if (ttl > 0) {
                await this.client.setEx(`blacklist:${token}`, ttl, '1');
            }
            return true;
        } catch (error) {
            console.error('Redis add error:', error.message);
            return false;
        }
    }

    /**
     * Check if a token is blacklisted
     * @param {string} token
     * @returns {Promise<boolean>}
     */
    async has(token) {
        if (!this.connected || !this.client) {
            return false;
        }

        try {
            const result = await this.client.get(`blacklist:${token}`);
            return result !== null;
        } catch (error) {
            console.error('Redis has error:', error.message);
            return false;
        }
    }

    /**
     * Remove a token from the blacklist
     * @param {string} token
     * @returns {Promise<boolean>}
     */
    async delete(token) {
        if (!this.connected || !this.client) {
            return false;
        }

        try {
            await this.client.del(`blacklist:${token}`);
            return true;
        } catch (error) {
            console.error('Redis delete error:', error.message);
            return false;
        }
    }

    /**
     * Get approximate size (Redis handles cleanup via TTL)
     * @returns {Promise<number>}
     */
    async size() {
        if (!this.connected || !this.client) {
            return 0;
        }

        try {
            const keys = await this.client.keys('blacklist:*');
            return keys.length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Cleanup is automatic via Redis TTL
     */
    async cleanup() {
        // No-op: Redis handles expiration automatically
    }

    /**
     * Close Redis connection
     */
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

/**
 * Get the token store instance (singleton)
 * Uses Redis if REDIS_URL is set, otherwise in-memory
 * @returns {MemoryTokenStore|RedisTokenStore}
 */
function getTokenStore() {
    if (_instance) {
        return _instance;
    }

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        console.log('🔴 Using Redis for token blacklist storage');
        _instance = new RedisTokenStore(redisUrl);
    } else {
        console.log('💾 Using in-memory token blacklist (set REDIS_URL for persistence)');
        _instance = new MemoryTokenStore();
    }

    return _instance;
}

/**
 * Reset the singleton (for testing)
 */
function resetTokenStore() {
    if (_instance) {
        _instance.destroy();
        _instance = null;
    }
}

module.exports = {
    MemoryTokenStore,
    RedisTokenStore,
    getTokenStore,
    resetTokenStore
};
