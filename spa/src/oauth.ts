import type { OAuthCallbackResult, User } from './types/index.js';

/**
 * OAuth Manager
 * Handles GitHub OAuth flow for OpenPath SPA
 */
export const OAuth = {
    // Cloudflare Worker URL for OAuth
    WORKER_URL: 'https://openpath-oauth.bruno-alejosgomez.workers.dev', // Move to config?
    // Using hardcoded for now matching JS.

    ACCESS_TOKEN_KEY: 'openpath-oauth-token', // Used 'STORAGE_KEY' in JS. Use variable or literal.

    // JS used 'STORAGE_KEY' property.
    STORAGE_KEY: 'openpath-oauth-token',

    login(): void {
        window.location.href = `${this.WORKER_URL}/auth/login`;
    },

    handleCallback(): OAuthCallbackResult | null {
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
            return { accessToken };
        }

        return null; // Return null if nothing meaningful found
    },

    saveToken(token: string): void {
        localStorage.setItem(this.STORAGE_KEY, token);
    },

    getToken(): string | null {
        return localStorage.getItem(this.STORAGE_KEY);
    },

    isLoggedIn(): boolean {
        return !!this.getToken();
    },

    logout(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        // Also remove config?
        localStorage.removeItem('openpath-spa-config');
    },

    async getUser(): Promise<User> {
        const token = this.getToken();
        if (!token) throw new Error('Not logged in');

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
                throw new Error('Failed to get user');
            }

            return response.json() as Promise<User>;
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    },

    async canWrite(owner: string, repo: string): Promise<boolean> {
        // Implement logic or reuse getRepoPermission helper (private)
        // JS had getRepoPermission.
        const token = this.getToken();
        if (!token) return false;

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

            if (!response.ok) return false;

            const data = await response.json();
            if (data.permissions) {
                return data.permissions.admin || data.permissions.push;
            }
            return false;
        } catch {
            return false;
        }
    }
};
