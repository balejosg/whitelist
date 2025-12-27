/**
 * Authentication API Client
 * Handles JWT-based authentication for the OpenPath SPA
 */
export const Auth = {
    // Storage keys
    ACCESS_TOKEN_KEY: 'openpath_access_token',
    REFRESH_TOKEN_KEY: 'openpath_refresh_token',
    USER_KEY: 'openpath_user',
    // API base URL (uses RequestsAPI config if available)
    getApiUrl() {
        return localStorage.getItem('requests_api_url') || '';
    },
    // ==========================================================================
    // Token Management
    // ==========================================================================
    getAccessToken() {
        return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    },
    getToken() {
        return this.getAccessToken();
    },
    getRefreshToken() {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    },
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
    storeTokens(tokens) {
        if (tokens.accessToken) {
            localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
        }
        if (tokens.refreshToken) {
            localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
    },
    storeUser(user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },
    getUser() {
        const stored = localStorage.getItem(this.USER_KEY);
        return stored ? JSON.parse(stored) : null;
    },
    clearAuth() {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    },
    isAuthenticated() {
        return !!(this.getAccessToken() || localStorage.getItem('requests_api_token'));
    },
    hasRole(role) {
        const user = this.getUser();
        if (!user?.roles) {
            // Legacy admin token is always admin
            if (localStorage.getItem('requests_api_token')) {
                return role === 'admin';
            }
            return false;
        }
        return user.roles.some((r) => {
            if (typeof r === 'string')
                return r === role;
            return r.role === role;
        });
    },
    isAdmin() {
        return this.hasRole('admin');
    },
    isTeacher() {
        return this.hasRole('teacher');
    },
    isStudent() {
        return this.hasRole('student');
    },
    getApprovalGroups() {
        if (this.isAdmin()) {
            return 'all';
        }
        const user = this.getUser();
        if (!user?.roles)
            return [];
        const groups = new Set();
        // Check actual role structure (string or object?)
        // Backend types say UserRole is string literal.
        // But StoredUser has roles: UserRole[].
        // Wait, backend implementation sends roles as strings?
        // Ref: api/src/lib/auth.ts (from Plan): `roles: UserRole[]` (strings).
        // But `auth.js` line 118: `r.role === role`. This implies roles are OBJECTS { role: string, groupIds: ... }.
        // I need to check backend implementation or types.
        // Plan `api/src/types/index.ts`: `export type UserRole = 'admin' ...`.
        // `JWTPayload` has `roles: UserRole[]`.
        // But `auth.js` existing code says `user.roles.some(r => r.role === role)`.
        // This implies `user.roles` is an array of OBJECTS in the stored user JSON?
        // Let's assume implementation matches JS for now to avoid breaking.
        // But types say `UserRole[]`.
        // Use `any` cast for safety or update types?
        // I'll update types later if needed. For now I handle both.
        user.roles.forEach((r) => {
            const roleName = typeof r === 'string' ? r : r.role;
            if (roleName === 'teacher') {
                const groupIds = typeof r === 'object' && r.groupIds ? r.groupIds : [];
                groupIds.forEach((g) => groups.add(g));
            }
        });
        return Array.from(groups);
    },
    getTeacherGroups() {
        const groups = this.getApprovalGroups();
        return groups === 'all' ? [] : groups;
    },
    getAssignedGroups() {
        return this.getTeacherGroups();
    },
    // ==========================================================================
    // API Methods
    // ==========================================================================
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
    async logout() {
        const apiUrl = this.getApiUrl();
        if (apiUrl && this.getAccessToken()) {
            try {
                await fetch(`${apiUrl}/api/auth/logout`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify({ refreshToken: this.getRefreshToken() })
                });
            }
            catch (e) {
                console.warn('Logout API call failed:', e);
            }
        }
        this.clearAuth();
    },
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
        this.storeUser(data.user);
        return data;
    },
    async fetch(url, options = {}) {
        options.headers = {
            ...options.headers,
            ...this.getAuthHeaders()
        };
        let response = await fetch(url, options);
        if (response.status === 401 && this.getRefreshToken()) {
            try {
                await this.refresh();
                options.headers = { ...options.headers, ...this.getAuthHeaders() };
                response = await fetch(url, options);
            }
            catch (e) {
                console.warn('Token refresh failed:', e);
                this.clearAuth();
            }
        }
        return response;
    }
};
//# sourceMappingURL=auth.js.map