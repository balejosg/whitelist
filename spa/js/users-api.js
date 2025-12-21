/**
 * Users API Client
 * Admin-only user and role management
 */

const UsersAPI = {
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

    /**
     * List all users
     * @returns {Promise<Object>}
     */
    async list() {
        return this.request('/api/users');
    },

    /**
     * Get user by ID
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async get(userId) {
        return this.request(`/api/users/${userId}`);
    },

    /**
     * Create a new user
     * @param {Object} userData - { email, name, password, role?, groupIds? }
     * @returns {Promise<Object>}
     */
    async create(userData) {
        return this.request('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    /**
     * Update a user
     * @param {string} userId
     * @param {Object} updates - { name?, email?, isActive?, password? }
     * @returns {Promise<Object>}
     */
    async update(userId, updates) {
        return this.request(`/api/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },

    /**
     * Delete a user
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async delete(userId) {
        return this.request(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    },

    // ==========================================================================
    // Role Management
    // ==========================================================================

    /**
     * Get roles for a user
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async getRoles(userId) {
        return this.request(`/api/users/${userId}/roles`);
    },

    /**
     * Assign a role to a user
     * @param {string} userId
     * @param {string} role - 'admin', 'teacher', or 'student'
     * @param {Array<string>} groupIds - Groups for teacher role
     * @returns {Promise<Object>}
     */
    async assignRole(userId, role, groupIds = []) {
        return this.request(`/api/users/${userId}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role, groupIds })
        });
    },

    /**
     * Update groups for a role
     * @param {string} userId
     * @param {string} roleId
     * @param {Object} updates - { groupIds?, addGroups?, removeGroups? }
     * @returns {Promise<Object>}
     */
    async updateRole(userId, roleId, updates) {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
    },

    /**
     * Revoke a role
     * @param {string} userId
     * @param {string} roleId
     * @returns {Promise<Object>}
     */
    async revokeRole(userId, roleId) {
        return this.request(`/api/users/${userId}/roles/${roleId}`, {
            method: 'DELETE'
        });
    },

    /**
     * List all teachers
     * @returns {Promise<Object>}
     */
    async listTeachers() {
        return this.request('/api/users/roles/teachers');
    }
};

// Make available globally
window.UsersAPI = UsersAPI;
