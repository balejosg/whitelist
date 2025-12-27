import { Auth } from './auth.js';
import { RequestsAPI } from './requests-api.js';
import type { Schedule, ScheduleSlot } from './types/index.js';

/**
 * Schedules API Client
 * Handles classroom schedule/reservation management for the OpenPath SPA
 */
export const SchedulesAPI = {
    /**
     * Get API base URL
     */
    getApiUrl(): string {
        return RequestsAPI?.apiUrl ?? localStorage.getItem('openpath_api_url') ?? '';
    },

    /**
     * Get auth headers using the Auth module
     */
    getHeaders(): Record<string, string> {
        return Auth.getAuthHeaders();
    },

    // =========================================================================
    // Classroom Schedules
    // =========================================================================

    async getClassroomSchedules(classroomId: string): Promise<{ success: boolean; schedules: Schedule[] }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}`, {
            headers: this.getHeaders()
        });
        return response.json() as Promise<{ success: boolean; schedules: Schedule[] }>;
    },

    async getCurrentSchedule(classroomId: string): Promise<{ success: boolean; current_schedule: Schedule | null; active_group_id: string | null }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}/current`, {
            headers: this.getHeaders()
        });
        return response.json() as Promise<{ success: boolean; current_schedule: Schedule | null; active_group_id: string | null }>;
    },

    // =========================================================================
    // My Schedules (Teacher)
    // =========================================================================

    async getMySchedules(): Promise<{ success: boolean; schedules: Schedule[] }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/my`, {
            headers: this.getHeaders()
        });
        return response.json() as Promise<{ success: boolean; schedules: Schedule[] }>;
    },

    // =========================================================================
    // CRUD Operations
    // =========================================================================

    async createSchedule(scheduleData: Partial<Schedule>): Promise<{ success: boolean; schedule: Schedule }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(scheduleData)
        });
        return response.json() as Promise<{ success: boolean; schedule: Schedule }>;
    },

    async updateSchedule(id: string, updates: Partial<Schedule>): Promise<{ success: boolean; schedule: Schedule }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/${id}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(updates)
        });
        return response.json() as Promise<{ success: boolean; schedule: Schedule }>;
    },

    async deleteSchedule(id: string): Promise<{ success: boolean }> {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        return response.json() as Promise<{ success: boolean }>;
    },

    // =========================================================================
    // Utilities
    // =========================================================================

    DAY_NAMES: ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    DAY_NAMES_SHORT: ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'],

    generateTimeSlots(startHour = '08:00', endHour = '15:00', intervalMinutes = 60): ScheduleSlot[] {
        const slots: ScheduleSlot[] = [];
        const startParts = startHour.split(':').map(Number);
        let h = startParts[0] ?? 0;
        let m = startParts[1] ?? 0;

        const endParts = endHour.split(':').map(Number);
        const endH = endParts[0] ?? 0;
        const endM = endParts[1] ?? 0;

        while (h < endH || (h === endH && m < endM)) {
            const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            m += intervalMinutes;
            if (m >= 60) {
                h += Math.floor(m / 60);
                m = m % 60;
            }
            const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            slots.push({ start, end });
        }

        return slots;
    },

    findScheduleForSlot(schedules: Schedule[], dayOfWeek: number, startTime: string, endTime: string): Schedule | null {
        return schedules.find(s =>
            s.day_of_week === dayOfWeek &&
            s.start_time === startTime &&
            s.end_time === endTime
        ) ?? null;
    },

    findConflict(schedules: Schedule[], dayOfWeek: number, startTime: string, endTime: string): Schedule | null {
        const timeToMinutes = (time: string) => {
            const parts = time.split(':').map(Number);
            const h = parts[0] ?? 0;
            const m = parts[1] ?? 0;
            return h * 60 + m;
        };

        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);

        return schedules.find(s => {
            if (s.day_of_week !== dayOfWeek) return false;
            const sStart = timeToMinutes(s.start_time);
            const sEnd = timeToMinutes(s.end_time);
            return start < sEnd && sStart < end;
        }) ?? null;
    }
};
