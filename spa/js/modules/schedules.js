/**
 * Schedules Module
 * Weekly schedule grid for classroom reservations
 */

const SchedulesModule = {
    currentClassroomId: null,
    schedules: [],
    groups: [],

    // Time configuration
    START_HOUR: '08:00',
    END_HOUR: '15:00',
    SLOT_MINUTES: 60,

    /**
     * Initialize the schedules module
     * @param {string} classroomId
     */
    async init(classroomId) {
        this.currentClassroomId = classroomId;
        await this.loadGroups();
        await this.loadSchedules();
        this.render();
    },

    /**
     * Load available groups for the teacher
     */
    async loadGroups() {
        // Get groups from global state (already loaded by app)
        if (window.App && window.App.groups) {
            this.groups = window.App.groups;
        } else {
            // Fallback: fetch groups
            try {
                const response = await fetch(`${window.RequestsAPI?.apiUrl || ''}/api/requests/groups/list`, {
                    headers: window.Auth?.getAuthHeaders() || {}
                });
                const data = await response.json();
                this.groups = data.success ? data.groups : [];
            } catch (e) {
                console.error('Failed to load groups:', e);
                this.groups = [];
            }
        }
    },

    /**
     * Load schedules for current classroom
     */
    async loadSchedules() {
        if (!this.currentClassroomId) {
            this.schedules = [];
            return;
        }

        const result = await window.SchedulesAPI.getClassroomSchedules(this.currentClassroomId);
        if (result.success) {
            this.schedules = result.schedules;
        } else {
            console.error('Failed to load schedules:', result.error);
            this.schedules = [];
        }
    },

    /**
     * Render the schedule grid
     */
    render() {
        const container = document.getElementById('schedule-grid-container');
        if (!container) return;

        const timeSlots = window.SchedulesAPI.generateTimeSlots(
            this.START_HOUR,
            this.END_HOUR,
            this.SLOT_MINUTES
        );

        // Build grid HTML
        let html = `
            <div class="schedule-grid">
                <div class="schedule-header">
                    <div class="schedule-time-header">Hora</div>
                    ${window.SchedulesAPI.DAY_NAMES.slice(1).map((day, i) =>
            `<div class="schedule-day-header">${day}</div>`
        ).join('')}
                </div>
                <div class="schedule-body">
        `;

        for (const slot of timeSlots) {
            html += `<div class="schedule-row">`;
            html += `<div class="schedule-time">${slot.start} - ${slot.end}</div>`;

            for (let day = 1; day <= 5; day++) {
                const schedule = this.findScheduleForSlot(day, slot.start, slot.end);
                html += this.renderCell(day, slot, schedule);
            }

            html += `</div>`;
        }

        html += `</div></div>`;

        // Groups legend
        html += this.renderGroupsLegend();

        container.innerHTML = html;
        this.attachEventListeners();
    },

    /**
     * Render a single grid cell
     */
    renderCell(dayOfWeek, slot, schedule) {
        if (schedule) {
            const group = this.groups.find(g => g.id === schedule.group_id);
            const groupName = group?.name || schedule.group_id;
            const canEdit = schedule.can_edit || schedule.is_mine;

            return `
                <div class="schedule-cell schedule-cell-occupied ${schedule.is_mine ? 'is-mine' : 'is-other'}"
                     data-schedule-id="${schedule.id}"
                     data-day="${dayOfWeek}"
                     data-start="${slot.start}"
                     data-end="${slot.end}"
                     title="${schedule.is_mine ? 'Mi reserva' : 'Ocupado'}">
                    <span class="schedule-group-name">${groupName}</span>
                    ${canEdit ? '<button class="schedule-delete-btn" title="Eliminar">×</button>' : ''}
                </div>
            `;
        }

        // Empty cell - clickable for creating schedule
        return `
            <div class="schedule-cell schedule-cell-empty"
                 data-day="${dayOfWeek}"
                 data-start="${slot.start}"
                 data-end="${slot.end}"
                 title="Clic para reservar">
                <span class="schedule-add-icon">+</span>
            </div>
        `;
    },

    /**
     * Render groups legend with colors
     */
    renderGroupsLegend() {
        // Get teacher's groups (filter if teacher role)
        const myGroups = window.Auth?.isAdmin()
            ? this.groups
            : this.groups.filter(g => {
                const teacherGroups = window.Auth?.getTeacherGroups() || [];
                return teacherGroups.includes(g.id);
            });

        if (myGroups.length === 0) {
            return '<p class="schedule-no-groups">No tienes grupos asignados para reservar.</p>';
        }

        return `
            <div class="schedule-legend">
                <strong>Mis grupos:</strong>
                ${myGroups.map(g => `
                    <span class="schedule-legend-item" data-group-id="${g.id}">
                        <span class="schedule-legend-color"></span>
                        ${g.name}
                    </span>
                `).join('')}
            </div>
        `;
    },

    /**
     * Find schedule for a specific slot
     */
    findScheduleForSlot(dayOfWeek, startTime, endTime) {
        return this.schedules.find(s =>
            s.day_of_week === dayOfWeek &&
            s.start_time === startTime &&
            s.end_time === endTime
        ) || null;
    },

    /**
     * Attach event listeners to grid
     */
    attachEventListeners() {
        const container = document.getElementById('schedule-grid-container');
        if (!container) return;

        // Click on empty cell to create
        container.querySelectorAll('.schedule-cell-empty').forEach(cell => {
            cell.addEventListener('click', (e) => this.handleCellClick(e));
        });

        // Click on delete button
        container.querySelectorAll('.schedule-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDeleteClick(e));
        });
    },

    /**
     * Handle click on empty cell
     */
    async handleCellClick(e) {
        const cell = e.currentTarget;
        const dayOfWeek = parseInt(cell.dataset.day);
        const startTime = cell.dataset.start;
        const endTime = cell.dataset.end;

        // Show group selection modal
        const groupId = await this.showGroupSelectionModal(dayOfWeek, startTime, endTime);
        if (!groupId) return;

        // Create schedule
        const result = await window.SchedulesAPI.createSchedule({
            classroom_id: this.currentClassroomId,
            group_id: groupId,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime
        });

        if (result.success) {
            window.showToast?.('Reserva creada', 'success');
            await this.loadSchedules();
            this.render();
        } else {
            window.showToast?.(result.error || 'Error al crear reserva', 'error');
        }
    },

    /**
     * Handle delete button click
     */
    async handleDeleteClick(e) {
        e.stopPropagation();
        const cell = e.target.closest('.schedule-cell');
        const scheduleId = cell.dataset.scheduleId;

        if (!confirm('Delete this reservation?')) return;

        const result = await window.SchedulesAPI.deleteSchedule(scheduleId);

        if (result.success) {
            window.showToast?.('Reserva eliminada', 'success');
            await this.loadSchedules();
            this.render();
        } else {
            window.showToast?.(result.error || 'Error al eliminar', 'error');
        }
    },

    /**
     * Show modal for group selection
     * @returns {Promise<string|null>} Selected group ID or null
     */
    showGroupSelectionModal(dayOfWeek, startTime, endTime) {
        return new Promise((resolve) => {
            const dayName = window.SchedulesAPI.DAY_NAMES[dayOfWeek];
            const myGroups = window.Auth?.isAdmin()
                ? this.groups
                : this.groups.filter(g => {
                    const teacherGroups = window.Auth?.getTeacherGroups() || [];
                    return teacherGroups.includes(g.id);
                });

            if (myGroups.length === 0) {
                window.showToast?.('No tienes grupos asignados', 'error');
                resolve(null);
                return;
            }

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Reservar ${dayName} ${startTime}-${endTime}</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <form id="schedule-group-form">
                        <div class="form-group">
                            <label>Selecciona grupo</label>
                            <select id="schedule-group-select" required>
                                <option value="">-- Seleccionar --</option>
                                ${myGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-ghost modal-cancel">Cancelar</button>
                            <button type="submit" class="btn btn-primary">Reservar</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            // Event handlers
            const close = () => {
                modal.remove();
                resolve(null);
            };

            modal.querySelector('.modal-close').addEventListener('click', close);
            modal.querySelector('.modal-cancel').addEventListener('click', close);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            modal.querySelector('#schedule-group-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const groupId = modal.querySelector('#schedule-group-select').value;
                modal.remove();
                resolve(groupId);
            });
        });
    }
};

// Make available globally
window.SchedulesModule = SchedulesModule;
