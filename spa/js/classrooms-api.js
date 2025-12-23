/**
 * OpenPath - Classroom API Client
 * Handles communication with the classroom management API endpoints
 */

const ClassroomsAPI = {
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
        const token = Auth.getAccessToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    /**
     * List all classrooms
     * @returns {Promise<Array>}
     */
    async listClassrooms() {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classrooms;
    },

    /**
     * Get classroom details with machines
     * @param {string} classroomId 
     * @returns {Promise<Object>}
     */
    async getClassroom(classroomId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classroom;
    },

    /**
     * Create a new classroom
     * @param {Object} classroomData - { name, display_name, default_group_id }
     * @returns {Promise<Object>}
     */
    async createClassroom(classroomData) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(classroomData)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classroom;
    },

    /**
     * Update classroom
     * @param {string} classroomId 
     * @param {Object} updates - { display_name, default_group_id }
     * @returns {Promise<Object>}
     */
    async updateClassroom(classroomId, updates) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(updates)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classroom;
    },

    /**
     * Set active group for a classroom
     * @param {string} classroomId 
     * @param {string|null} groupId - null to reset to default
     * @returns {Promise<Object>}
     */
    async setActiveGroup(classroomId, groupId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}/active-group`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify({ group_id: groupId })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return {
            classroom: data.classroom,
            currentGroupId: data.current_group_id
        };
    },

    /**
     * Delete a classroom
     * @param {string} classroomId 
     * @returns {Promise<void>}
     */
    async deleteClassroom(classroomId) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
    },

    /**
     * Remove a machine from a classroom
     * @param {string} hostname 
     * @returns {Promise<void>}
     */
    async removeMachine(hostname) {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/machines/${hostname}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
    },

    /**
     * Get classroom statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/stats`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.stats;
    }
};

// Make it globally available
window.ClassroomsAPI = ClassroomsAPI;
