import { Auth } from './auth.js';
import type { User, APIResponse, UserRole } from './types/index.js';

/**
 * Users API Client
 * Admin-only user and role management
 */
export const UsersAPI = {
    // ==========================================================================
    // Helper
    // ==========================================================================

    getApiUrl(): string {
        return localStorage.getItem('requests_api_url') || '';
    },

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const apiUrl = this.getApiUrl();
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const url = `${apiUrl}${endpoint}`;
        const response = await Auth.fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers as Record<string, string>
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data as T;
    },

    // ==========================================================================
    // User CRUD
    // ==========================================================================

    async list(): Promise<APIResponse<{ users: User[] }>> {
        return this.request('/api/users');
    },

    async get(userId: string): Promise<APIResponse<{ user: User }>> {
        return this.request(`/api/users/${userId}`);
    },

    async create(userData: Partial<User> & { password?: string }): Promise<APIResponse<{ user: User }>> {
        return this.request('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async update(userId: string, updates: Partial<User> & { password?: string }): Promise<APIResponse<{ user: User }>> {
        return this.request(`/api/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },

    async delete(userId: string): Promise<APIResponse<void>> {
        return this.request(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    },

    // ==========================================================================
    // Role Management
    // ==========================================================================

    async getRoles(userId: string): Promise<APIResponse<{ roles: UserRole[] }>> {
        return this.request(`/api/users/${userId}/roles`);
    },

    async assignRole(userId: string, role: string, groupIds: string[] = []): Promise<APIResponse<void>> {
        return this.request(`/api/users/${userId}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role, groupIds })
        });
    },

    async updateRole(userId: string, roleId: string, updates: any): Promise<APIResponse<void>> {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },

    async revokeRole(userId: string, roleId: string): Promise<APIResponse<void>> {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'DELETE'
        });
    },

    async listTeachers(): Promise<APIResponse<{ teachers: User[] }>> {
        return this.request('/api/users/roles/teachers');
    }
};
