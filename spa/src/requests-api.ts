import { Auth } from './auth.js';
import type { RequestsResponse, RequestStatus, APIResponse, DomainRequest } from './types/index.js';

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

    init(url: string, token?: string): void {
        this.apiUrl = url?.replace(/\/$/, '') || '';
        this._config.adminToken = token || '';
    },

    isConfigured(): boolean {
        return !!this.apiUrl && !!this._config.adminToken;
    },

    async request<T>(method: string, endpoint: string, body: unknown = null): Promise<T> {
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
                    return data as T;
                }
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data as T;
        } catch (error) {
            console.error('RequestsAPI.request failed:', error);
            throw error;
        }
    },

    async getRequests(status?: RequestStatus): Promise<RequestsResponse> {
        const query = status ? `?status=${status}` : '';
        return this.request<RequestsResponse>('GET', `/api/requests${query}`);
    },

    async getPendingRequests(): Promise<RequestsResponse> {
        return this.getRequests('pending');
    },

    async healthCheck(): Promise<boolean> {
        if (!this.apiUrl) return false;
        try {
            await fetch(`${this.apiUrl}/api/health`, { method: 'GET' });
            return true;
        } catch {
            return false;
        }
    },

    async createRequest(data: { domain: string; reason?: string }): Promise<APIResponse<DomainRequest>> {
        return this.request<APIResponse<DomainRequest>>('POST', '/api/requests', data);
    },

    async approveRequest(id: string, groupId?: string, _token?: string): Promise<APIResponse<DomainRequest>> {
        // Token is handled by Auth.fetch usually
        return this.request<APIResponse<DomainRequest>>('POST', `/api/requests/${id}/approve`, { group_id: groupId });
    },

    async rejectRequest(id: string, reason?: string, _token?: string): Promise<APIResponse<DomainRequest>> {
        return this.request<APIResponse<DomainRequest>>('POST', `/api/requests/${id}/reject`, { reason: reason || '' });
    },

    async deleteRequest(id: string): Promise<APIResponse<void>> {
        return this.request<APIResponse<void>>('DELETE', `/api/requests/${id}`);
    }
};
