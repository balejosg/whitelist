/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

// ============== State ==============
interface Rule {
    id: number;
    type: string;
    value: string;
}

interface Group {
    id: number;
    name: string;
    display_name: string;
    whitelist_count: number;
    enabled: boolean;
}

interface Stats {
    groupCount: number;
    whitelistCount: number;
    blockedCount: number;
}

interface SystemStatus {
    enabled: boolean;
}

interface User {
    username: string;
}

interface AuthCheck {
    authenticated: boolean;
    user?: User;
}

let currentGroupId: number | null = null;
let currentRuleType = 'whitelist';
let allRules: Rule[] = [];

// ============== API Helpers ==============
async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Error de red' })) as { error?: string };
        throw new Error(error.error ?? 'Error desconocido');
    }
    return res.json() as Promise<T>;
}

// ============== Toast ==============
function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ============== Screens ==============
function showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(s => { s.classList.add('hidden'); });
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.remove('hidden');
}

// ============== Auth ==============
async function checkAuth(): Promise<void> {
    try {
        const data = await api<AuthCheck>('/api/auth/check');
        if (data.authenticated && data.user) {
            const userEl = document.getElementById('current-user');
            if (userEl) userEl.textContent = data.user.username;
            showScreen('dashboard-screen');
            void loadDashboard();
        } else {
            showScreen('login-screen');
        }
    } catch {
        showScreen('login-screen');
    }
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        void (async (): Promise<void> => {
            e.preventDefault();
            const usernameEl = document.getElementById('username') as HTMLInputElement;
            const passwordEl = document.getElementById('password') as HTMLInputElement;
            const errorEl = document.getElementById('login-error');

            if (!errorEl) return;

            try {
                await api('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username: usernameEl.value, password: passwordEl.value })
                });
                errorEl.textContent = '';
                void checkAuth();
            } catch (err: unknown) {
                if (err instanceof Error) {
                    errorEl.textContent = err.message;
                } else {
                    errorEl.textContent = 'Error desconocido';
                }
            }
        })();
    });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
            await api('/api/auth/logout', { method: 'POST' });
            showScreen('login-screen');
        })();
    });
}

// ============== Dashboard ==============
async function loadDashboard(): Promise<void> {
    try {
        // Stats
        const stats = await api<Stats>('/api/stats');
        const statGroups = document.getElementById('stat-groups');
        const statWhitelist = document.getElementById('stat-whitelist');
        const statBlocked = document.getElementById('stat-blocked');

        if (statGroups) statGroups.textContent = String(stats.groupCount);
        if (statWhitelist) statWhitelist.textContent = String(stats.whitelistCount);
        if (statBlocked) statBlocked.textContent = String(stats.blockedCount);

        // System status
        void loadSystemStatus();

        // Groups
        const groups = await api<Group[]>('/api/groups');
        const list = document.getElementById('groups-list');
        if (!list) return;

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
            <div class="group-card" onclick="openGroup(${String(g.id)})">
                <div class="group-info">
                    <h3>${escapeHtml(g.display_name)}</h3>
                    <p>${g.name}.txt</p>
                </div>
                <div class="group-stats">${String(g.whitelist_count)} dominios</div>
                <span class="group-status ${g.enabled ? 'active' : 'paused'}">
                    ${g.enabled ? '✅ Activo' : '⏸️ Pausado'}
                </span>
                <span class="btn btn-ghost">→</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

// Attach to window for onclick handlers in generated HTML
(window as unknown as Record<string, unknown>).openNewGroupModal = (): void => {
    openModal('modal-new-group');
};

(window as unknown as Record<string, unknown>).openGroup = (id: number): void => {
    void openGroup(id);
};

// ============== Group Editor ==============
async function openGroup(id: number): Promise<void> {
    currentGroupId = id;
    currentRuleType = 'whitelist';

    const group = await api<Group>(`/api/groups/${id.toString()}`);

    const editorTitle = document.getElementById('editor-title');
    const groupDisplayName = document.getElementById('group-display-name') as HTMLInputElement;
    const groupEnabled = document.getElementById('group-enabled') as HTMLSelectElement;
    const exportUrl = document.getElementById('export-url');

    if (editorTitle) editorTitle.textContent = group.display_name;
    groupDisplayName.value = group.display_name;
    groupEnabled.value = group.enabled ? '1' : '0';

    if (exportUrl) {
        const baseUrl = window.location.origin;
        exportUrl.textContent = `${baseUrl}/export/${group.name}.txt`;
    }

    // Load rules
    void loadRules();

    // Update tabs
    document.querySelectorAll('.tab').forEach(t => {
        const tab = t as HTMLElement;
        tab.classList.toggle('active', tab.dataset.type === currentRuleType);
    });

    showScreen('editor-screen');
}

async function loadRules(): Promise<void> {
    if (currentGroupId === null) return;
    allRules = await api<Rule[]>(`/api/groups/${currentGroupId.toString()}/rules`);
    renderRules();
    updateRuleCounts();
}

function renderRules(): void {
    const filtered = allRules.filter(r => r.type === currentRuleType);
    const searchEl = document.getElementById('search-rules') as HTMLInputElement | null;
    const search = (searchEl?.value.toLowerCase()) ?? '';
    const displayed = search !== ''
        ? filtered.filter(r => r.value.toLowerCase().includes(search))
        : filtered;

    const list = document.getElementById('rules-list');
    if (!list) return;

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search !== '' ? 'No hay resultados' : 'No hay reglas en esta sección'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map(r => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r.value)}</span>
            <button class="btn btn-ghost btn-icon rule-delete" onclick="deleteRule(${r.id.toString()}, event)">🗑️</button>
        </div>
    `).join('');
}

(window as unknown as Record<string, unknown>).deleteRule = (id: number, event: Event): void => {
    void deleteRule(id, event);
};

function updateRuleCounts(): void {
    const counts = {
        whitelist: allRules.filter(r => r.type === 'whitelist').length,
        blocked_subdomain: allRules.filter(r => r.type === 'blocked_subdomain').length,
        blocked_path: allRules.filter(r => r.type === 'blocked_path').length
    };

    Object.entries(counts).forEach(([type, count]) => {
        const badge = document.getElementById(`count-${type}`);
        if (badge) badge.textContent = count.toString();
    });
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const t = tab as HTMLElement;
        currentRuleType = t.dataset.type ?? 'whitelist';
        document.querySelectorAll('.tab').forEach(el => { el.classList.remove('active'); });
        t.classList.add('active');
        renderRules();
    });
});

// Search
const searchRules = document.getElementById('search-rules');
if (searchRules) searchRules.addEventListener('input', () => { renderRules(); });

// Back button
const backBtn = document.getElementById('back-btn');
if (backBtn) {
    backBtn.addEventListener('click', () => {
        showScreen('dashboard-screen');
        void loadDashboard();
    });
}

// Save config
const saveConfigBtn = document.getElementById('save-config-btn');
if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
            if (currentGroupId === null) return;
            const displayNameEl = document.getElementById('group-display-name') as HTMLInputElement;
            const enabledEl = document.getElementById('group-enabled') as HTMLSelectElement;

            const displayName = displayNameEl.value;
            const enabled = enabledEl.value === '1';

            await api(`/api/groups/${currentGroupId.toString()}`, {
                method: 'PUT',
                body: JSON.stringify({ displayName, enabled })
            });

            const editorTitle = document.getElementById('editor-title');
            if (editorTitle) editorTitle.textContent = displayName;
            showToast('Configuración guardada');
        })();
    });
}

// Delete group
const deleteGroupBtn = document.getElementById('delete-group-btn');
if (deleteGroupBtn) {
    deleteGroupBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
            if (currentGroupId === null) return;
            if (!confirm('¿Eliminar este grupo y todas sus reglas?')) return;

            await api(`/api/groups/${currentGroupId.toString()}`, { method: 'DELETE' });
            showToast('Grupo eliminado');
            showScreen('dashboard-screen');
            void loadDashboard();
        })();
    });
}

// Copy URL
const copyUrlBtn = document.getElementById('copy-url-btn');
if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', () => {
        const exportUrl = document.getElementById('export-url');
        const url = exportUrl?.textContent;
        if (url) {
            void navigator.clipboard.writeText(url);
            showToast('URL copiada al portapapeles');
        }
    });
}

// Delete rule
async function deleteRule(id: number, event: Event): Promise<void> {
    event.stopPropagation();
    await api(`/api/rules/${id.toString()}`, { method: 'DELETE' });
    allRules = allRules.filter(r => r.id !== id);
    renderRules();
    updateRuleCounts();
    showToast('Regla eliminada');
}

// ============== Modals ==============
function openModal(id: string): void {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(id: string): void {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
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
        if (modal) closeModal(modal.id);
    });
});

// New Group
const newGroupBtn = document.getElementById('new-group-btn');
if (newGroupBtn) newGroupBtn.addEventListener('click', () => { openModal('modal-new-group'); });

const newGroupForm = document.getElementById('new-group-form') as HTMLFormElement | null;
if (newGroupForm) {
    newGroupForm.addEventListener('submit', (e) => {
        void (async (): Promise<void> => {
            e.preventDefault();
            const nameEl = document.getElementById('new-group-name') as HTMLInputElement;
            const displayNameEl = document.getElementById('new-group-display') as HTMLInputElement;

            try {
                await api('/api/groups', {
                    method: 'POST',
                    body: JSON.stringify({ name: nameEl.value, displayName: displayNameEl.value })
                });
                closeModal('modal-new-group');
                newGroupForm.reset();
                showToast('Grupo creado');
                void loadDashboard();
            } catch (err: unknown) {
                if (err instanceof Error) {
                    showToast(err.message, 'error');
                } else {
                    showToast('Error desconocido', 'error');
                }
            }
        })();
    });
}

// Add Rule
const addRuleBtn = document.getElementById('add-rule-btn');
if (addRuleBtn) addRuleBtn.addEventListener('click', () => { openModal('modal-add-rule'); });

const addRuleForm = document.getElementById('add-rule-form') as HTMLFormElement | null;
if (addRuleForm) {
    addRuleForm.addEventListener('submit', (e) => {
        void (async (): Promise<void> => {
            e.preventDefault();
            if (currentGroupId === null) return;
            const valueEl = document.getElementById('new-rule-value') as HTMLInputElement;
            const commentEl = document.getElementById('new-rule-comment') as HTMLInputElement;

            try {
                await api(`/api/groups/${currentGroupId.toString()}/rules`, {
                    method: 'POST',
                    body: JSON.stringify({ type: currentRuleType, value: valueEl.value, comment: commentEl.value })
                });
                closeModal('modal-add-rule');
                addRuleForm.reset();
                void loadRules();
                showToast('Regla añadida');
            } catch (err: unknown) {
                if (err instanceof Error) {
                    showToast(err.message, 'error');
                } else {
                    showToast('Error desconocido', 'error');
                }
            }
        })();
    });
}

// Bulk Add
const bulkAddBtn = document.getElementById('bulk-add-btn');
if (bulkAddBtn) bulkAddBtn.addEventListener('click', () => { openModal('modal-bulk-add'); });

const bulkAddForm = document.getElementById('bulk-add-form') as HTMLFormElement | null;
if (bulkAddForm) {
    bulkAddForm.addEventListener('submit', (e) => {
        void (async (): Promise<void> => {
            e.preventDefault();
            if (currentGroupId === null) return;
            const textEl = document.getElementById('bulk-values') as HTMLTextAreaElement;
            const text = textEl.value;
            const values = text.split('\n').map(v => v.trim()).filter(v => v);

            if (values.length === 0) {
                showToast('No hay valores para añadir', 'error');
                return;
            }

            try {
                const result = await api<{ count: number }>(`/api/groups/${currentGroupId.toString()}/rules/bulk`, {
                    method: 'POST',
                    body: JSON.stringify({ type: currentRuleType, values })
                });
                closeModal('modal-bulk-add');
                bulkAddForm.reset();
                void loadRules();
                showToast(`${result.count.toString()} reglas añadidas`);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    showToast(err.message, 'error');
                } else {
                    showToast('Error desconocido', 'error');
                }
            }
        })();
    });
}

// ============== Helpers ==============
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    const html = div.innerHTML;
    return html;
}

// ============== System Toggle ==============
async function loadSystemStatus(): Promise<void> {
    try {
        const status = await api<SystemStatus>('/api/system/status');
        updateSystemToggleUI(status.enabled);
    } catch (err) {
        console.error('Error loading system status:', err);
    }
}

function updateSystemToggleUI(isEnabled: boolean): void {
    const toggle = document.getElementById('system-toggle');
    const icon = document.getElementById('system-status-icon');
    const text = document.getElementById('system-status-text');
    const btn = document.getElementById('system-toggle-btn');

    if (!toggle || !icon || !text || !btn) return;

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

const systemToggleBtn = document.getElementById('system-toggle-btn');
if (systemToggleBtn) {
    systemToggleBtn.addEventListener('click', () => {
        void (async (): Promise<void> => {
            const toggle = document.getElementById('system-toggle');
            if (!toggle) return;
            const isCurrentlyEnabled = toggle.classList.contains('active');
            const action = isCurrentlyEnabled ? 'desactivar' : 'activar';

            if (!confirm(`¿Estás seguro de que deseas ${action} el sistema?\n\nEsto afectará a TODOS los grupos.`)) {
                return;
            }

            try {
                const result = await api<SystemStatus>('/api/system/toggle', {
                    method: 'POST',
                    body: JSON.stringify({ enable: !isCurrentlyEnabled })
                });
                updateSystemToggleUI(result.enabled);
                void loadDashboard();
                showToast(`Sistema ${result.enabled ? 'activado' : 'desactivado'} correctamente`);
            } catch {
                showToast('Error al cambiar el estado del sistema', 'error');
            }
        })();
    });
}

// ============== Init ==============
void checkAuth();
