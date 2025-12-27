import { Auth } from './auth.js';
import { RequestsAPI } from './requests-api.js';
/**
 * Schedules API Client
 * Handles classroom schedule/reservation management for the OpenPath SPA
 */
export const SchedulesAPI = {
    /**
     * Get API base URL
     */
    getApiUrl() {
        return RequestsAPI?.apiUrl ?? localStorage.getItem('openpath_api_url') ?? '';
    },
    /**
     * Get auth headers using the Auth module
     */
    getHeaders() {
        return Auth.getAuthHeaders();
    },
    // =========================================================================
    // Classroom Schedules
    // =========================================================================
    async getClassroomSchedules(classroomId) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}`, {
            headers: this.getHeaders()
        });
        return response.json();
    },
    async getCurrentSchedule(classroomId) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}/current`, {
            headers: this.getHeaders()
        });
        return response.json();
    },
    // =========================================================================
    // My Schedules (Teacher)
    // =========================================================================
    async getMySchedules() {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/my`, {
            headers: this.getHeaders()
        });
        return response.json();
    },
    // =========================================================================
    // CRUD Operations
    // =========================================================================
    async createSchedule(scheduleData) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(scheduleData)
        });
        return response.json();
    },
    async updateSchedule(id, updates) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/${id}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(updates)
        });
        return response.json();
    },
    async deleteSchedule(id) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        return response.json();
    },
    // =========================================================================
    // Utilities
    // =========================================================================
    DAY_NAMES: ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    DAY_NAMES_SHORT: ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
    generateTimeSlots(startHour = '08:00', endHour = '15:00', intervalMinutes = 60) {
        const slots = [];
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
    findScheduleForSlot(schedules, dayOfWeek, startTime, endTime) {
        return schedules.find(s => s.day_of_week === dayOfWeek &&
            s.start_time === startTime &&
            s.end_time === endTime) ?? null;
    },
    findConflict(schedules, dayOfWeek, startTime, endTime) {
        const timeToMinutes = (time) => {
            const parts = time.split(':').map(Number);
            const h = parts[0] ?? 0;
            const m = parts[1] ?? 0;
            return h * 60 + m;
        };
        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);
        return schedules.find(s => {
            if (s.day_of_week !== dayOfWeek)
                return false;
            const sStart = timeToMinutes(s.start_time);
            const sEnd = timeToMinutes(s.end_time);
            return start < sEnd && sStart < end;
        }) ?? null;
    }
};
//# sourceMappingURL=schedules-api.js.map