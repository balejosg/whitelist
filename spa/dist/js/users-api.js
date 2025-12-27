import { Auth } from './auth.js';
/**
 * Users API Client
 * Admin-only user and role management
 */
export const UsersAPI = {
    // ==========================================================================
    // Helper
    // ==========================================================================
    getApiUrl() {
        return localStorage.getItem('requests_api_url') || '';
    },
    async request(endpoint, options = {}) {
        const apiUrl = this.getApiUrl();
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }
        const url = `${apiUrl}${endpoint}`;
        const response = await Auth.fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        return data;
    },
    // ==========================================================================
    // User CRUD
    // ==========================================================================
    async list() {
        return this.request('/api/users');
    },
    async get(userId) {
        return this.request(`/api/users/${userId}`);
    },
    async create(userData) {
        return this.request('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },
    async update(userId, updates) {
        return this.request(`/api/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },
    async delete(userId) {
        return this.request(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    },
    // ==========================================================================
    // Role Management
    // ==========================================================================
    async getRoles(userId) {
        return this.request(`/api/users/${userId}/roles`);
    },
    async assignRole(userId, role, groupIds = []) {
        return this.request(`/api/users/${userId}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role, groupIds })
        });
    },
    async updateRole(userId, roleId, updates) {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },
    async revokeRole(userId, roleId) {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'DELETE'
        });
    },
    async listTeachers() {
        return this.request('/api/users/roles/teachers');
    }
};
//# sourceMappingURL=users-api.js.map