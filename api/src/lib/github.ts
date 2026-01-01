/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * GitHub API client for pushing approved domains to whitelist files
 */

import https from 'node:https';
import { logger } from './logger.js';

// =============================================================================
// Constants
// =============================================================================

const GITHUB_API = 'api.github.com';

// GitHub username/repo validation regex:
// - 1-39 chars for username, alphanumeric and single hyphens (not at start/end)
// - 1-100 chars for repo, alphanumeric, hyphens, underscores, dots
const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * Validates GitHub owner and repo configuration.
 * Prevents path traversal attacks and validates format.
 * @returns Object containing validated owner, repo, and branch
 * @throws {Error} if validation fails
 */
function validateGitHubConfig(): { owner: string; repo: string; branch: string } {
    const owner = process.env.GITHUB_OWNER ?? '';
    const repo = process.env.GITHUB_REPO ?? '';
    const branch = process.env.GITHUB_BRANCH ?? 'main';

    if (owner === '') {
        throw new Error('GITHUB_OWNER not configured');
    }

    if (repo === '') {
        throw new Error('GITHUB_REPO not configured');
    }

    // Validate owner format (prevents path traversal like '../../../etc')
    if (!GITHUB_OWNER_REGEX.test(owner)) {
        throw new Error(`Invalid GITHUB_OWNER format: ${owner}`);
    }

    // Validate repo format
    if (!GITHUB_REPO_REGEX.test(repo)) {
        throw new Error(`Invalid GITHUB_REPO format: ${repo}`);
    }

    // Validate branch (no path traversal)
    if (branch.includes('..') || branch.includes('/')) {
        throw new Error(`Invalid GITHUB_BRANCH format: ${branch}`);
    }

    return { owner, repo, branch };
}

// =============================================================================
// Types
// =============================================================================

interface GitHubFileResponse {
    content: string;
    sha: string;
    type: string;
}

interface GitHubListItem {
    type: string;
    name: string;
    path: string;
}

interface GitHubRequestBody {
    message: string;
    content: string;
    branch: string;
    sha?: string;
}

export interface WhitelistFile {
    name: string;
    path: string;
}

interface AddDomainResult {
    success: boolean;
    message: string;
}

export interface BlockedCheckResult {
    blocked: boolean;
    matchedRule: string | null;
}

// =============================================================================
// GitHub API Functions
// =============================================================================

/**
 * Make a request to the GitHub API.
 * 
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param endpoint - API endpoint (starting with /)
 * @param body - Optional request body
 * @returns Promise resolving to the response data
 * @throws {Error} If GITHUB_TOKEN is not configured or API request fails
 */
function githubRequest<T>(
    method: string,
    endpoint: string,
    body: GitHubRequestBody | null = null
): Promise<T> {
    return new Promise((resolve, reject) => {
        const token = process.env.GITHUB_TOKEN;

        if (token === undefined || token === '') {
            reject(new Error('GITHUB_TOKEN not configured'));
            return;
        }

        const options: https.RequestOptions = {
            hostname: GITHUB_API,
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'openpath-api/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk: Buffer | string) => { data += String(chunk); });
            res.on('end', () => {
                try {
                    const json = (data !== '' ? JSON.parse(data) : {}) as unknown;

                    if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json as T);
                    } else {
                        const message = (json as { message?: string }).message ?? `HTTP ${String(res.statusCode)}`;
                        reject(new Error(message));
                    }
                } catch {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);

        if (body !== null) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Retrieves the content and SHA of a file from the configured GitHub repository.
 *
 * @param filePath - Path to the file within the repository (e.g., "grupo-a.txt")
 * @returns Promise resolving to an object containing the file content as string and its SHA hash
 * @throws {Error} When GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO are not configured
 * @throws {Error} When the path is not a file (e.g., it's a directory)
 * @throws {Error} When the GitHub API request fails
 * @example
 * ```typescript
 * const { content, sha } = await getFileContent('grupo-1.txt');
 * console.log('Current SHA:', sha);
 * console.log('Content:', content);
 * ```
 */
export async function getFileContent(filePath: string): Promise<{ content: string; sha: string }> {
    const { owner, repo, branch } = validateGitHubConfig();

    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;

    const response = await githubRequest<GitHubFileResponse>('GET', endpoint);

    if (response.type !== 'file') {
        throw new Error('Path is not a file');
    }

    const content = Buffer.from(response.content, 'base64').toString('utf-8');

    return {
        content,
        sha: response.sha
    };
}

/**
 * Updates or creates a file in the configured GitHub repository.
 *
 * @param filePath - Path to the file within the repository
 * @param content - New content for the file (UTF-8 string)
 * @param message - Git commit message
 * @param sha - SHA of the existing file (required for updates, null for new files)
 * @returns Promise resolving to the GitHub API response
 * @throws {Error} When GitHub configuration is invalid
 * @throws {Error} When the GitHub API request fails (e.g., conflict, auth failure)
 * @example
 * ```typescript
 * // Update existing file
 * const { sha } = await getFileContent('grupo-1.txt');
 * await updateFile('grupo-1.txt', 'new content\n', 'Update whitelist', sha);
 *
 * // Create new file
 * await updateFile('grupo-new.txt', '## WHITELIST\n', 'Create new group', null);
 * ```
 */
export async function updateFile(
    filePath: string,
    content: string,
    message: string,
    sha: string | null = null
): Promise<unknown> {
    const { owner, repo, branch } = validateGitHubConfig();

    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;

    const body: GitHubRequestBody = {
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch
    };

    if (sha !== null && sha !== '') {
        body.sha = sha;
    }

    return githubRequest('PUT', endpoint, body);
}

/**
 * Adds a domain to the whitelist file for a specific group.
 *
 * The domain is added to the ## WHITELIST section of the group's file.
 * If the file doesn't exist, it will be created with the proper structure.
 * If the domain already exists (including wildcard variants), the operation is skipped.
 *
 * @param domain - Domain to add (e.g., "example.com")
 * @param groupId - Group identifier that maps to a whitelist file (e.g., "grupo-1" -> "grupo-1.txt")
 * @returns Promise resolving to a result object with success status and message
 * @example
 * ```typescript
 * const result = await addDomainToWhitelist('github.com', 'grupo-1');
 * if (result.success) {
 *     console.log('Domain added:', result.message);
 * } else {
 *     console.log('Failed:', result.message);
 * }
 * ```
 */
export async function addDomainToWhitelist(
    domain: string,
    groupId: string
): Promise<AddDomainResult> {
    try {
        const filePath = `${groupId}.txt`;

        let currentContent = '';
        let sha: string | null = null;

        try {
            const file = await getFileContent(filePath);
            currentContent = file.content;
            sha = file.sha;
        } catch {
            logger.info('Whitelist file not found, creating new', { filePath });
        }

        const lines = currentContent.split('\n');
        const domainLower = domain.toLowerCase().trim();

        const exists = lines.some((line) => {
            const trimmed = line.trim().toLowerCase();
            return trimmed === domainLower || trimmed === `*.${domainLower}`;
        });

        if (exists) {
            return {
                success: false,
                message: `Domain ${domain} already exists in ${groupId}`
            };
        }

        let newContent = '';
        let addedDomain = false;
        let inWhitelistSection = false;

        for (const line of lines) {
            newContent += line + '\n';

            if (line.trim() === '## WHITELIST') {
                inWhitelistSection = true;
            } else if (line.startsWith('## ') && inWhitelistSection) {
                if (!addedDomain) {
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

        if (!addedDomain) {
            if (!currentContent.includes('## WHITELIST')) {
                newContent = '## WHITELIST\n' + domainLower + '\n\n' + currentContent;
            } else {
                newContent = currentContent.replace(
                    '## WHITELIST\n',
                    `## WHITELIST\n${domainLower}\n`
                );
            }
        }

        const commitMessage = `Add ${domain} to whitelist (approved request)`;
        await updateFile(filePath, newContent.trim() + '\n', commitMessage, sha);

        return {
            success: true,
            message: `Domain ${domain} added to ${groupId}`
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add domain to whitelist';
        logger.error('Error adding domain to whitelist', { domain, groupId, error: error instanceof Error ? error.message : String(error) });
        return {
            success: false,
            message
        };
    }
}

/**
 * List all whitelist files in the repository.
 * Scans the repository for .txt files that are not blocked-subdomains.txt or blocked-paths.txt.
 * 
 * @returns Promise resolving to array of whitelist files with name and path
 */
export async function listWhitelistFiles(): Promise<WhitelistFile[]> {
    try {
        const { owner, repo, branch } = validateGitHubConfig();

        const endpoint = `/repos/${owner}/${repo}/contents/?ref=${branch}`;
        const response = await githubRequest<GitHubListItem[]>('GET', endpoint);

        return response
            .filter((item) => item.type === 'file' && item.name.endsWith('.txt'))
            .map((item) => ({
                name: item.name.replace('.txt', ''),
                path: item.path
            }));

    } catch (error) {
        logger.error('Error listing whitelist files', { error: error instanceof Error ? error.message : String(error) });
        return [];
    }
}

/**
 * Check if a domain is blocked by global blocklists.
 * Checks against blocked-subdomains.txt.
 * 
 * @param domain - Domain to check
 * @returns Promise resolving to block result with status and matched rule
 */
export async function isDomainBlocked(domain: string): Promise<BlockedCheckResult> {
    try {
        const file = await getFileContent('blocked-subdomains.txt');
        const lines = file.content.split('\n');
        const domainLower = domain.toLowerCase().trim();

        for (const line of lines) {
            const trimmed = line.trim().toLowerCase();

            if (trimmed === '' || trimmed.startsWith('#')) continue;

            if (trimmed === domainLower) {
                return { blocked: true, matchedRule: trimmed };
            }

            if (domainLower.endsWith('.' + trimmed)) {
                return { blocked: true, matchedRule: trimmed };
            }

            if (trimmed.startsWith('*.')) {
                const baseDomain = trimmed.slice(2);
                if (domainLower === baseDomain || domainLower.endsWith('.' + baseDomain)) {
                    return { blocked: true, matchedRule: trimmed };
                }
            }
        }

        return { blocked: false, matchedRule: null };
    } catch {
        logger.debug('No blocked-subdomains.txt found, no domains blocked');
        return { blocked: false, matchedRule: null };
    }
}

export default {
    getFileContent,
    updateFile,
    addDomainToWhitelist,
    listWhitelistFiles,
    isDomainBlocked
};
