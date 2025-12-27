/**
 * Classroom Management Module
 * Handles CRUD operations for classrooms and their group assignments
 */

import { state } from './state.js';
import { Auth } from '../auth.js';
import { ClassroomsAPI } from '../classrooms-api.js';
import { showToast, escapeHtml } from '../utils.js';
import { openModal, closeModal } from './ui.js';
import type { Classroom } from '../types/index.js';

let allClassrooms: Classroom[] = [];

/**
 * Load classrooms from the API
 */
export async function loadClassrooms(): Promise<void> {
    const section = document.getElementById('classrooms-section');
    const listEl = document.getElementById('classrooms-list');

    // Only show for admins
    if (!Auth.isAdmin() && !state.canEdit) {
        section?.classList.add('hidden');
        return;
    }

    section?.classList.remove('hidden');

    try {
        allClassrooms = await ClassroomsAPI.listClassrooms();
        renderClassroomsList();
    } catch (error) {
        if (listEl && error instanceof Error) {
            listEl.innerHTML = `<p class="empty-message error">Error: ${escapeHtml(error.message)}</p>`;
        }
    }
}

/**
 * Render the list of classrooms
 */
export function renderClassroomsList(): void {
    const listEl = document.getElementById('classrooms-list');
    if (!listEl) return;

    if (allClassrooms.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <p>No classrooms configured</p>
                <button class="btn btn-primary" onclick="window.openNewClassroomModal()">Create first classroom</button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = allClassrooms.map(c => `
        <div class="classroom-card" data-id="${c.id}">
            <div class="classroom-info">
                <h3>🏫 ${escapeHtml(c.display_name || c.name)}</h3>
                <p>${c.machines ? c.machines.length : 0} computers</p>
            </div>
            <div class="classroom-group">
                <label>Active group:</label>
                <select class="active-group-select" onchange="window.changeClassroomGroup('${c.id}', this.value)">
                    <option value="">-- Default: ${escapeHtml(c.default_group_id ?? 'none')} --</option>
                    ${state.allGroups.map(g => `
                        <option value="${g.name}" ${c.active_group_id === g.name ? 'selected' : ''}>${g.name}</option>
                    `).join('')}
                </select>
            </div>
            <div class="classroom-actions">
                <button class="btn btn-ghost btn-icon" onclick="window.deleteClassroom('${c.id}')" title="Delete classroom">🗑️</button>
            </div>
        </div>
    `).join('');
}

/**
 * Change the active group for a classroom
 */
export async function changeClassroomGroup(classroomId: string, groupId: string): Promise<void> {
    try {
        await ClassroomsAPI.setActiveGroup(classroomId, groupId || null);
        showToast(groupId ? `Active group: ${groupId}` : 'Using default group');
        await loadClassrooms();
    } catch (error) {
        if (error instanceof Error) {
            showToast('Error: ' + error.message, 'error');
            void loadClassrooms(); // Reload to reset select
        }
    }
}

/**
 * Delete a classroom
 */
export async function deleteClassroom(classroomId: string): Promise<void> {
    if (!confirm('Delete this classroom and unlink all its machines?')) return;
    try {
        await ClassroomsAPI.deleteClassroom(classroomId);
        showToast('Classroom deleted');
        await loadClassrooms();
    } catch (error) {
        if (error instanceof Error) {
            showToast('Error: ' + error.message, 'error');
        }
    }
}

/**
 * Initialize classroom management event listeners
 */
export function initClassroomListeners(): void {
    // New Classroom button (handled via window function now for modal consistency or listener)
    // Actually the button in HTML might trigger this. 
    // The renderClassroomsList uses window.openNewClassroomModal

    // New Classroom Form
    document.getElementById('new-classroom-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        const nameInput = document.getElementById('new-classroom-name') as HTMLInputElement | null;
        const groupInput = document.getElementById('new-classroom-default-group') as HTMLSelectElement | null;

        if (!nameInput || !groupInput) return;

        const name = nameInput.value;
        const defaultGroupId = groupInput.value;

        try {
            await ClassroomsAPI.createClassroom({
                name,
                display_name: name,
                default_group_id: defaultGroupId || undefined
            });
            closeModal('modal-new-classroom');
            (document.getElementById('new-classroom-form') as HTMLFormElement | null)?.reset();
            showToast('Classroom created');
            await loadClassrooms();
        } catch (error) {
            if (error instanceof Error) {
                showToast('Error: ' + error.message, 'error');
            }
        }
    })());
}


// Export for global window access (and declaration in window.d.ts if needed)
// BUT since we are modules, we should attach them to window in a specific initialization file, OR keep doing it here.
// I'll attach here to maintain compatibility with HTML onClick handlers.

declare global {
    interface Window {
        openNewClassroomModal: () => void;
        changeClassroomGroup: (classroomId: string, groupId: string) => Promise<void>;
        deleteClassroom: (classroomId: string) => Promise<void>;
    }
}

function openNewClassroomModal() {
    // Populate groups dropdown
    const select = document.getElementById('new-classroom-default-group');
    if (select) {
        select.innerHTML = '<option value="">-- Select group --</option>' +
            state.allGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    }
    openModal('modal-new-classroom');
}

window.openNewClassroomModal = openNewClassroomModal;
window.changeClassroomGroup = changeClassroomGroup;
window.deleteClassroom = deleteClassroom;
