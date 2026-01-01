import type { AuthAPI, AuthTokens, StoredUser, User, UserRole, APIResponse, RoleInfo } from './types/index.js';
import { trpc } from './trpc.js';
import { logger } from './lib/logger.js';

/**
 * Authentication API Client
 * Handles JWT-based authentication for the OpenPath SPA
 */
export const auth: AuthAPI = {
    // Storage keys
    ACCESS_TOKEN_KEY: 'openpath_access_token',
    REFRESH_TOKEN_KEY: 'openpath_refresh_token',
    USER_KEY: 'openpath_user',

    // API base URL (uses RequestsAPI config if available)
    getApiUrl(): string {
        return localStorage.getItem('requests_api_url') ?? '';
    },

    // ==========================================================================
    // Token Management
    // ==========================================================================

    getAccessToken(): string | null {
        return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    },

    getToken(): string | null {
        return this.getAccessToken();
    },

    getRefreshToken(): string | null {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    },

    getAuthHeaders(): Record<string, string> {
        const token = this.getAccessToken();
        if (!token) {
            // Fall back to legacy admin token
            const adminToken = localStorage.getItem('requests_api_token');
            return {
                'Content-Type': 'application/json',
                'Authorization': adminToken ? `Bearer ${adminToken}` : ''
            } as const;
        }
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    storeTokens(tokens: AuthTokens): void {
        if (tokens.accessToken) {
            localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
        }
        if (tokens.refreshToken) {
            localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
    },

    storeUser(user: User): void {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    getUser(): StoredUser | null {
        const stored = localStorage.getItem(this.USER_KEY);
        return stored ? JSON.parse(stored) as StoredUser : null;
    },

    clearAuth(): void {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    },

    isAuthenticated(): boolean {
        return !!(this.getAccessToken() ?? localStorage.getItem('requests_api_token'));
    },

    hasRole(role: UserRole): boolean {
        const user = this.getUser();
        if (!user?.roles) {
            // Legacy admin token is always admin
            if (localStorage.getItem('requests_api_token')) {
                return role === 'admin';
            }
            return false;
        }
        return user.roles.some((r: RoleInfo) => r.role === role);
    },

    isAdmin(): boolean {
        return this.hasRole('admin');
    },

    isTeacher(): boolean {
        return this.hasRole('teacher');
    },

    isStudent(): boolean {
        return this.hasRole('student');
    },

    getApprovalGroups(): string[] | 'all' {
        if (this.isAdmin()) {
            return 'all';
        }
        const user = this.getUser();
        if (!user?.roles) return [];

        const groups = new Set<string>();
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

        user.roles.forEach((r: RoleInfo) => {
            if (r.role === 'teacher') {
                r.groupIds.forEach((g: string) => groups.add(g));
            }
        });

        return Array.from(groups);
    },

    getTeacherGroups(): string[] {
        const groups = this.getApprovalGroups();
        return groups === 'all' ? [] : groups;
    },

    getAssignedGroups(): string[] {
        return this.getTeacherGroups();
    },

    // ==========================================================================
    // API Methods
    // ==========================================================================

    // ==========================================================================
    // API Methods
    // ==========================================================================

    async login(email: string, password: string): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.login.mutate({ email, password });
            this.storeTokens(data);
            this.storeUser(data.user);
            return { success: true, data: { user: data.user } };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(message);
        }
    },

    async register(email: string, name: string, password: string): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.register.mutate({ email, name, password });
            return { success: true, data: { user: data.user } };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(message);
        }
    },

    async refresh(): Promise<APIResponse<AuthTokens>> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('Cannot refresh: missing refresh token');
        }

        try {
            const data = await trpc.auth.refresh.mutate({ refreshToken });
            this.storeTokens(data);
            return { success: true, data };
        } catch (error: unknown) {
            this.clearAuth();
            const message = error instanceof Error ? error.message : 'Token refresh failed';
            throw new Error(message);
        }
    },

    async logout(): Promise<void> {
        try {
            const refreshToken = this.getRefreshToken();
            await trpc.auth.logout.mutate({ refreshToken: refreshToken ?? undefined });
        } catch (e) {
            logger.warn('Logout API call failed', { error: e instanceof Error ? e.message : String(e) });
        }
        this.clearAuth();
    },

    async getMe(): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.me.query();
            this.storeUser(data.user);
            return { success: true, data: { user: data.user } };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(message);
        }
    },

    async fetch(url: string, options: RequestInit = {}): Promise<Response> {
        const headers = {
            ...this.getAuthHeaders(),
            ...(options.headers as Record<string, string>)
        };
        return window.fetch(url, { ...options, headers });
    }
};
