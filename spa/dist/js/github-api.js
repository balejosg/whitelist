/**
 * GitHub REST API Client
 * Handles all interactions with GitHub API for file operations
 */
export class GitHubAPI {
    token;
    owner;
    repo;
    branch;
    baseUrl;
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
    async getFile(path) {
        try {
            const data = await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`);
            if (data.type !== 'file') {
                throw new Error('El path no es un archivo');
            }
            // Decode base64 content (handles newlines)
            const content = atob(data.content.replace(/\n/g, ''));
            return { path, content, sha: data.sha, encoding: data.encoding };
        }
        catch (error) {
            console.error('Error getting file:', error);
            return null; // Interface expects null on failure?
        }
    }
    /**
     * Update file in repository
     */
    async updateFile(path, content, message, sha) {
        const endpoint = `/repos/${this.owner}/${this.repo}/contents/${path}`;
        // Base64 encode content (UTF-8 safe)
        // Note: btoa only handles ASCII. Used "unescape(encodeURIComponent(str))" trick in JS.
        // In TS/modern environments, explicit encoding is better, but browser support matters.
        const encodedContent = btoa(unescape(encodeURIComponent(content)));
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
        }
        catch (error) {
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
    async listFiles(path) {
        try {
            const data = await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`);
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
        }
        catch (error) {
            console.error('Error listing files:', error);
            return [];
        }
    }
    /**
     * Get raw URL for file
     */
    getRawUrl(path) {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
    }
    /**
     * Delete file
     */
    async deleteFile(path, message, sha) {
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
        }
        catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }
    // Legacy mapping or specific usage in groups.ts might expect this
    async listDirectory(path) {
        const files = await this.listFiles(path);
        return files.map(f => f.name);
    }
}
//# sourceMappingURL=github-api.js.map