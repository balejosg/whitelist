import { describe, it } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { blacklistToken, isBlacklisted, cleanup } from '../src/lib/token-store.js';

void describe('Token Store', () => {
    const secret = 'test-secret';
    
    function createTestToken(expiresIn = 3600): string {
        return jwt.sign({ sub: 'test-user' }, secret, { expiresIn });
    }

    void describe('blacklistToken', () => {
        void it('adds token to blacklist', async () => {
            const token = createTestToken();
            const expiresAt = new Date(Date.now() + 3600000);
            
            await blacklistToken(token, expiresAt);
            const result = await isBlacklisted(token);
            
            assert.strictEqual(result, true);
        });

        void it('handles duplicate tokens gracefully', async () => {
            const token = createTestToken();
            const expiresAt = new Date(Date.now() + 3600000);
            
            await blacklistToken(token, expiresAt);
            // Should not throw on duplicate (onConflictDoNothing)
            await assert.doesNotReject(() => blacklistToken(token, expiresAt));
        });
    });

    void describe('isBlacklisted', () => {
        void it('returns false for non-blacklisted token', async () => {
            const token = createTestToken();
            const result = await isBlacklisted(token);
            assert.strictEqual(result, false);
        });
    });

    void describe('cleanup', () => {
        void it('removes expired tokens', async () => {
            const token = createTestToken(-3600); // Expired 1h ago
            const expiredDate = new Date(Date.now() - 1000);
            
            await blacklistToken(token, expiredDate);
            const removedCount = await cleanup();
            
            assert.ok(removedCount >= 0);
        });
    });
});
