/**
 * OpenPath - Config Module Unit Tests
 * Tests for localStorage configuration management
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import type { SPAConfig } from '../src/types/index.js';

// =============================================================================
// localStorage Mock
// =============================================================================

class MockLocalStorage {
    private store: Map<string, string> = new Map();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    get length(): number {
        return this.store.size;
    }

    key(index: number): string | null {
        const keys = Array.from(this.store.keys());
        return keys[index] ?? null;
    }
}

// Global mock for tests
let mockStorage: MockLocalStorage;

// Config implementation (copied to test in isolation)
const STORAGE_KEY = 'openpath-spa-config';

const Config = {
    STORAGE_KEY,

    get(): Partial<SPAConfig> {
        try {
            return JSON.parse(mockStorage.getItem(this.STORAGE_KEY) ?? '{}') as Partial<SPAConfig>;
        } catch {
            return {};
        }
    },

    save(config: Partial<SPAConfig>): Partial<SPAConfig> {
        const current = this.get();
        const merged = { ...current, ...config };
        mockStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        return merged;
    },

    isConfigured(): boolean {
        const config = this.get();
        return !!(config.owner && config.repo);
    },

    clear(): void {
        mockStorage.removeItem(this.STORAGE_KEY);
    },

    getRequired(): SPAConfig {
        const config = this.get();
        if (!config.owner || !config.repo) {
            throw new Error('Configuración incompleta');
        }
        return config as SPAConfig;
    }
};

// =============================================================================
// Config.get() Tests
// =============================================================================

void describe('Config.get()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should return empty object when no config stored', () => {
        const result = Config.get();
        assert.deepStrictEqual(result, {});
    });

    void test('should return stored config', () => {
        const stored: Partial<SPAConfig> = {
            owner: 'test-owner',
            repo: 'test-repo',
            branch: 'main'
        };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        const result = Config.get();
        assert.deepStrictEqual(result, stored);
    });

    void test('should return empty object on invalid JSON', () => {
        mockStorage.setItem(STORAGE_KEY, 'not valid json {{{');

        const result = Config.get();
        assert.deepStrictEqual(result, {});
    });

    void test('should return partial config', () => {
        const stored: Partial<SPAConfig> = { owner: 'test-owner' };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        const result = Config.get();
        assert.strictEqual(result.owner, 'test-owner');
        assert.strictEqual(result.repo, undefined);
    });

    void test('should handle empty string stored value', () => {
        mockStorage.setItem(STORAGE_KEY, '');

        const result = Config.get();
        assert.deepStrictEqual(result, {});
    });

    void test('should handle null values in stored config', () => {
        const stored = { owner: 'test', repo: null };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        const result = Config.get();
        assert.strictEqual(result.owner, 'test');
        assert.strictEqual(result.repo, null);
    });
});

// =============================================================================
// Config.save() Tests
// =============================================================================

void describe('Config.save()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should save new config', () => {
        const newConfig: Partial<SPAConfig> = {
            owner: 'new-owner',
            repo: 'new-repo'
        };

        const result = Config.save(newConfig);

        assert.deepStrictEqual(result, newConfig);
        assert.strictEqual(mockStorage.getItem(STORAGE_KEY), JSON.stringify(newConfig));
    });

    void test('should merge with existing config', () => {
        const existing: Partial<SPAConfig> = {
            owner: 'existing-owner',
            branch: 'main'
        };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

        const updates: Partial<SPAConfig> = {
            repo: 'new-repo'
        };

        const result = Config.save(updates);

        assert.deepStrictEqual(result, {
            owner: 'existing-owner',
            branch: 'main',
            repo: 'new-repo'
        });
    });

    void test('should overwrite existing values', () => {
        const existing: Partial<SPAConfig> = {
            owner: 'old-owner',
            repo: 'old-repo'
        };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

        const updates: Partial<SPAConfig> = {
            owner: 'new-owner'
        };

        const result = Config.save(updates);

        assert.strictEqual(result.owner, 'new-owner');
        assert.strictEqual(result.repo, 'old-repo');
    });

    void test('should return merged config', () => {
        const result = Config.save({ owner: 'test' });

        assert.ok('owner' in result);
        assert.strictEqual(result.owner, 'test');
    });

    void test('should handle saving empty object', () => {
        const existing: Partial<SPAConfig> = { owner: 'existing' };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

        const result = Config.save({});

        assert.deepStrictEqual(result, existing);
    });

    void test('should handle saving all config fields', () => {
        const fullConfig: SPAConfig = {
            owner: 'test-owner',
            repo: 'test-repo',
            branch: 'main',
            whitelistPath: 'whitelist.txt',
            token: 'secret-token',
            gruposDir: 'grupos'
        };

        const result = Config.save(fullConfig);

        assert.deepStrictEqual(result, fullConfig);
    });
});

// =============================================================================
// Config.isConfigured() Tests
// =============================================================================

void describe('Config.isConfigured()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should return false when no config', () => {
        assert.strictEqual(Config.isConfigured(), false);
    });

    void test('should return false when only owner is set', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: 'test-owner' }));

        assert.strictEqual(Config.isConfigured(), false);
    });

    void test('should return false when only repo is set', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ repo: 'test-repo' }));

        assert.strictEqual(Config.isConfigured(), false);
    });

    void test('should return true when both owner and repo are set', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            owner: 'test-owner',
            repo: 'test-repo'
        }));

        assert.strictEqual(Config.isConfigured(), true);
    });

    void test('should return false when owner is empty string', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            owner: '',
            repo: 'test-repo'
        }));

        assert.strictEqual(Config.isConfigured(), false);
    });

    void test('should return false when repo is empty string', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            owner: 'test-owner',
            repo: ''
        }));

        assert.strictEqual(Config.isConfigured(), false);
    });

    void test('should return true even without optional fields', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({
            owner: 'test-owner',
            repo: 'test-repo'
            // No branch, whitelistPath, token, or gruposDir
        }));

        assert.strictEqual(Config.isConfigured(), true);
    });
});

// =============================================================================
// Config.clear() Tests
// =============================================================================

void describe('Config.clear()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should remove config from storage', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: 'test' }));

        Config.clear();

        assert.strictEqual(mockStorage.getItem(STORAGE_KEY), null);
    });

    void test('should not throw when nothing to clear', () => {
        assert.doesNotThrow(() => {
            Config.clear();
        });
    });

    void test('should result in empty config from get()', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: 'test' }));

        Config.clear();

        assert.deepStrictEqual(Config.get(), {});
    });

    void test('should only remove config key', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: 'test' }));
        mockStorage.setItem('other-key', 'other-value');

        Config.clear();

        assert.strictEqual(mockStorage.getItem('other-key'), 'other-value');
    });
});

// =============================================================================
// Config.getRequired() Tests
// =============================================================================

void describe('Config.getRequired()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should throw when config is empty', () => {
        assert.throws(
            () => Config.getRequired(),
            { message: 'Configuración incompleta' }
        );
    });

    void test('should throw when owner is missing', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ repo: 'test-repo' }));

        assert.throws(
            () => Config.getRequired(),
            { message: 'Configuración incompleta' }
        );
    });

    void test('should throw when repo is missing', () => {
        mockStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: 'test-owner' }));

        assert.throws(
            () => Config.getRequired(),
            { message: 'Configuración incompleta' }
        );
    });

    void test('should return config when both required fields present', () => {
        const stored: SPAConfig = {
            owner: 'test-owner',
            repo: 'test-repo',
            branch: 'main',
            whitelistPath: 'whitelist.txt'
        };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        const result = Config.getRequired();

        assert.strictEqual(result.owner, 'test-owner');
        assert.strictEqual(result.repo, 'test-repo');
    });

    void test('should include optional fields in returned config', () => {
        const stored: SPAConfig = {
            owner: 'test-owner',
            repo: 'test-repo',
            branch: 'develop',
            whitelistPath: 'custom/path.txt',
            token: 'my-token',
            gruposDir: 'custom-grupos'
        };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

        const result = Config.getRequired();

        assert.strictEqual(result.branch, 'develop');
        assert.strictEqual(result.whitelistPath, 'custom/path.txt');
        assert.strictEqual(result.token, 'my-token');
        assert.strictEqual(result.gruposDir, 'custom-grupos');
    });
});

// =============================================================================
// Edge Cases
// =============================================================================

void describe('Config edge cases', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should handle special characters in values', () => {
        const config: Partial<SPAConfig> = {
            owner: 'test-owner_123',
            repo: 'repo.with.dots',
            branch: 'feature/my-branch'
        };

        Config.save(config);
        const result = Config.get();

        assert.deepStrictEqual(result, config);
    });

    void test('should handle unicode in values', () => {
        const config: Partial<SPAConfig> = {
            owner: 'usuario-español',
            repo: 'repositorio-日本語'
        };

        Config.save(config);
        const result = Config.get();

        assert.deepStrictEqual(result, config);
    });

    void test('should handle multiple saves', () => {
        Config.save({ owner: 'first' });
        Config.save({ repo: 'second' });
        Config.save({ branch: 'third' });

        const result = Config.get();

        assert.strictEqual(result.owner, 'first');
        assert.strictEqual(result.repo, 'second');
        assert.strictEqual(result.branch, 'third');
    });

    void test('should handle save after clear', () => {
        Config.save({ owner: 'test' });
        Config.clear();
        Config.save({ repo: 'new-repo' });

        const result = Config.get();

        assert.strictEqual(result.owner, undefined);
        assert.strictEqual(result.repo, 'new-repo');
    });

    void test('STORAGE_KEY should be correct', () => {
        assert.strictEqual(Config.STORAGE_KEY, 'openpath-spa-config');
    });
});
