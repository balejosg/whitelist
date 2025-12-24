/**
 * Schedules API Client
 * Handles classroom schedule/reservation management for the OpenPath SPA
 */

const SchedulesAPI = {
    /**
     * Get API base URL
     * @returns {string}
     */
    getApiUrl() {
        return window.RequestsAPI?.apiUrl || localStorage.getItem('openpath_api_url') || '';
    },

    /**
     * Get auth headers using the Auth module
     * @returns {Object}
     */
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (window.Auth && window.Auth.getAccessToken()) {
            headers['Authorization'] = `Bearer ${window.Auth.getAccessToken()}`;
        }
        return headers;
    },

    // =========================================================================
    // Classroom Schedules
    // =========================================================================

    /**
     * Get all schedules for a classroom
     * @param {string} classroomId
     * @returns {Promise<Object>} { success, classroom, schedules }
     */
    async getClassroomSchedules(classroomId) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}`, {
            headers: this.getHeaders()
        });
        return response.json();
    },

    /**
     * Get the current active schedule for a classroom
     * @param {string} classroomId
     * @returns {Promise<Object>} { success, current_schedule, active_group_id }
     */
    async getCurrentSchedule(classroomId) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/classroom/${classroomId}/current`, {
            headers: this.getHeaders()
        });
        return response.json();
    },

    // =========================================================================
    // My Schedules (Teacher)
    // =========================================================================

    /**
     * Get all schedules for the current user
     * @returns {Promise<Object>} { success, schedules }
     */
    async getMySchedules() {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/my`, {
            headers: this.getHeaders()
        });
        return response.json();
    },

    // =========================================================================
    // CRUD Operations
    // =========================================================================

    /**
     * Create a new schedule (reservation)
     * @param {Object} scheduleData
     * @returns {Promise<Object>}
     */
    async createSchedule(scheduleData) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(scheduleData)
        });
        return response.json();
    },

    /**
     * Update a schedule
     * @param {string} id
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async updateSchedule(id, updates) {
        const response = await fetch(`${this.getApiUrl()}/api/schedules/${id}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(updates)
        });
        return response.json();
    },

    /**
     * Delete a schedule
     * @param {string} id
     * @returns {Promise<Object>}
     */
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

    /**
     * Day of week names (1-indexed, Monday=1)
     */
    DAY_NAMES: ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    DAY_NAMES_SHORT: ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'],

    /**
     * Generate time slots for a day (helper for UI grid)
     * @param {string} startHour - "08:00"
     * @param {string} endHour - "15:00"
     * @param {number} intervalMinutes - 60
     * @returns {Array<{start: string, end: string}>}
     */
    generateTimeSlots(startHour = '08:00', endHour = '15:00', intervalMinutes = 60) {
        const slots = [];
        let [h, m] = startHour.split(':').map(Number);
        const [endH, endM] = endHour.split(':').map(Number);

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

    /**
     * Find schedule for a specific day/time slot
     * @param {Array} schedules
     * @param {number} dayOfWeek
     * @param {string} startTime
     * @param {string} endTime
     * @returns {Object|null}
     */
    findScheduleForSlot(schedules, dayOfWeek, startTime, endTime) {
        return schedules.find(s =>
            s.day_of_week === dayOfWeek &&
            s.start_time === startTime &&
            s.end_time === endTime
        ) || null;
    },

    /**
     * Check if a slot overlaps with any existing schedule
     * @param {Array} schedules
     * @param {number} dayOfWeek
     * @param {string} startTime
     * @param {string} endTime
     * @returns {Object|null} Conflicting schedule or null
     */
    findConflict(schedules, dayOfWeek, startTime, endTime) {
        const timeToMinutes = (time) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const start = timeToMinutes(startTime);
        const end = timeToMinutes(endTime);

        return schedules.find(s => {
            if (s.day_of_week !== dayOfWeek) return false;
            const sStart = timeToMinutes(s.start_time);
            const sEnd = timeToMinutes(s.end_time);
            return start < sEnd && sStart < end;
        }) || null;
    }
};

// Make available globally
window.SchedulesAPI = SchedulesAPI;
