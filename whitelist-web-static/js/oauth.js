/**
 * OAuth Manager
 * Handles GitHub OAuth flow for whitelist SPA
 */
const OAuth = {
    // Will be set after worker deployment
    WORKER_URL: 'https://whitelist-oauth.YOUR_SUBDOMAIN.workers.dev',

    STORAGE_KEY: 'whitelist-oauth-token',

    /**
     * Start OAuth login flow - redirects to worker
     */
    login() {
        window.location.href = `${this.WORKER_URL}/auth/login`;
    },

    /**
     * Handle OAuth callback - parse token from URL hash
     */
    handleCallback() {
        const hash = window.location.hash.substring(1);
        if (!hash) return null;

        const params = new URLSearchParams(hash);

        // Check for errors
        const error = params.get('error');
        if (error) {
            console.error('OAuth error:', error);
            return { error };
        }

        // Get token
        const accessToken = params.get('access_token');
        if (accessToken) {
            this.saveToken(accessToken);
            // Clear hash from URL
            history.replaceState(null, '', window.location.pathname);
            return { token: accessToken };
        }

        return null;
    },

    /**
     * Save token to localStorage
     */
    saveToken(token) {
        localStorage.setItem(this.STORAGE_KEY, token);
    },

    /**
     * Get saved token
     */
    getToken() {
        return localStorage.getItem(this.STORAGE_KEY);
    },

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.getToken();
    },

    /**
     * Logout - clear token
     */
    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem('whitelist-spa-config');
    },

    /**
     * Get current user info from GitHub
     */
    async getUser() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                }
                return null;
            }

            return response.json();
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    },

    /**
     * Check user's permission level on a repository
     * Returns: 'admin', 'write', 'read', or null
     */
    async getRepoPermission(owner, repo) {
        const token = this.getToken();
        if (!token) return null;

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            // Check permissions object
            if (data.permissions) {
                if (data.permissions.admin) return 'admin';
                if (data.permissions.push) return 'write';
                if (data.permissions.pull) return 'read';
            }

            return 'read'; // Default for public repos
        } catch (error) {
            console.error('Error checking permissions:', error);
            return null;
        }
    },

    /**
     * Check if user can write to repo
     */
    async canWrite(owner, repo) {
        const permission = await this.getRepoPermission(owner, repo);
        return permission === 'admin' || permission === 'write';
    }
};
