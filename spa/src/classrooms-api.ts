import { Auth } from './auth.js';
import type { Classroom, ClassroomStats } from './types/index.js';

/**
 * OpenPath - Classroom API Client
 * Handles communication with the classroom management API endpoints
 */
export const ClassroomsAPI = {
    /**
     * Get the API base URL from auth module
     */
    getBaseUrl(): string {
        return Auth.getApiUrl();
    },

    /**
     * Get authorization headers
     */
    getHeaders(): Record<string, string> {
        return Auth.getAuthHeaders();
    },

    /**
     * List all classrooms
     */
    async listClassrooms(): Promise<Classroom[]> {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classrooms;
    },

    /**
     * Get classroom details with machines
     */
    async getClassroom(classroomId: string): Promise<Classroom> {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.classroom;
    },

    /**
     * Create a new classroom
     */
    async createClassroom(classroomData: { name: string; display_name?: string; default_group_id?: string }): Promise<Classroom> {
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
     */
    async updateClassroom(classroomId: string, updates: { display_name?: string; default_group_id?: string }): Promise<Classroom> {
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
     */
    async setActiveGroup(classroomId: string, groupId: string | null): Promise<{ classroom: Classroom; currentGroupId: string | null }> {
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
     */
    async deleteClassroom(classroomId: string): Promise<void> {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/${classroomId}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
    },

    /**
     * Remove a machine from a classroom
     */
    async removeMachine(hostname: string): Promise<void> {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/machines/${hostname}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
    },

    /**
     * Get classroom statistics
     */
    async getStats(): Promise<ClassroomStats> {
        const response = await fetch(`${this.getBaseUrl()}/api/classrooms/stats`, {
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.stats;
    }
};
