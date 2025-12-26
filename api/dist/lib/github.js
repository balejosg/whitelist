/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * GitHub API client for pushing approved domains to whitelist files
 */
import https from 'node:https';
// =============================================================================
// Constants
// =============================================================================
const GITHUB_API = 'api.github.com';
// =============================================================================
// GitHub API Functions
// =============================================================================
function githubRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const token = process.env.GITHUB_TOKEN;
        if (token === undefined || token === '') {
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
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    }
                    else {
                        const message = json.message ?? `HTTP ${res.statusCode}`;
                        reject(new Error(message));
                    }
                }
                catch {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });
        req.on('error', reject);
        if (body !== undefined) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
export async function getFileContent(filePath) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH ?? 'main';
    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`;
    const response = await githubRequest('GET', endpoint);
    if (response.type !== 'file') {
        throw new Error('Path is not a file');
    }
    const content = Buffer.from(response.content, 'base64').toString('utf-8');
    return {
        content,
        sha: response.sha
    };
}
export async function updateFile(filePath, content, message, sha = null) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH ?? 'main';
    const endpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
    const body = {
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch
    };
    if (sha !== null && sha !== '') {
        body.sha = sha;
    }
    return githubRequest('PUT', endpoint, body);
}
export async function addDomainToWhitelist(domain, groupId) {
    try {
        const filePath = `${groupId}.txt`;
        let currentContent = '';
        let sha = null;
        try {
            const file = await getFileContent(filePath);
            currentContent = file.content;
            sha = file.sha;
        }
        catch {
            console.log(`File ${filePath} not found, creating new`);
        }
        const lines = currentContent.split('\n');
        const domainLower = domain.toLowerCase().trim();
        const exists = lines.some((line) => {
            const trimmed = line.trim().toLowerCase();
            return trimmed === domainLower || trimmed === `*.${domainLower}`;
        });
        if (exists === true) {
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
            }
            else if (line.startsWith('## ') && inWhitelistSection) {
                if (addedDomain === false) {
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
        if (addedDomain === false) {
            if (currentContent.includes('## WHITELIST') === false) {
                newContent = '## WHITELIST\n' + domainLower + '\n\n' + currentContent;
            }
            else {
                newContent = currentContent.replace('## WHITELIST\n', `## WHITELIST\n${domainLower}\n`);
            }
        }
        const commitMessage = `Add ${domain} to whitelist (approved request)`;
        await updateFile(filePath, newContent.trim() + '\n', commitMessage, sha);
        return {
            success: true,
            message: `Domain ${domain} added to ${groupId}`
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add domain to whitelist';
        console.error('Error adding domain to whitelist:', error);
        return {
            success: false,
            message
        };
    }
}
export async function listWhitelistFiles() {
    try {
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const branch = process.env.GITHUB_BRANCH ?? 'main';
        const endpoint = `/repos/${owner}/${repo}/contents/?ref=${branch}`;
        const response = await githubRequest('GET', endpoint);
        return response
            .filter((item) => item.type === 'file' && item.name.endsWith('.txt'))
            .map((item) => ({
            name: item.name.replace('.txt', ''),
            path: item.path
        }));
    }
    catch (error) {
        console.error('Error listing whitelist files:', error);
        return [];
    }
}
export async function isDomainInWhitelist(domain, groupId) {
    try {
        const filePath = `${groupId}.txt`;
        const file = await getFileContent(filePath);
        const lines = file.content.split('\n');
        const domainLower = domain.toLowerCase().trim();
        return lines.some((line) => {
            const trimmed = line.trim().toLowerCase();
            return trimmed === domainLower ||
                trimmed === `*.${domainLower}` ||
                (trimmed.startsWith('*.') && domainLower.endsWith(trimmed.slice(1)));
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error checking domain in whitelist: ${message}`);
        return false;
    }
}
export async function isDomainBlocked(domain) {
    try {
        const file = await getFileContent('blocked-subdomains.txt');
        const lines = file.content.split('\n');
        const domainLower = domain.toLowerCase().trim();
        for (const line of lines) {
            const trimmed = line.trim().toLowerCase();
            if (trimmed === '' || trimmed.startsWith('#'))
                continue;
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
    }
    catch {
        console.log('No blocked-subdomains.txt found, no domains blocked');
        return { blocked: false, matchedRule: null };
    }
}
export default {
    getFileContent,
    updateFile,
    addDomainToWhitelist,
    listWhitelistFiles,
    isDomainInWhitelist,
    isDomainBlocked
};
//# sourceMappingURL=github.js.map