import type { GitHubAPIInstance, GitHubFile } from './types/index.js';

/**
 * GitHub REST API Client
 * Handles all interactions with GitHub API for file operations
 */
export class GitHubAPI implements GitHubAPIInstance {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    baseUrl: string;

    constructor(token: string, owner: string, repo: string, branch = 'main') {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.branch = branch;
        this.baseUrl = 'https://api.github.com';
    }

    /**
     * Make authenticated request to GitHub API
     */
    async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const headers: HeadersInit = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers as Record<string, string>
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const error = (await response.json().catch(() => ({}))) as { message?: string };
            const message = error.message ?? `Error ${String(response.status)}`;
            throw new Error(message);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Validate token by getting user info
     */
    async validateToken(): Promise<unknown> {
        return this.request('/user');
    }

    /**
     * Get file content from repository
     * Returns { content, sha } where content is decoded
     */
    async getFile(path: string): Promise<GitHubFile | null> {
        try {
            const data = await this.request<{ type: string; content: string; sha: string; encoding: string }>(
                `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`
            );

            if (data.type !== 'file') {
                throw new Error('El path no es un archivo');
            }

            // Decode base64 content (handles newlines)
            const content = atob(data.content.replace(/\n/g, ''));
            return { path, content, sha: data.sha, encoding: data.encoding };
        } catch (error) {
            console.error('Error getting file:', error);
            return null; // Interface expects null on failure?
        }
    }

    /**
     * Update file in repository
     */
    async updateFile(path: string, content: string, message: string, sha: string): Promise<boolean> {
        const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}`;

        // Base64 encode content (UTF-8 safe)
        // Note: btoa only handles ASCII. Used "unescape(encodeURIComponent(str))" trick in JS.
        // In TS/modern environments, explicit encoding is better, but browser support matters.
        // Use TextEncoder/Decoder for UTF-8 safety instead of deprecated unescape
        // but for browser compatibility with raw strings:
        const binaryString = Array.from(new TextEncoder().encode(content))
            .map(byte => String.fromCharCode(byte))
            .join('');
        const encodedContent = btoa(binaryString);

        const body = {
            message,
            content: encodedContent,
            branch: this.branch,
            sha: sha || undefined
        };

        try {
            await this.request(endpoint, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            return true;
        } catch (error) {
            console.error('Error updating file:', error);
            return false;
        }
    }

    /**
     * List files in directory
     */
    /**
     * List files in directory with details
     */
    async listFiles(path: string): Promise<{ name: string; path: string; sha: string }[]> {
        try {
            const data = await this.request<{ type: string; name: string; path: string; sha: string }[]>(
                `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`
            );

            if (!Array.isArray(data)) {
                return [];
            }

            return data
                .filter(item => item.type === 'file')
                .map(item => ({
                    name: item.name,
                    path: item.path,
                    sha: item.sha
                }));
        } catch (error) {
            console.error('Error listing files:', error);
            return [];
        }
    }

    /**
     * Get raw URL for file
     */
    getRawUrl(path: string): string {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
    }

    /**
     * Delete file
     */
    async deleteFile(path: string, message: string, sha: string): Promise<boolean> {
        const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}`;
        const body = {
            message,
            sha,
            branch: this.branch
        };

        try {
            await this.request(endpoint, {
                method: 'DELETE',
                body: JSON.stringify(body)
            });
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    // Legacy mapping or specific usage in groups.ts might expect this
    async listDirectory(path: string): Promise<string[]> {
        const files = await this.listFiles(path);
        return files.map(f => f.name);
    }
}
