import { Auth } from './auth.js';
/**
 * Requests API Client
 * Handles communication with the home server request API
 */
export const RequestsAPI = {
    apiUrl: '',
    _config: {
        adminToken: '',
        timeout: 10000
    },
    init(url, token) {
        this.apiUrl = url?.replace(/\/$/, '') || '';
        this._config.adminToken = token || '';
    },
    isConfigured() {
        return !!this.apiUrl && !!this._config.adminToken;
    },
    async request(method, endpoint, body = null) {
        if (!this.apiUrl) {
            throw new Error('Request API URL not configured');
        }
        const url = `${this.apiUrl}${endpoint}`;
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
                if (data.code) {
                    return data;
                }
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            return data;
        }
        catch (error) {
            console.error('RequestsAPI.request failed:', error);
            throw error;
        }
    },
    async getRequests(status) {
        const query = status ? `?status=${status}` : '';
        return this.request('GET', `/api/requests${query}`);
    },
    async getPendingRequests() {
        return this.getRequests('pending');
    },
    async healthCheck() {
        if (!this.apiUrl)
            return false;
        try {
            await fetch(`${this.apiUrl}/api/health`, { method: 'GET' });
            return true;
        }
        catch {
            return false;
        }
    },
    async createRequest(data) {
        return this.request('POST', '/api/requests', data);
    },
    async approveRequest(id, groupId, _token) {
        // Token is handled by Auth.fetch usually
        return this.request('POST', `/api/requests/${id}/approve`, { group_id: groupId });
    },
    async rejectRequest(id, reason, _token) {
        return this.request('POST', `/api/requests/${id}/reject`, { reason: reason || '' });
    },
    async deleteRequest(id) {
        return this.request('DELETE', `/api/requests/${id}`);
    }
};
//# sourceMappingURL=requests-api.js.map