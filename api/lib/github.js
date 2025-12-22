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
 * GitHub API client for pushing approved domains to whitelist files
 */

const https = require('https');

const GITHUB_API = 'api.github.com';

/**
 * Make a request to GitHub API
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object|null} body - Request body
 * @returns {Promise<Object>}
 */
function githubRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const token = process.env.GITHUB_TOKEN;

        if (!token) {
            reject(new Error('GITHUB_TOKEN not configured'));
            return;
        }

        const options = {
            hostname: GITHUB_API,
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'whitelist-request-api/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(json.message || `HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Get file content from repository
 * @param {string} filePath - Path to file in repo
 * @returns {Promise<{content: string, sha: string}>}
 */
async function getFileContent(filePath) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;

    const response = await githubRequest('GET', endpoint);

    if (response.type !== 'file') {
        throw new Error('Path is not a file');
    }

    // Decode base64 content
    const content = Buffer.from(response.content, 'base64').toString('utf-8');

    return {
        content,
        sha: response.sha
    };
}

/**
 * Update or create a file in repository
 * @param {string} filePath - Path to file
 * @param {string} content - New file content
 * @param {string} message - Commit message
 * @param {string|null} sha - Current file SHA (for updates)
 * @returns {Promise<Object>}
 */
async function updateFile(filePath, content, message, sha = null) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;

    const body = {
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch
    };

    if (sha) {
        body.sha = sha;
    }

    return githubRequest('PUT', endpoint, body);
}

/**
 * Add a domain to a whitelist file
 * @param {string} domain - Domain to add
 * @param {string} groupId - Group/file name (e.g., 'informatica-3')
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addDomainToWhitelist(domain, groupId) {
    try {
        // Determine file path (adjust based on your repo structure)
        const filePath = `${groupId}.txt`;

        // Get current file content
        let currentContent = '';
        let sha = null;

        try {
            const file = await getFileContent(filePath);
            currentContent = file.content;
            sha = file.sha;
        } catch (error) {
            // File doesn't exist, will create new
            console.log(`File ${filePath} not found, creating new`);
        }

        // Parse current content to check if domain exists
        const lines = currentContent.split('\n');
        const domainLower = domain.toLowerCase().trim();

        // Check if domain already exists
        const exists = lines.some(line => {
            const trimmed = line.trim().toLowerCase();
            return trimmed === domainLower || trimmed === `*.${domainLower}`;
        });

        if (exists) {
            return {
                success: false,
                message: `Domain ${domain} already exists in ${groupId}`
            };
        }

        // Find WHITELIST section and add domain
        let newContent = '';
        let addedDomain = false;
        let inWhitelistSection = false;

        for (const line of lines) {
            newContent += line + '\n';

            if (line.trim() === '## WHITELIST') {
                inWhitelistSection = true;
            } else if (line.startsWith('## ') && inWhitelistSection) {
                // End of whitelist section, add before next section
                if (!addedDomain) {
                    // Insert domain before this section header
                    const lastNewline = newContent.lastIndexOf('\n');
                    const beforeLastNewline = newContent.lastIndexOf('\n', lastNewline - 1);
                    newContent = newContent.slice(0, beforeLastNewline + 1) +
                        domainLower + '\n' +
                        newContent.slice(beforeLastNewline + 1);
                    addedDomain = true;
                }
                inWhitelistSection = false;
            }
        }

        // If no sections found, just append to end
        if (!addedDomain) {
            if (!currentContent.includes('## WHITELIST')) {
                newContent = '## WHITELIST\n' + domainLower + '\n\n' + currentContent;
            } else {
                // Add after ## WHITELIST line
                newContent = currentContent.replace(
                    '## WHITELIST\n',
                    `## WHITELIST\n${domainLower}\n`
                );
            }
        }

        // Commit the change
        const commitMessage = `Add ${domain} to whitelist (approved request)`;
        await updateFile(filePath, newContent.trim() + '\n', commitMessage, sha);

        return {
            success: true,
            message: `Domain ${domain} added to ${groupId}`
        };

    } catch (error) {
        console.error('Error adding domain to whitelist:', error);
        return {
            success: false,
            message: error.message || 'Failed to add domain to whitelist'
        };
    }
}

/**
 * List available whitelist files in repository
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function listWhitelistFiles() {
    try {
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const branch = process.env.GITHUB_BRANCH || 'main';

        const endpoint = `/repos/${owner}/${repo}/contents/?ref=${branch}`;
        const response = await githubRequest('GET', endpoint);

        // Filter for .txt files
        return response
            .filter(item => item.type === 'file' && item.name.endsWith('.txt'))
            .map(item => ({
                name: item.name.replace('.txt', ''),
                path: item.path
            }));

    } catch (error) {
        console.error('Error listing whitelist files:', error);
        return [];
    }
}

/**
 * Check if a domain exists in a whitelist file
 * @param {string} domain - Domain to check
 * @param {string} groupId - Group/file name (e.g., 'informatica-3')
 * @returns {Promise<boolean>}
 */
async function isDomainInWhitelist(domain, groupId) {
    try {
        const filePath = `${groupId}.txt`;
        const file = await getFileContent(filePath);

        const lines = file.content.split('\n');
        const domainLower = domain.toLowerCase().trim();

        return lines.some(line => {
            const trimmed = line.trim().toLowerCase();
            // Match exact domain or wildcard
            return trimmed === domainLower ||
                trimmed === `*.${domainLower}` ||
                (trimmed.startsWith('*.') && domainLower.endsWith(trimmed.slice(1)));
        });
    } catch (error) {
        // File doesn't exist or other error
        console.error(`Error checking domain in whitelist: ${error.message}`);
        return false;
    }
}

module.exports = {
    getFileContent,
    updateFile,
    addDomainToWhitelist,
    listWhitelistFiles,
    isDomainInWhitelist
};
