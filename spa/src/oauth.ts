import type { OAuthCallbackResult, User } from './types/index.js';
import { logger } from './lib/logger.js';

/**
 * OAuth Manager
 * Handles GitHub OAuth flow for OpenPath SPA
 */

// Default OAuth worker URL (can be overridden via localStorage)
const DEFAULT_OAUTH_WORKER_URL = 'https://openpath-oauth.bruno-alejosgomez.workers.dev';

export const OAuth = {
    // OAuth worker URL - configurable via localStorage for custom deployments
    // Override by setting localStorage.setItem('openpath-oauth-worker', 'https://your-worker.example.com')
    get WORKER_URL(): string {
        return localStorage.getItem('openpath-oauth-worker') ?? DEFAULT_OAUTH_WORKER_URL;
    },

    // Storage key for OAuth token
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
            logger.error('OAuth error', { error });
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
        // Clear saved config (owner/repo) since it may contain user-specific settings
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

            return await response.json() as User;
        } catch (error) {
            logger.error('Error getting user', { error: error instanceof Error ? error.message : String(error) });
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

            const data = await response.json() as { permissions?: { admin: boolean; push: boolean } };
            if (data.permissions) {
                return data.permissions.admin || data.permissions.push;
            }
            return false;
        } catch {
            return false;
        }
    }
};
