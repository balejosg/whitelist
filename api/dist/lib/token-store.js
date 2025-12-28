/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - PostgreSQL-backed token blacklist
 */
import jwt from 'jsonwebtoken';
import { query } from './db.js';
// =============================================================================
// Token Store Implementation
// =============================================================================
export async function blacklistToken(token, expiresAt) {
    const decoded = jwt.decode(token);
    const userId = decoded?.userId ?? 'unknown';
    // Use first 16 chars of token as ID (unique enough)
    const id = token.substring(0, 16);
    await query(`INSERT INTO tokens (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`, [id, userId, token, expiresAt.toISOString()]);
}
export async function isBlacklisted(token) {
    const id = token.substring(0, 16);
    const result = await query(`SELECT EXISTS(
            SELECT 1 FROM tokens 
            WHERE id = $1 
            AND expires_at > NOW()
        ) as exists`, [id]);
    return result.rows[0]?.exists ?? false;
}
export async function cleanup() {
    const result = await query('DELETE FROM tokens WHERE expires_at <= NOW()');
    return result.rowCount ?? 0;
}
// =============================================================================
// ITokenStore Adapter
// =============================================================================
export const tokenStore = {
    blacklist: blacklistToken,
    isBlacklisted,
    cleanup
};
export default tokenStore;
// =============================================================================
// Legacy Compatibility Exports
// =============================================================================
export function getTokenStore() {
    return tokenStore;
}
export function resetTokenStore() {
    // No-op for DB-based store
}
export function createTokenStoreAdapter(_store) {
    return tokenStore;
}
//# sourceMappingURL=token-store.js.map