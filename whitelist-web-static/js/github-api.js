/**
 * GitHub REST API Client
 * Handles all interactions with GitHub API for file operations
 */
class GitHubAPI {
    constructor(token, owner, repo, branch = 'main') {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.branch = branch;
        this.baseUrl = 'https://api.github.com';
    }

    /**
     * Make authenticated request to GitHub API
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const message = error.message || `Error ${response.status}`;
            throw new Error(message);
        }

        return response.json();
    }

    /**
     * Validate token by getting user info
     */
    async validateToken() {
        return this.request('/user');
    }

    /**
     * Get file content from repository
     * Returns { content, sha } where content is decoded
     */
    async getFileContent(path) {
        const data = await this.request(
            `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`
        );

        if (data.type !== 'file') {
            throw new Error('El path no es un archivo');
        }

        // Decode base64 content
        const content = atob(data.content.replace(/\n/g, ''));
        return { content, sha: data.sha };
    }

    /**
     * List files in a directory
     */
    async listFiles(path = '') {
        const data = await this.request(
            `/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`
        );

        if (!Array.isArray(data)) {
            throw new Error('El path no es un directorio');
        }

        return data.filter(item => item.type === 'file');
    }

    /**
     * Create or update a file in the repository
     */
    async updateFile(path, content, message, sha = null) {
        const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}`;

        // If no sha provided, try to get it (for updates)
        if (!sha) {
            try {
                const existing = await this.getFileContent(path);
                sha = existing.sha;
            } catch {
                // File doesn't exist, sha will be null (create new)
            }
        }

        const body = {
            message,
            content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
            branch: this.branch
        };

        if (sha) {
            body.sha = sha;
        }

        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    /**
     * Delete a file from the repository
     */
    async deleteFile(path, message, sha) {
        const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}`;

        return this.request(endpoint, {
            method: 'DELETE',
            body: JSON.stringify({
                message,
                sha,
                branch: this.branch
            })
        });
    }

    /**
     * Get raw file URL for dnsmasq clients
     */
    getRawUrl(path) {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
    }
}
