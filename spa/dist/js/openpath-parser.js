/**
 * OpenPath File Parser
 * Parses and serializes the whitelist.txt format with sections
 */
export const WhitelistParser = {
    SECTIONS: {
        WHITELIST: '## WHITELIST',
        BLOCKED_SUBDOMAINS: '## BLOCKED-SUBDOMAINS',
        BLOCKED_PATHS: '## BLOCKED-PATHS'
    },
    /**
     * Parse whitelist file content into structured data
     */
    parse(content) {
        const result = {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        };
        if (!content || !content.trim()) {
            return result;
        }
        const lines = content.split('\n');
        let currentSection = null;
        // Check if disabled
        if (lines[0]?.trim() === '#DESACTIVADO') {
            result.enabled = false;
        }
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments (except section headers)
            if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('##'))) {
                continue;
            }
            // Check for section headers
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
            // Add entry to current section
            if (currentSection && !trimmed.startsWith('#')) {
                const section = result[currentSection];
                if (Array.isArray(section)) {
                    section.push(trimmed.toLowerCase());
                }
            }
        }
        return result;
    },
    /**
     * Serialize structured data back to whitelist file format
     */
    serialize(data) {
        let content = '';
        // Add disabled marker if needed
        if (!data.enabled) {
            content += '#DESACTIVADO\n\n';
        }
        // Whitelist section
        if (data.whitelist && data.whitelist.length > 0) {
            content += `${this.SECTIONS.WHITELIST}\n`;
            data.whitelist.sort().forEach((domain) => {
                content += `${domain}\n`;
            });
            content += '\n';
        }
        // Blocked subdomains section
        if (data.blocked_subdomains && data.blocked_subdomains.length > 0) {
            content += `${this.SECTIONS.BLOCKED_SUBDOMAINS}\n`;
            data.blocked_subdomains.sort().forEach((subdomain) => {
                content += `${subdomain}\n`;
            });
            content += '\n';
        }
        // Blocked paths section
        if (data.blocked_paths && data.blocked_paths.length > 0) {
            content += `${this.SECTIONS.BLOCKED_PATHS}\n`;
            data.blocked_paths.sort().forEach((path) => {
                content += `${path}\n`;
            });
            content += '\n';
        }
        return content.trim() + '\n';
    },
    /**
     * Get stats from parsed data
     */
    getStats(data) {
        return {
            whitelist: data.whitelist?.length || 0,
            blocked_subdomains: data.blocked_subdomains?.length || 0,
            blocked_paths: data.blocked_paths?.length || 0
        };
    }
};
//# sourceMappingURL=openpath-parser.js.map