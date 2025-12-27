import { Auth } from './auth.js';
/**
 * OpenPath - Classroom API Client
 * Handles communication with the classroom management API endpoints
 */
export const ClassroomsAPI = {
    /**
     * Get the API base URL from auth module
     */
    getBaseUrl() {
        return Auth.getApiUrl();
    },
    /**
     * Get authorization headers
     */
    getHeaders() {
        return Auth.getAuthHeaders();
    },
    /**
     * List all classrooms
     */
    async listClassrooms() {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return data.classrooms;
    },
    /**
     * Get classroom details with machines
     */
    async getClassroom(classroomId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return data.classroom;
    },
    /**
     * Create a new classroom
     */
    async createClassroom(classroomData) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(classroomData)
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return data.classroom;
    },
    /**
     * Update classroom
     */
    async updateClassroom(classroomId, updates) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(updates)
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return data.classroom;
    },
    /**
     * Set active group for a classroom
     */
    async setActiveGroup(classroomId, groupId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}/active-group`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify({ group_id: groupId })
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return {
            classroom: data.classroom,
            currentGroupId: data.current_group_id
        };
    },
    /**
     * Delete a classroom
     */
    async deleteClassroom(classroomId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
    },
    /**
     * Remove a machine from a classroom
     */
    async removeMachine(hostname) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/machines/${hostname}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
    },
    /**
     * Get classroom statistics
     */
    async getStats() {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/stats`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success)
            throw new Error(data.error);
        return data.stats;
    }
};
//# sourceMappingURL=classrooms-api.js.map