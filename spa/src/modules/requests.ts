import { state } from './state.js';
import { relativeTime, escapeHtml, showToast } from '../utils.js';
import { RequestsAPI } from '../requests-api.js';
import { Auth } from '../auth.js';
// import type { DomainRequest } from '../types/index.js';

// Initialize requests section
export async function initRequestsSection(): Promise<void> {
    // Load saved config
    const savedUrl = localStorage.getItem('requests_api_url') ?? '';
    const savedToken = localStorage.getItem('requests_api_token') ?? '';

    const urlInput = document.getElementById('requests-api-url') as HTMLInputElement;
    const tokenInput = document.getElementById('requests-api-token') as HTMLInputElement;

    if (urlInput) urlInput.value = savedUrl;
    if (tokenInput) tokenInput.value = savedToken;

    if (savedUrl && savedToken) {
        RequestsAPI.init(savedUrl, savedToken);
        await checkRequestsServerStatus();
        await loadPendingRequests();
    }

    // Show requests section
    const section = document.getElementById('requests-section');
    if (section) section.classList.remove('hidden');
}

// Check server status
export async function checkRequestsServerStatus(): Promise<boolean> {
    const statusEl = document.getElementById('requests-server-status');
    if (!statusEl) return false;

    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = statusEl.querySelector('.status-text');

    if (!dotEl || !textEl) return false;

    if (!RequestsAPI.isConfigured()) {
        dotEl.className = 'status-dot offline';
        textEl.textContent = 'No configurado';
        return false;
    }

    try {
        const isOnline = await RequestsAPI.healthCheck();

        if (isOnline) {
            dotEl.className = 'status-dot online';
            textEl.textContent = 'Conectado';
            return true;
        } else {
            dotEl.className = 'status-dot offline';
            textEl.textContent = 'Disconnected';
            return false;
        }
    } catch {
        dotEl.className = 'status-dot offline';
        textEl.textContent = 'Error';
        return false;
    }
}

// Load pending requests
export async function loadPendingRequests(): Promise<void> {
    const listEl = document.getElementById('requests-list');
    const statEl = document.getElementById('stat-pending-requests');
    if (!listEl || !statEl) return;

    if (!RequestsAPI.isConfigured() && !Auth.isAuthenticated()) {
        listEl.innerHTML = '<p class="empty-message">Configure the server URL or log in to see requests</p>';
        statEl.textContent = '—';
        return;
    }

    try {
        const response = await RequestsAPI.getPendingRequests();
        const requests = response.requests ?? [];

        // Update stat card
        statEl.textContent = requests.length.toString();

        // Highlight if there are pending requests
        const cardEl = document.getElementById('stat-requests-card');
        if (cardEl) {
            if (requests.length > 0) {
                cardEl.classList.add('has-pending');
            } else {
                cardEl.classList.remove('has-pending');
            }
        }

        if (requests.length === 0) {
            listEl.innerHTML = '<p class="empty-message success">No hay solicitudes pendientes</p>';
            return;
        }

        const isTeacher = Auth.isTeacher();
        const isAdmin = Auth.isAdmin() || state.canEdit;
        const teacherGroups = Auth.getTeacherGroups();

        listEl.innerHTML = requests.map(req => {
            const canApprove = isAdmin || (isTeacher && teacherGroups.includes(req.group_id));

            // If teacher, only show groups they are assigned to in the select
            const availableGroupsForSelect = isAdmin
                ? state.allGroups.map(g => g.name)
                : state.allGroups.map(g => g.name).filter(name => teacherGroups.includes(name));

            return `
                <div class="request-item ${!canApprove ? 'read-only' : ''}" data-id="${req.id}">
                    <div class="request-info">
                        <span class="request-domain">${escapeHtml(req.domain)}</span>
                        <span class="request-time">${relativeTime(req.created_at)}</span>
                        <span class="request-meta">
                            ${escapeHtml(req.requester_email ?? 'Anonymous')} •
                            <span class="request-reason">${escapeHtml(req.reason)}</span>
                        </span>
                        ${req.group_id ? `<span class="request-group-tag">Grupo: ${escapeHtml(req.group_id)}</span>` : ''}
                    </div>
                    <div class="request-actions">
                        ${canApprove ? `
                            <select class="request-group-select">
                                <option value="" disabled selected>Seleccionar grupo...</option>
                                ${availableGroupsForSelect.map(g => `<option value="${g}" ${req.group_id === g ? 'selected' : ''}>${g}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm btn-success request-approve-btn" onclick="window.approveRequest('${req.id}', this)">✓ Aprobar</button>
                            <button class="btn btn-sm btn-danger request-reject-btn" onclick="window.rejectRequest('${req.id}')">✗ Rechazar</button>
                        ` : '<span class="status-badge">Solo lectura</span>'}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading requests:', err);
        if (err instanceof Error) {
            listEl.innerHTML = `<p class="error-message">Error cargando solicitudes: ${err.message}</p>`;
        }
    }
}

// Global actions
declare global {
    interface Window {
        approveRequest: (id: string, btn: HTMLElement) => Promise<void>;
        rejectRequest: (id: string) => Promise<void>;
    }
}

window.approveRequest = async (id: string, btn: HTMLElement) => {
    const item = btn.closest('.request-item');
    if (!item) return;

    const select = item.querySelector('.request-group-select') as HTMLSelectElement;
    const groupId = select.value;

    if (!groupId) {
        showToast('Selecciona un grupo primero', 'error');
        return;
    }

    try {
        await RequestsAPI.approveRequest(id, groupId, Auth.getToken() ?? undefined);
        showToast('Solicitud aprobada');
        item.remove();
        void loadPendingRequests(); // Refresh count
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error aprobando: ' + err.message, 'error');
        }
    }
};

window.rejectRequest = async (id: string) => {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // Cancelled

    try {
        await RequestsAPI.rejectRequest(id, reason ?? '', Auth.getToken() ?? undefined);
        showToast('Solicitud rechazada');
        const itemEl = document.querySelector(`.request-item[data-id="${id}"]`);
        if (itemEl) itemEl.remove();
        void loadPendingRequests(); // Refresh count
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error rechazando: ' + err.message, 'error');
        }
    }
};
