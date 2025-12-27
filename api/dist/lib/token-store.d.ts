/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - Abstraction for token blacklist storage
 * Supports Memory and Redis backends
 */
import type { ITokenStore } from '../types/storage.js';
interface TokenStore {
    add(token: string): Promise<boolean>;
    has(token: string): Promise<boolean>;
    delete(token: string): Promise<boolean>;
    size(): Promise<number>;
    cleanup(secret: string): Promise<void>;
    destroy(): void | Promise<void>;
}
export declare class MemoryTokenStore implements TokenStore {
    private readonly blacklist;
    private cleanupInterval;
    constructor();
    add(token: string): Promise<boolean>;
    has(token: string): Promise<boolean>;
    delete(token: string): Promise<boolean>;
    size(): Promise<number>;
    cleanup(secret: string): Promise<void>;
    private _startCleanup;
    destroy(): void;
}
export declare class RedisTokenStore implements TokenStore {
    private readonly redisUrl;
    private client;
    private connected;
    constructor(redisUrl: string);
    private _connect;
    add(token: string): Promise<boolean>;
    has(token: string): Promise<boolean>;
    delete(token: string): Promise<boolean>;
    size(): Promise<number>;
    cleanup(): Promise<void>;
    destroy(): Promise<void>;
}
export declare function getTokenStore(): TokenStore;
export declare function resetTokenStore(): void;
export declare function createTokenStoreAdapter(store: TokenStore): ITokenStore;
export {};
//# sourceMappingURL=token-store.d.ts.map