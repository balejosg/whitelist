/**
 * OpenPath - WhitelistParser Unit Tests
 * Tests for the whitelist file parser and serializer
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Import the parser (we recreate it here to test in isolation without DOM)
import type { GroupData } from '../src/types/index.js';

const WhitelistParser = {
    SECTIONS: {
        WHITELIST: '## WHITELIST',
        BLOCKED_SUBDOMAINS: '## BLOCKED-SUBDOMAINS',
        BLOCKED_PATHS: '## BLOCKED-PATHS'
    },

    parse(content: string): GroupData {
        const result: GroupData = {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        };

        if (!content.trim()) {
            return result;
        }

        const lines = content.split('\n');
        let currentSection: keyof GroupData | null = null;

        if (lines[0] && lines[0].trim() === '#DESACTIVADO') {
            result.enabled = false;
        }

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('##'))) {
                continue;
            }

            if (trimmed === this.SECTIONS.WHITELIST) {
                currentSection = 'whitelist';
                continue;
            }
            if (trimmed === this.SECTIONS.BLOCKED_SUBDOMAINS) {
                currentSection = 'blocked_subdomains';
                continue;
            }
            if (trimmed === this.SECTIONS.BLOCKED_PATHS) {
                currentSection = 'blocked_paths';
                continue;
            }

            if (currentSection && !trimmed.startsWith('#')) {
                const section = result[currentSection];
                if (Array.isArray(section)) {
                    section.push(trimmed.toLowerCase());
                }
            }
        }

        return result;
    },

    serialize(data: GroupData): string {
        let content = '';

        if (!data.enabled) {
            content += '#DESACTIVADO\n\n';
        }

        if (data.whitelist.length > 0) {
            content += `${this.SECTIONS.WHITELIST}\n`;
            data.whitelist.sort().forEach((domain: string) => {
                content += `${domain}\n`;
            });
            content += '\n';
        }

        if (data.blocked_subdomains.length > 0) {
            content += `${this.SECTIONS.BLOCKED_SUBDOMAINS}\n`;
            data.blocked_subdomains.sort().forEach((subdomain: string) => {
                content += `${subdomain}\n`;
            });
            content += '\n';
        }

        if (data.blocked_paths.length > 0) {
            content += `${this.SECTIONS.BLOCKED_PATHS}\n`;
            data.blocked_paths.sort().forEach((path: string) => {
                content += `${path}\n`;
            });
            content += '\n';
        }

        return content.trim() + '\n';
    },

    getStats(data: GroupData): { whitelist: number; blocked_subdomains: number; blocked_paths: number } {
        return {
            whitelist: data.whitelist.length,
            blocked_subdomains: data.blocked_subdomains.length,
            blocked_paths: data.blocked_paths.length
        };
    }
};

// =============================================================================
// parse() Tests
// =============================================================================

void describe('WhitelistParser.parse()', () => {
    void test('should return empty structure for empty content', () => {
        const result = WhitelistParser.parse('');
        assert.deepStrictEqual(result, {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        });
    });

    void test('should return empty structure for whitespace-only content', () => {
        const result = WhitelistParser.parse('   \n\n   \n');
        assert.deepStrictEqual(result, {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        });
    });

    void test('should parse whitelist section correctly', () => {
        const content = `## WHITELIST
google.com
github.com
example.org`;
        const result = WhitelistParser.parse(content);

        assert.strictEqual(result.enabled, true);
        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com', 'example.org']);
        assert.deepStrictEqual(result.blocked_subdomains, []);
        assert.deepStrictEqual(result.blocked_paths, []);
    });

    void test('should parse all three sections', () => {
        const content = `## WHITELIST
google.com
github.com

## BLOCKED-SUBDOMAINS
ads.google.com
tracking.example.com

## BLOCKED-PATHS
*/ads/*
*/tracking/*`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com']);
        assert.deepStrictEqual(result.blocked_subdomains, ['ads.google.com', 'tracking.example.com']);
        assert.deepStrictEqual(result.blocked_paths, ['*/ads/*', '*/tracking/*']);
    });

    void test('should detect disabled marker', () => {
        const content = `#DESACTIVADO

## WHITELIST
google.com`;
        const result = WhitelistParser.parse(content);

        assert.strictEqual(result.enabled, false);
        assert.deepStrictEqual(result.whitelist, ['google.com']);
    });

    void test('should ignore single-hash comments', () => {
        const content = `## WHITELIST
# This is a comment
google.com
# Another comment
github.com`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com']);
    });

    void test('should convert domains to lowercase', () => {
        const content = `## WHITELIST
GOOGLE.COM
GitHub.Com
EXAMPLE.ORG`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com', 'example.org']);
    });

    void test('should handle entries before first section header', () => {
        const content = `orphan-entry.com
## WHITELIST
google.com`;
        const result = WhitelistParser.parse(content);

        // Entries before any section header should be ignored
        assert.deepStrictEqual(result.whitelist, ['google.com']);
    });

    void test('should handle empty lines between entries', () => {
        const content = `## WHITELIST
google.com

github.com

example.org`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com', 'example.org']);
    });

    void test('should trim whitespace from entries', () => {
        const content = `## WHITELIST
  google.com
    github.com
example.org   `;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com', 'example.org']);
    });

    void test('should handle CRLF line endings', () => {
        const content = '## WHITELIST\r\ngoogle.com\r\ngithub.com\r\n';
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com']);
    });

    void test('should handle only blocked-subdomains section', () => {
        const content = `## BLOCKED-SUBDOMAINS
ads.example.com
tracking.site.com`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, []);
        assert.deepStrictEqual(result.blocked_subdomains, ['ads.example.com', 'tracking.site.com']);
    });

    void test('should handle sections in non-standard order', () => {
        const content = `## BLOCKED-PATHS
*/ads/*

## WHITELIST
google.com

## BLOCKED-SUBDOMAINS
ads.google.com`;
        const result = WhitelistParser.parse(content);

        assert.deepStrictEqual(result.whitelist, ['google.com']);
        assert.deepStrictEqual(result.blocked_subdomains, ['ads.google.com']);
        assert.deepStrictEqual(result.blocked_paths, ['*/ads/*']);
    });
});

// =============================================================================
// serialize() Tests
// =============================================================================

void describe('WhitelistParser.serialize()', () => {
    void test('should serialize empty enabled structure', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);

        // Empty enabled data produces just a newline
        assert.strictEqual(result, '\n');
    });

    void test('should add disabled marker when disabled', () => {
        const data: GroupData = {
            enabled: false,
            whitelist: ['google.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);

        assert.ok(result.startsWith('#DESACTIVADO\n'));
        assert.ok(result.includes('## WHITELIST'));
        assert.ok(result.includes('google.com'));
    });

    void test('should serialize whitelist section', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['google.com', 'github.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);

        assert.ok(result.includes('## WHITELIST'));
        assert.ok(result.includes('github.com\n'));
        assert.ok(result.includes('google.com\n'));
    });

    void test('should sort entries alphabetically', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['zoo.com', 'apple.com', 'banana.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);
        const lines = result.split('\n');

        const appleIndex = lines.indexOf('apple.com');
        const bananaIndex = lines.indexOf('banana.com');
        const zooIndex = lines.indexOf('zoo.com');

        assert.ok(appleIndex < bananaIndex);
        assert.ok(bananaIndex < zooIndex);
    });

    void test('should serialize all sections', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['google.com'],
            blocked_subdomains: ['ads.google.com'],
            blocked_paths: ['*/tracking/*']
        };
        const result = WhitelistParser.serialize(data);

        assert.ok(result.includes('## WHITELIST'));
        assert.ok(result.includes('google.com'));
        assert.ok(result.includes('## BLOCKED-SUBDOMAINS'));
        assert.ok(result.includes('ads.google.com'));
        assert.ok(result.includes('## BLOCKED-PATHS'));
        assert.ok(result.includes('*/tracking/*'));
    });

    void test('should omit empty sections', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['google.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);

        assert.ok(result.includes('## WHITELIST'));
        assert.ok(!result.includes('## BLOCKED-SUBDOMAINS'));
        assert.ok(!result.includes('## BLOCKED-PATHS'));
    });

    void test('should end with newline', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['google.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const result = WhitelistParser.serialize(data);

        assert.ok(result.endsWith('\n'));
    });
});

// =============================================================================
// getStats() Tests
// =============================================================================

void describe('WhitelistParser.getStats()', () => {
    void test('should return zeros for empty data', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const stats = WhitelistParser.getStats(data);

        assert.deepStrictEqual(stats, {
            whitelist: 0,
            blocked_subdomains: 0,
            blocked_paths: 0
        });
    });

    void test('should count all sections correctly', () => {
        const data: GroupData = {
            enabled: true,
            whitelist: ['a.com', 'b.com', 'c.com'],
            blocked_subdomains: ['x.a.com', 'y.b.com'],
            blocked_paths: ['*/ads/*']
        };
        const stats = WhitelistParser.getStats(data);

        assert.deepStrictEqual(stats, {
            whitelist: 3,
            blocked_subdomains: 2,
            blocked_paths: 1
        });
    });

    void test('should not include enabled field', () => {
        const data: GroupData = {
            enabled: false,
            whitelist: ['google.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const stats = WhitelistParser.getStats(data);

        assert.ok(!('enabled' in stats));
        assert.strictEqual(Object.keys(stats).length, 3);
    });
});

// =============================================================================
// Round-trip Tests (parse -> serialize -> parse)
// =============================================================================

void describe('WhitelistParser round-trip', () => {
    void test('should preserve data through parse -> serialize -> parse', () => {
        const original: GroupData = {
            enabled: true,
            whitelist: ['google.com', 'github.com'],
            blocked_subdomains: ['ads.google.com'],
            blocked_paths: ['*/tracking/*', '*/ads/*']
        };

        const serialized = WhitelistParser.serialize(original);
        const parsed = WhitelistParser.parse(serialized);

        // Note: arrays will be sorted after serialize
        assert.strictEqual(parsed.enabled, original.enabled);
        assert.deepStrictEqual(parsed.whitelist.sort(), original.whitelist.sort());
        assert.deepStrictEqual(parsed.blocked_subdomains.sort(), original.blocked_subdomains.sort());
        assert.deepStrictEqual(parsed.blocked_paths.sort(), original.blocked_paths.sort());
    });

    void test('should preserve disabled state through round-trip', () => {
        const original: GroupData = {
            enabled: false,
            whitelist: ['google.com'],
            blocked_subdomains: [],
            blocked_paths: []
        };

        const serialized = WhitelistParser.serialize(original);
        const parsed = WhitelistParser.parse(serialized);

        assert.strictEqual(parsed.enabled, false);
    });

    void test('should normalize case through round-trip', () => {
        const content = `## WHITELIST
GOOGLE.COM
GitHub.Com`;

        const parsed = WhitelistParser.parse(content);
        const serialized = WhitelistParser.serialize(parsed);

        assert.ok(serialized.includes('google.com'));
        assert.ok(serialized.includes('github.com'));
        assert.ok(!serialized.includes('GOOGLE'));
        assert.ok(!serialized.includes('GitHub'));
    });
});

// =============================================================================
// Edge Cases
// =============================================================================

void describe('WhitelistParser edge cases', () => {
    void test('should handle very long domain names', () => {
        const longDomain = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.com';
        const content = `## WHITELIST\n${longDomain}`;

        const result = WhitelistParser.parse(content);
        assert.deepStrictEqual(result.whitelist, [longDomain]);
    });

    void test('should handle unicode in paths', () => {
        const content = `## BLOCKED-PATHS
*/búsqueda/*
*/検索/*`;

        const result = WhitelistParser.parse(content);
        assert.deepStrictEqual(result.blocked_paths, ['*/búsqueda/*', '*/検索/*']);
    });

    void test('should handle punycode domains', () => {
        const content = `## WHITELIST
xn--mnchen-3ya.de`;

        const result = WhitelistParser.parse(content);
        assert.deepStrictEqual(result.whitelist, ['xn--mnchen-3ya.de']);
    });

    void test('should handle multiple consecutive section headers', () => {
        const content = `## WHITELIST
## BLOCKED-SUBDOMAINS
ads.google.com`;

        const result = WhitelistParser.parse(content);
        // WHITELIST section is empty, BLOCKED-SUBDOMAINS has entry
        assert.deepStrictEqual(result.whitelist, []);
        assert.deepStrictEqual(result.blocked_subdomains, ['ads.google.com']);
    });

    void test('should handle disabled marker not on first line', () => {
        const content = `## WHITELIST
google.com
#DESACTIVADO`;

        const result = WhitelistParser.parse(content);
        // Disabled marker only works on first line
        assert.strictEqual(result.enabled, true);
    });
});
