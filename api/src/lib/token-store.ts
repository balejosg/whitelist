/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - PostgreSQL-backed token blacklist using Drizzle ORM
 */

import jwt from 'jsonwebtoken';
import { eq, lt } from 'drizzle-orm';
import { db, tokens } from '../db/index.js';
import type { ITokenStore } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

interface DecodedTokenBase {
    exp?: number;
}

// =============================================================================
// Token Store Implementation
// =============================================================================

export async function blacklistToken(token: string, expiresAt: Date): Promise<void> {
    const decoded = jwt.decode(token) as DecodedTokenBase & { userId?: string } | null;
    const userId = decoded?.userId ?? 'unknown';

    // Use first 16 chars of token as ID (unique enough)
    const id = token.substring(0, 16);

    await db.insert(tokens)
        .values({
            id,
            userId,
            tokenHash: token,
            expiresAt,
        })
        .onConflictDoNothing();
}

export async function isBlacklisted(token: string): Promise<boolean> {
    const id = token.substring(0, 16);

    const result = await db.select()
        .from(tokens)
        .where(eq(tokens.id, id))
        .limit(1);

    if (result.length === 0) {
        return false;
    }

    const tokenRecord = result[0];
    return tokenRecord !== undefined && tokenRecord.expiresAt > new Date();
}

export async function cleanup(): Promise<number> {
    const result = await db.delete(tokens)
        .where(lt(tokens.expiresAt, new Date()));

    return result.rowCount ?? 0;
}

// =============================================================================
// ITokenStore Adapter
// =============================================================================

export const tokenStore: ITokenStore = {
    blacklist: blacklistToken,
    isBlacklisted,
    cleanup
};

export default tokenStore;

// =============================================================================
// Legacy Compatibility Exports
// =============================================================================

export function getTokenStore(): ITokenStore {
    return tokenStore;
}

export function resetTokenStore(): void {
    // No-op for DB-based store
}

export function createTokenStoreAdapter(_store?: unknown): ITokenStore {
    return tokenStore;
}
