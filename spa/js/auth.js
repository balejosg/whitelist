/**
 * Authentication API Client
 * Handles JWT-based authentication for the OpenPath SPA
 */

const Auth = {
    // Storage keys
    ACCESS_TOKEN_KEY: 'whitelist_access_token',
    REFRESH_TOKEN_KEY: 'whitelist_refresh_token',
    USER_KEY: 'whitelist_user',

    // API base URL (uses RequestsAPI config if available)
    getApiUrl() {
        return localStorage.getItem('requests_api_url') || '';
    },

    // ==========================================================================
    // Token Management
    // ==========================================================================

    /**
     * Get the current access token
     * @returns {string|null}
     */
    getAccessToken() {
        return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    },

    /**
     * Get the current refresh token
     * @returns {string|null}
     */
    getRefreshToken() {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    },

    /**
     * Get headers for authenticated requests
     * @returns {Object}
     */
    getAuthHeaders() {
        const token = this.getAccessToken();
        if (!token) {
            // Fall back to legacy admin token
            const adminToken = localStorage.getItem('requests_api_token');
            return {
                'Content-Type': 'application/json',
                'Authorization': adminToken ? `Bearer ${adminToken}` : ''
            };
        }
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    /**
     * Store tokens after login
     * @param {Object} tokens - { accessToken, refreshToken }
     */
    storeTokens(tokens) {
        if (tokens.accessToken) {
            localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
        }
        if (tokens.refreshToken) {
            localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
    },

    /**
     * Store user info
     * @param {Object} user
     */
    storeUser(user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    /**
     * Get stored user
     * @returns {Object|null}
     */
    getUser() {
        const stored = localStorage.getItem(this.USER_KEY);
        return stored ? JSON.parse(stored) : null;
    },

    /**
     * Clear all auth data
     */
    clearAuth() {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    },

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!(this.getAccessToken() || localStorage.getItem('requests_api_token'));
    },

    /**
     * Check if user has a specific role
     * @param {string} role - 'admin', 'teacher', or 'student'
     * @returns {boolean}
     */
    hasRole(role) {
        const user = this.getUser();
        if (!user || !user.roles) {
            // Legacy admin token is always admin
            if (localStorage.getItem('requests_api_token')) {
                return role === 'admin';
            }
            return false;
        }
        return user.roles.some(r => r.role === role);
    },

    /**
     * Check if user is admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.hasRole('admin');
    },

    /**
     * Check if user is teacher
     * @returns {boolean}
     */
    isTeacher() {
        return this.hasRole('teacher');
    },

    /**
     * Get groups user can approve for
     * @returns {Array<string>|'all'}
     */
    getApprovalGroups() {
        if (this.isAdmin()) {
            return 'all';
        }
        const user = this.getUser();
        if (!user || !user.roles) return [];

        const groups = new Set();
        user.roles
            .filter(r => r.role === 'teacher')
            .forEach(r => {
                (r.groupIds || []).forEach(g => groups.add(g));
            });
        return Array.from(groups);
    },

    // ==========================================================================
    // API Methods
    // ==========================================================================

    /**
     * Login with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>}
     */
    async login(email, password) {
        const apiUrl = this.getApiUrl();
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store tokens and user
        this.storeTokens(data);
        this.storeUser(data.user);

        return data;
    },

    /**
     * Register a new user
     * @param {Object} userData - { email, name, password }
     * @returns {Promise<Object>}
     */
    async register(email, name, password) {
        const apiUrl = this.getApiUrl();
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        return data;
    },

    /**
     * Refresh the access token
     * @returns {Promise<Object>}
     */
    async refresh() {
        const apiUrl = this.getApiUrl();
        const refreshToken = this.getRefreshToken();

        if (!apiUrl || !refreshToken) {
            throw new Error('Cannot refresh: missing API URL or refresh token');
        }

        const response = await fetch(`${apiUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (!response.ok) {
            this.clearAuth();
            throw new Error(data.error || 'Token refresh failed');
        }

        this.storeTokens(data);
        return data;
    },

    /**
     * Logout
     * @returns {Promise<void>}
     */
    async logout() {
        const apiUrl = this.getApiUrl();

        if (apiUrl && this.getAccessToken()) {
            try {
                await fetch(`${apiUrl}/api/auth/logout`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify({ refreshToken: this.getRefreshToken() })
                });
            } catch (e) {
                console.warn('Logout API call failed:', e);
            }
        }

        this.clearAuth();
    },

    /**
     * Get current user info from server
     * @returns {Promise<Object>}
     */
    async getMe() {
        const apiUrl = this.getApiUrl();
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/auth/me`, {
            headers: this.getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to get user info');
        }

        // Update stored user
        this.storeUser(data.user);
        return data.user;
    },

    /**
     * Make an authenticated API request with automatic token refresh
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<Response>}
     */
    async fetch(url, options = {}) {
        options.headers = {
            ...options.headers,
            ...this.getAuthHeaders()
        };

        let response = await fetch(url, options);

        // If 401, try refreshing token and retry
        if (response.status === 401 && this.getRefreshToken()) {
            try {
                await this.refresh();
                options.headers = this.getAuthHeaders();
                response = await fetch(url, options);
            } catch (e) {
                console.warn('Token refresh failed:', e);
                this.clearAuth();
            }
        }

        return response;
    }
};

// Make available globally
window.Auth = Auth;
