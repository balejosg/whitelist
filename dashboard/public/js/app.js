/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// ============== State ==============
let currentGroupId = null;
let currentRuleType = 'whitelist';
let allRules = [];

// ============== API Helpers ==============
async function api(endpoint, options = {}) {
    const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Error de red' }));
        throw new Error(error.error || 'Error desconocido');
    }
    return res.json();
}

// ============== Toast ==============
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============== Screens ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ============== Auth ==============
async function checkAuth() {
    try {
        const data = await api('/api/auth/check');
        if (data.authenticated) {
            document.getElementById('current-user').textContent = data.user.username;
            showScreen('dashboard-screen');
            loadDashboard();
        } else {
            showScreen('login-screen');
        }
    } catch {
        showScreen('login-screen');
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    try {
        await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        errorEl.textContent = '';
        checkAuth();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    showScreen('login-screen');
});

// ============== Dashboard ==============
async function loadDashboard() {
    // Stats
    const stats = await api('/api/stats');
    document.getElementById('stat-groups').textContent = stats.groupCount;
    document.getElementById('stat-whitelist').textContent = stats.whitelistCount;
    document.getElementById('stat-blocked').textContent = stats.blockedCount;

    // System status
    await loadSystemStatus();

    // Groups
    const groups = await api('/api/groups');
    const list = document.getElementById('groups-list');

    if (groups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>No hay grupos configurados</p>
                <button class="btn btn-primary" onclick="openNewGroupModal()">Crear primer grupo</button>
            </div>
        `;
        return;
    }

    list.innerHTML = groups.map(g => `
        <div class="group-card" onclick="openGroup(${g.id})">
            <div class="group-info">
                <h3>${escapeHtml(g.display_name)}</h3>
                <p>${g.name}.txt</p>
            </div>
            <div class="group-stats">${g.whitelist_count} dominios</div>
            <span class="group-status ${g.enabled ? 'active' : 'paused'}">
                ${g.enabled ? '✅ Activo' : '⏸️ Pausado'}
            </span>
            <span class="btn btn-ghost">→</span>
        </div>
    `).join('');
}

// ============== Group Editor ==============
async function openGroup(id) {
    currentGroupId = id;
    currentRuleType = 'whitelist';

    const group = await api(`/api/groups/${id}`);

    document.getElementById('editor-title').textContent = group.display_name;
    document.getElementById('group-display-name').value = group.display_name;
    document.getElementById('group-enabled').value = group.enabled ? '1' : '0';

    const baseUrl = window.location.origin;
    document.getElementById('export-url').textContent = `${baseUrl}/export/${group.name}.txt`;

    // Load rules
    await loadRules();

    // Update tabs
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === currentRuleType);
    });

    showScreen('editor-screen');
}

async function loadRules() {
    allRules = await api(`/api/groups/${currentGroupId}/rules`);
    renderRules();
    updateRuleCounts();
}

function renderRules() {
    const filtered = allRules.filter(r => r.type === currentRuleType);
    const search = document.getElementById('search-rules').value.toLowerCase();
    const displayed = search
        ? filtered.filter(r => r.value.toLowerCase().includes(search))
        : filtered;

    const list = document.getElementById('rules-list');

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'No hay resultados' : 'No hay reglas en esta sección'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map(r => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r.value)}</span>
            <button class="btn btn-ghost btn-icon rule-delete" onclick="deleteRule(${r.id}, event)">🗑️</button>
        </div>
    `).join('');
}

function updateRuleCounts() {
    const counts = {
        whitelist: allRules.filter(r => r.type === 'whitelist').length,
        blocked_subdomain: allRules.filter(r => r.type === 'blocked_subdomain').length,
        blocked_path: allRules.filter(r => r.type === 'blocked_path').length
    };

    Object.entries(counts).forEach(([type, count]) => {
        const badge = document.getElementById(`count-${type}`);
        if (badge) badge.textContent = count;
    });
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        currentRuleType = tab.dataset.type;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderRules();
    });
});

// Search
document.getElementById('search-rules').addEventListener('input', renderRules);

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
    showScreen('dashboard-screen');
    loadDashboard();
});

// Save config
document.getElementById('save-config-btn').addEventListener('click', async () => {
    const displayName = document.getElementById('group-display-name').value;
    const enabled = document.getElementById('group-enabled').value === '1';

    await api(`/api/groups/${currentGroupId}`, {
        method: 'PUT',
        body: JSON.stringify({ displayName, enabled })
    });

    document.getElementById('editor-title').textContent = displayName;
    showToast('Configuración guardada');
});

// Delete group
document.getElementById('delete-group-btn').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este grupo y todas sus reglas?')) return;

    await api(`/api/groups/${currentGroupId}`, { method: 'DELETE' });
    showToast('Grupo eliminado');
    showScreen('dashboard-screen');
    loadDashboard();
});

// Copy URL
document.getElementById('copy-url-btn').addEventListener('click', () => {
    const url = document.getElementById('export-url').textContent;
    navigator.clipboard.writeText(url);
    showToast('URL copiada al portapapeles');
});

// Delete rule
async function deleteRule(id, event) {
    event.stopPropagation();
    await api(`/api/rules/${id}`, { method: 'DELETE' });
    allRules = allRules.filter(r => r.id !== id);
    renderRules();
    updateRuleCounts();
    showToast('Regla eliminada');
}

// ============== Modals ==============
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Close on background click or cancel
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
    });
});

document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        closeModal(modal.id);
    });
});

// New Group
document.getElementById('new-group-btn').addEventListener('click', () => openModal('modal-new-group'));

function openNewGroupModal() {
    openModal('modal-new-group');
}

document.getElementById('new-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-group-name').value;
    const displayName = document.getElementById('new-group-display').value;

    try {
        await api('/api/groups', {
            method: 'POST',
            body: JSON.stringify({ name, displayName })
        });
        closeModal('modal-new-group');
        document.getElementById('new-group-form').reset();
        showToast('Grupo creado');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Add Rule
document.getElementById('add-rule-btn').addEventListener('click', () => openModal('modal-add-rule'));

document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = document.getElementById('new-rule-value').value;
    const comment = document.getElementById('new-rule-comment').value;

    try {
        await api(`/api/groups/${currentGroupId}/rules`, {
            method: 'POST',
            body: JSON.stringify({ type: currentRuleType, value, comment })
        });
        closeModal('modal-add-rule');
        document.getElementById('add-rule-form').reset();
        await loadRules();
        showToast('Regla añadida');
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Bulk Add
document.getElementById('bulk-add-btn').addEventListener('click', () => openModal('modal-bulk-add'));

document.getElementById('bulk-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('bulk-values').value;
    const values = text.split('\n').map(v => v.trim()).filter(v => v);

    if (values.length === 0) {
        showToast('No hay valores para añadir', 'error');
        return;
    }

    try {
        const result = await api(`/api/groups/${currentGroupId}/rules/bulk`, {
            method: 'POST',
            body: JSON.stringify({ type: currentRuleType, values })
        });
        closeModal('modal-bulk-add');
        document.getElementById('bulk-add-form').reset();
        await loadRules();
        showToast(`${result.count} reglas añadidas`);
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ============== Helpers ==============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============== System Toggle ==============
async function loadSystemStatus() {
    try {
        const status = await api('/api/system/status');
        updateSystemToggleUI(status.enabled);
    } catch (err) {
        console.error('Error loading system status:', err);
    }
}

function updateSystemToggleUI(isEnabled) {
    const toggle = document.getElementById('system-toggle');
    const icon = document.getElementById('system-status-icon');
    const text = document.getElementById('system-status-text');
    const btn = document.getElementById('system-toggle-btn');

    if (isEnabled) {
        toggle.classList.remove('inactive');
        toggle.classList.add('active');
        icon.textContent = '🟢';
        text.textContent = 'Sistema Activo';
        btn.textContent = '⏸️ Desactivar Sistema';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-danger');
    } else {
        toggle.classList.remove('active');
        toggle.classList.add('inactive');
        icon.textContent = '🔴';
        text.textContent = 'Sistema Desactivado';
        btn.textContent = '▶️ Activar Sistema';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-success');
    }
}

document.getElementById('system-toggle-btn').addEventListener('click', async () => {
    const toggle = document.getElementById('system-toggle');
    const isCurrentlyEnabled = toggle.classList.contains('active');
    const action = isCurrentlyEnabled ? 'desactivar' : 'activar';

    if (!confirm(`¿Estás seguro de que deseas ${action} el sistema?\n\nEsto afectará a TODOS los grupos.`)) {
        return;
    }

    try {
        const result = await api('/api/system/toggle', {
            method: 'POST',
            body: JSON.stringify({ enable: !isCurrentlyEnabled })
        });
        updateSystemToggleUI(result.enabled);
        await loadDashboard();
        showToast(`Sistema ${result.enabled ? 'activado' : 'desactivado'} correctamente`);
    } catch (err) {
        showToast('Error al cambiar el estado del sistema', 'error');
    }
});

// ============== Init ==============
checkAuth();
