/**
 * Requests API Client
 * Handles communication with the home server request API
 */

const RequestsAPI = {
    // Configuration (can be overridden)
    config: {
        baseUrl: '', // Will be set from user config
        adminToken: '',
        timeout: 10000
    },

    /**
     * Initialize with config
     */
    init(baseUrl, adminToken) {
        this.config.baseUrl = baseUrl?.replace(/\/$/, '') || '';
        this.config.adminToken = adminToken || '';
    },

    /**
     * Check if API is configured
     */
    isConfigured() {
        return !!this.config.baseUrl && !!this.config.adminToken;
    },

    /**
     * Make authenticated request to the API
     */
    async request(method, endpoint, body = null) {
        if (!this.config.baseUrl) {
            throw new Error('Request API URL not configured');
        }

        const url = `${this.config.baseUrl}${endpoint}`;

        // Use Auth.fetch if Auth module is available
        if (window.Auth) {
            try {
                const response = await Auth.fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: body ? JSON.stringify(body) : null
                });

                const data = await response.json();

                if (!response.ok) {
                    // For specific error codes, return the data instead of throwing
                    // This allows the UI to handle special cases like DOMAIN_BLOCKED
                    if (data.code) {
                        return data; // Return the error response with code
                    }
                    throw new Error(data.error || `HTTP ${response.status}`);
                }

                return data;
            } catch (error) {
                console.error('RequestsAPI.request failed:', error);
                throw error;
            }
        }

        // Fallback for when Auth is not available (initialization/legacy)
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.config.adminToken) {
            headers['Authorization'] = `Bearer ${this.config.adminToken}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : null,
                signal: controller.signal
            });

            clearTimeout(timeout);

            const data = await response.json();

            if (!response.ok) {
                // For specific error codes, return the data instead of throwing
                if (data.code) {
                    return data; // Return the error response with code
                }
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            clearTimeout(timeout);

            if (error.name === 'AbortError') {
                throw new Error('Request timeout - server not responding');
            }
            throw error;
        }
    },

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await this.request('GET', '/health');
            return response.status === 'ok';
        } catch {
            return false;
        }
    },

    /**
     * Get all pending requests
     */
    async getPendingRequests() {
        return this.request('GET', '/api/requests?status=pending');
    },

    /**
     * Get all requests
     */
    async getAllRequests() {
        return this.request('GET', '/api/requests');
    },

    /**
     * Get request statistics
     */
    async getStats() {
        const response = await this.request('GET', '/api/requests');
        return response.stats || { total: 0, pending: 0, approved: 0, rejected: 0 };
    },

    /**
     * Approve a request
     */
    async approveRequest(requestId, groupId = null) {
        const body = groupId ? { group_id: groupId } : {};
        return this.request('POST', `/api/requests/${requestId}/approve`, body);
    },

    /**
     * Reject a request
     */
    async rejectRequest(requestId, reason = '') {
        return this.request('POST', `/api/requests/${requestId}/reject`, { reason });
    },

    /**
     * Delete a request
     */
    async deleteRequest(requestId) {
        return this.request('DELETE', `/api/requests/${requestId}`);
    },

    /**
     * Get available groups from home server
     */
    async getGroups() {
        return this.request('GET', '/api/requests/groups/list');
    }
};

// Export for use in app.js
window.RequestsAPI = RequestsAPI;
