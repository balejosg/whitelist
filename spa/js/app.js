/**
 * OpenPath SPA - Main Application
 * Static SPA for managing DNS whitelist via GitHub API with OAuth
 */

// ============== State ==============
let github = null;
let currentGroup = null;
let currentGroupData = null;
let currentGroupSha = null;
let currentRuleType = 'whitelist';
let allGroups = [];
let currentUser = null;
let canEdit = false;

// ============== Toast ==============
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Relative time formatter ("hace 5 min", "hace 2 horas")
function relativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHour < 24) return `hace ${diffHour}h`;
    if (diffDay < 7) return `hace ${diffDay} días`;
    return date.toLocaleDateString();
}

// ============== Screens ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ============== OAuth and JWT Flow ==============
async function init() {
    // 1. Check for OAuth callback first
    const callbackResult = OAuth.handleCallback();
    if (callbackResult?.error) {
        showScreen('login-screen');
        document.getElementById('login-error').textContent =
            'Error de autenticación: ' + callbackResult.error;
        return;
    }

    // 2. Check if logged in (either via GitHub OAuth or JWT)
    const isGitHubLoggedIn = OAuth.isLoggedIn();
    const isJWTLoggedIn = Auth.isAuthenticated();

    if (!isGitHubLoggedIn && !isJWTLoggedIn) {
        showScreen('login-screen');
        return;
    }

    // 3. Load user info
    try {
        if (isGitHubLoggedIn) {
            currentUser = await OAuth.getUser();
        } else if (isJWTLoggedIn) {
            currentUser = Auth.getUser();
            // Optional: refresh user info from server
            try { await Auth.getMe(); currentUser = Auth.getUser(); } catch (e) { }
        }
    } catch (err) {
        console.error('Failed to load user:', err);
        showScreen('login-screen');
        return;
    }

    if (!currentUser) {
        showScreen('login-screen');
        return;
    }

    // 4. Setup Whitelist Requests API (Home Server)
    const savedUrl = localStorage.getItem('requests_api_url') || '';
    const savedToken = localStorage.getItem('requests_api_token') || '';
    if (savedUrl) {
        RequestsAPI.init(savedUrl, savedToken);
    }

    // 5. Check if repo config exists (only for admins/github users)
    const config = Config.get();
    if (!config.owner || !config.repo) {
        // If teacher, they don't need to configure the repo
        if (Auth.isTeacher() && !Auth.isAdmin()) {
            // But we need to make sure github-api is initialized with SOME credentials 
            // if we want them to see group names. 
            // Teachers use the home server API for most things.
        } else {
            showConfigScreen();
            return;
        }
    }

    // 6. Initialize GitHub API if possible
    if (isGitHubLoggedIn) {
        github = new GitHubAPI(
            OAuth.getToken(),
            config.owner,
            config.repo,
            config.branch || 'main'
        );
        canEdit = await OAuth.canWrite(config.owner, config.repo);
    } else if (isJWTLoggedIn) {
        // Teachers/JWT users without GitHub OAuth have limited git access 
        // through the requests server proxy for specific actions
        canEdit = false;
    }

    // Update UI and start
    const userName = currentUser.login || currentUser.name || currentUser.email;
    document.getElementById('current-user').textContent = userName;

    updateEditUI();
    showScreen('dashboard-screen');
    loadDashboard();
}

function showConfigScreen() {
    document.getElementById('config-username').textContent = currentUser.login;
    showScreen('config-screen');
}

function updateEditUI() {
    const isAdmin = Auth.isAdmin() || canEdit;
    const isTeacher = Auth.isTeacher();
    const isStudent = Auth.isStudent();

    // Hide/show edit buttons based on permissions
    const editButtons = document.querySelectorAll(
        '#new-group-btn, #save-config-btn, #delete-group-btn, #add-rule-btn, #bulk-add-btn'
    );
    editButtons.forEach(btn => {
        btn.style.display = isAdmin ? '' : 'none';
    });

    // Toggle users section for admins
    const usersSection = document.getElementById('users-section');
    if (usersSection) {
        usersSection.classList.toggle('hidden', !Auth.isAdmin());
        if (Auth.isAdmin()) {
            loadUsers();
            document.getElementById('admin-users-btn').classList.remove('hidden');
        } else {
            document.getElementById('admin-users-btn').classList.add('hidden');
        }
    }

    // Teacher Banner
    const teacherBanner = document.getElementById('teacher-banner');
    if (teacherBanner) {
        if (isTeacher && !isAdmin) {
            teacherBanner.classList.remove('hidden');
            document.getElementById('teacher-name').textContent = currentUser.name || currentUser.email;
            const groups = Auth.getTeacherGroups();
            document.getElementById('teacher-assigned-groups').textContent =
                groups.length > 0 ? groups.join(', ') : 'ningún grupo aún';
        } else {
            teacherBanner.classList.add('hidden');
        }
    }

    // Show read-only badge if no write access
    const header = document.querySelector('.header-right');
    const existingBadge = document.getElementById('readonly-badge');

    if (!isAdmin && !existingBadge && !isTeacher) {
        const badge = document.createElement('span');
        badge.id = 'readonly-badge';
        badge.className = 'user-badge';
        badge.textContent = '👁️ Solo lectura';
        badge.style.background = 'rgba(234, 179, 8, 0.2)';
        badge.style.color = '#eab308';
        header.insertBefore(badge, header.firstChild);
    } else if (isAdmin && existingBadge) {
        existingBadge.remove();
    }
}

// Navigation for Admins
document.getElementById('admin-users-btn').addEventListener('click', () => {
    document.getElementById('users-section').scrollIntoView({ behavior: 'smooth' });
});

// ============== Login Listeners ==============

// Email Login
document.getElementById('email-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('email-login-btn');

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Autenticando...';

    try {
        await Auth.login(email, password);
        init(); // Re-initialize the app
    } catch (err) {
        errorEl.textContent = 'Error: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Acceder al Panel';
    }
});

// GitHub login button
document.getElementById('github-login-btn').addEventListener('click', () => {
    OAuth.login();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
        OAuth.logout();
        Auth.logout();
        showScreen('login-screen');
    }
});

// Repo config form
document.getElementById('repo-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('config-error');
    errorEl.textContent = '';

    const owner = document.getElementById('config-owner').value.trim();
    const repo = document.getElementById('config-repo').value.trim();
    const branch = document.getElementById('config-branch').value.trim() || 'main';
    const gruposDir = document.getElementById('config-grupos-dir').value.trim() || 'grupos';

    // Test connection
    try {
        github = new GitHubAPI(OAuth.getToken(), owner, repo, branch);
        await github.listFiles(gruposDir);

        Config.save({ owner, repo, branch, gruposDir });
        canEdit = await OAuth.canWrite(owner, repo);

        document.getElementById('current-user').textContent = currentUser.login;
        updateEditUI();
        showScreen('dashboard-screen');
        loadDashboard();
    } catch (err) {
        if (err.message.includes('Not Found')) {
            errorEl.textContent = `Directorio "${gruposDir}" no encontrado en ${owner}/${repo}`;
        } else {
            errorEl.textContent = err.message;
        }
    }
});

// ============== Dashboard ==============
async function loadDashboard() {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';

    try {
        const files = await github.listFiles(gruposDir);
        allGroups = files
            .filter(f => f.name.endsWith('.txt'))
            .map(f => ({
                name: f.name.replace('.txt', ''),
                path: f.path,
                sha: f.sha
            }));

        let totalWhitelist = 0;
        let totalBlocked = 0;

        // Determine visible groups for teachers
        const isTeacher = Auth.isTeacher();
        const isAdmin = Auth.isAdmin() || canEdit;
        const assignedGroups = isTeacher && !isAdmin ? Auth.getAssignedGroups() : null;

        for (const group of allGroups) {
            try {
                const { content } = await github.getFileContent(group.path);
                const data = WhitelistParser.parse(content);
                const stats = WhitelistParser.getStats(data);
                group.stats = stats;
                group.enabled = data.enabled;

                // Only count stats for visible groups
                if (!assignedGroups || assignedGroups.includes(group.name)) {
                    totalWhitelist += stats.whitelist;
                    totalBlocked += stats.blocked_subdomains + stats.blocked_paths;
                }
            } catch {
                group.stats = { whitelist: 0, blocked_subdomains: 0, blocked_paths: 0 };
                group.enabled = true;
            }
        }

        // Show filtered count for teachers
        const visibleGroupCount = assignedGroups
            ? allGroups.filter(g => assignedGroups.includes(g.name)).length
            : allGroups.length;

        document.getElementById('stat-groups').textContent = visibleGroupCount;
        document.getElementById('stat-whitelist').textContent = totalWhitelist;
        document.getElementById('stat-blocked').textContent = totalBlocked;

        renderGroupsList();

        // Initialize requests section (home server API)
        await initRequestsSection();
    } catch (err) {
        console.error('Dashboard error:', err);
        showToast('Error cargando datos: ' + err.message, 'error');
    }
}

function renderGroupsList() {
    const list = document.getElementById('groups-list');
    const isTeacher = Auth.isTeacher();
    const isAdmin = Auth.isAdmin() || canEdit;

    // Filter groups based on user role
    let visibleGroups = allGroups;
    if (isTeacher && !isAdmin) {
        const assignedGroups = Auth.getAssignedGroups();
        visibleGroups = allGroups.filter(g => assignedGroups.includes(g.name));
    }

    if (visibleGroups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${isTeacher ? 'No tienes grupos asignados' : 'No hay grupos configurados'}</p>
                ${canEdit ? '<button class="btn btn-primary" onclick="openNewGroupModal()">Crear primer grupo</button>' : ''}
            </div>
        `;
        return;
    }

    list.innerHTML = visibleGroups.map(g => `
        <div class="group-card" onclick="openGroup('${escapeHtml(g.name)}')">
            <div class="group-info">
                <h3>${escapeHtml(g.name)}</h3>
                <p>${g.path}</p>
            </div>
            <div class="group-stats">${g.stats?.whitelist || 0} dominios</div>
            <span class="group-status ${g.enabled ? 'active' : 'paused'}">
                ${g.enabled ? '✅ Activo' : '⏸️ Pausado'}
            </span>
            <span class="btn btn-ghost">→</span>
        </div>
    `).join('');
}

// ============== Group Editor ==============
async function openGroup(name) {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${name}.txt`;

    try {
        const { content, sha } = await github.getFileContent(path);
        currentGroup = name;
        currentGroupSha = sha;
        currentGroupData = WhitelistParser.parse(content);
        currentRuleType = 'whitelist';

        document.getElementById('editor-title').textContent = name;
        document.getElementById('group-name-display').textContent = name;
        document.getElementById('group-enabled').value = currentGroupData.enabled ? '1' : '0';
        document.getElementById('export-url').textContent = github.getRawUrl(path);

        // Disable editing if no write access
        document.getElementById('group-enabled').disabled = !canEdit;

        renderRules();
        updateRuleCounts();

        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.type === 'whitelist');
        });

        showScreen('editor-screen');
    } catch (err) {
        showToast('Error abriendo grupo: ' + err.message, 'error');
    }
}

function renderRules() {
    const typeKey = currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';
    const rules = currentGroupData[typeKey] || [];
    const search = document.getElementById('search-rules').value.toLowerCase();
    const displayed = search
        ? rules.filter(r => r.toLowerCase().includes(search))
        : rules;

    const list = document.getElementById('rules-list');

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'No hay resultados' : 'No hay reglas en esta sección'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map((r) => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r)}</span>
            ${canEdit ? `<button class="btn btn-ghost btn-icon rule-delete" onclick="deleteRule('${escapeHtml(r)}', event)">🗑️</button>` : ''}
        </div>
    `).join('');
}

function updateRuleCounts() {
    document.getElementById('count-whitelist').textContent = currentGroupData.whitelist?.length || 0;
    document.getElementById('count-blocked_subdomain').textContent = currentGroupData.blocked_subdomains?.length || 0;
    document.getElementById('count-blocked_path').textContent = currentGroupData.blocked_paths?.length || 0;
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
    if (!canEdit) return;
    currentGroupData.enabled = document.getElementById('group-enabled').value === '1';
    await saveCurrentGroup('Actualizar estado del grupo');
});

// Delete group
document.getElementById('delete-group-btn').addEventListener('click', async () => {
    if (!canEdit) return;
    if (!confirm('¿Eliminar este grupo y todas sus reglas?')) return;

    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${currentGroup}.txt`;

    try {
        await github.deleteFile(path, `Eliminar grupo ${currentGroup}`, currentGroupSha);
        showToast('Grupo eliminado');
        showScreen('dashboard-screen');
        loadDashboard();
    } catch (err) {
        showToast('Error eliminando grupo: ' + err.message, 'error');
    }
});

// Copy URL
document.getElementById('copy-url-btn').addEventListener('click', () => {
    const url = document.getElementById('export-url').textContent;
    navigator.clipboard.writeText(url);
    showToast('URL copiada al portapapeles');
});

// Delete rule
async function deleteRule(value, event) {
    if (!canEdit) return;
    event.stopPropagation();

    const typeKey = currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    currentGroupData[typeKey] = currentGroupData[typeKey].filter(r => r !== value);
    await saveCurrentGroup(`Eliminar ${value} de ${currentGroup}`);
}

async function saveCurrentGroup(message) {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${currentGroup}.txt`;
    const content = WhitelistParser.serialize(currentGroupData);

    try {
        const result = await github.updateFile(path, content, message, currentGroupSha);
        currentGroupSha = result.content.sha;
        showToast('Cambios guardados');
        renderRules();
        updateRuleCounts();
    } catch (err) {
        showToast('Error guardando: ' + err.message, 'error');
    }
}

// ============== Modals ==============
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

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
document.getElementById('new-group-btn').addEventListener('click', () => {
    if (!canEdit) return;
    openModal('modal-new-group');
});

function openNewGroupModal() {
    if (!canEdit) return;
    openModal('modal-new-group');
}

document.getElementById('new-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    const name = document.getElementById('new-group-name').value.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    if (!name) {
        showToast('Nombre requerido', 'error');
        return;
    }

    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${name}.txt`;

    const initialData = {
        enabled: true,
        whitelist: [],
        blocked_subdomains: [],
        blocked_paths: []
    };
    const content = WhitelistParser.serialize(initialData);

    try {
        await github.updateFile(path, content, `Crear grupo ${name}`);
        closeModal('modal-new-group');
        document.getElementById('new-group-form').reset();
        showToast('Grupo creado');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Add Rule
document.getElementById('add-rule-btn').addEventListener('click', () => {
    if (!canEdit) return;
    openModal('modal-add-rule');
});

document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    const value = document.getElementById('new-rule-value').value.toLowerCase().trim();

    if (!value) {
        showToast('Valor requerido', 'error');
        return;
    }

    const typeKey = currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    if (currentGroupData[typeKey].includes(value)) {
        showToast('La regla ya existe', 'error');
        return;
    }

    currentGroupData[typeKey].push(value);
    await saveCurrentGroup(`Añadir ${value} a ${currentGroup}`);

    closeModal('modal-add-rule');
    document.getElementById('add-rule-form').reset();
});

// Bulk Add
document.getElementById('bulk-add-btn').addEventListener('click', () => {
    if (!canEdit) return;
    openModal('modal-bulk-add');
});

document.getElementById('bulk-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    const text = document.getElementById('bulk-values').value;
    const values = text.split('\n').map(v => v.toLowerCase().trim()).filter(v => v);

    if (values.length === 0) {
        showToast('No hay valores para añadir', 'error');
        return;
    }

    const typeKey = currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    let added = 0;
    for (const value of values) {
        if (!currentGroupData[typeKey].includes(value)) {
            currentGroupData[typeKey].push(value);
            added++;
        }
    }

    if (added > 0) {
        await saveCurrentGroup(`Añadir ${added} reglas a ${currentGroup}`);
    }

    closeModal('modal-bulk-add');
    document.getElementById('bulk-add-form').reset();
    showToast(`${added} reglas añadidas`);
});

// ============== Requests API ==============

// Initialize requests section
async function initRequestsSection() {
    // Load saved config
    const savedUrl = localStorage.getItem('requests_api_url') || '';
    const savedToken = localStorage.getItem('requests_api_token') || '';

    document.getElementById('requests-api-url').value = savedUrl;
    document.getElementById('requests-api-token').value = savedToken;

    if (savedUrl && savedToken) {
        RequestsAPI.init(savedUrl, savedToken);
        await checkRequestsServerStatus();
        await loadPendingRequests();
    }

    // Show requests section
    document.getElementById('requests-section').classList.remove('hidden');
}

// Check server status
async function checkRequestsServerStatus() {
    const statusEl = document.getElementById('requests-server-status');
    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = statusEl.querySelector('.status-text');

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
            textEl.textContent = 'Sin conexión';
            return false;
        }
    } catch {
        dotEl.className = 'status-dot offline';
        textEl.textContent = 'Error';
        return false;
    }
}

// Load pending requests
async function loadPendingRequests() {
    const listEl = document.getElementById('requests-list');
    const statEl = document.getElementById('stat-pending-requests');

    if (!RequestsAPI.isConfigured() && !Auth.isAuthenticated()) {
        listEl.innerHTML = '<p class="empty-message">Configura la URL del servidor o inicia sesión para ver solicitudes</p>';
        statEl.textContent = '—';
        return;
    }

    try {
        const response = await RequestsAPI.getPendingRequests();
        const requests = response.requests || [];

        // Update stat card
        statEl.textContent = requests.length;

        // Highlight if there are pending requests
        const cardEl = document.getElementById('stat-requests-card');
        if (requests.length > 0) {
            cardEl.classList.add('has-pending');
        } else {
            cardEl.classList.remove('has-pending');
        }

        if (requests.length === 0) {
            listEl.innerHTML = '<p class="empty-message success">No hay solicitudes pendientes</p>';
            return;
        }

        const isTeacher = Auth.isTeacher();
        const isAdmin = Auth.isAdmin() || canEdit;
        const teacherGroups = Auth.getTeacherGroups();

        listEl.innerHTML = requests.map(req => {
            const canApprove = isAdmin || (isTeacher && teacherGroups.includes(req.group_id));

            // If teacher, only show groups they are assigned to in the select
            const availableGroupsForSelect = isAdmin
                ? allGroups.map(g => g.name)
                : allGroups.map(g => g.name).filter(name => teacherGroups.includes(name));

            return `
                <div class="request-item ${!canApprove ? 'read-only' : ''}" data-id="${req.id}">
                    <div class="request-info">
                        <span class="request-domain">${escapeHtml(req.domain)}</span>
                        <span class="request-time">${relativeTime(req.created_at)}</span>
                        <span class="request-meta">
                            ${escapeHtml(req.reason || 'Sin motivo')}
                        </span>
                        <span class="request-group">Grupo: <strong>${escapeHtml(req.group_id || 'default')}</strong></span>
                    </div>
                    <div class="request-actions">
                        ${canApprove ? `
                            <select class="request-group-select">
                                ${availableGroupsForSelect.map(g => `
                                    <option value="${g}" ${g === req.group_id ? 'selected' : ''}>${g}</option>
                                `).join('')}
                                ${!availableGroupsForSelect.includes(req.group_id) && req.group_id ?
                        `<option value="${req.group_id}" selected>${req.group_id} (Sugerido)</option>` : ''}
                            </select>
                            <button class="btn btn-success btn-sm approve-request-btn" 
                                    data-id="${req.id}" title="Aprobar">✓</button>
                            <button class="btn btn-danger btn-sm reject-request-btn" 
                                    data-id="${req.id}" title="Rechazar">✗</button>
                        ` : `
                            <span class="status-badge pending">Esperando profesor</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners (only for buttons that exist)
        listEl.querySelectorAll('.approve-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const btnClicked = e.currentTarget;
                const id = btnClicked.dataset.id;
                const item = btnClicked.closest('.request-item');
                const groupSelect = item.querySelector('.request-group-select');
                const groupId = groupSelect.value;

                btnClicked.disabled = true;
                await approveRequest(id, groupId);
            });
        });

        listEl.querySelectorAll('.reject-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const btnClicked = e.currentTarget;
                const id = btnClicked.dataset.id;
                const reason = prompt('Motivo del rechazo (opcional):');

                btnClicked.disabled = true;
                await rejectRequest(id, reason);
            });
        });

    } catch (error) {
        listEl.innerHTML = `<p class="empty-message error">❌ Error: ${escapeHtml(error.message)}</p>`;
        statEl.textContent = '!';
    }
}

// Approve a request
async function approveRequest(requestId, groupId) {
    try {
        const response = await RequestsAPI.approveRequest(requestId, groupId);

        if (response.success) {
            showToast(`✅ Dominio ${response.domain} añadido a ${groupId}`);
            await loadPendingRequests();
            // Refresh groups to show new domain
            await loadDashboard();
        } else {
            // Handle blocked domain error specially
            if (response.code === 'DOMAIN_BLOCKED') {
                showBlockedDomainAlert(response.domain, response.matched_rule, response.hint);
            } else {
                showToast(`❌ Error: ${response.error}`, 'error');
            }
        }
    } catch (error) {
        // Also handle if error comes as exception
        if (error.code === 'DOMAIN_BLOCKED') {
            showBlockedDomainAlert(error.domain, error.matched_rule, error.hint);
        } else {
            showToast(`❌ Error: ${error.message}`, 'error');
        }
    }
}

// Show blocked domain alert modal
function showBlockedDomainAlert(domain, matchedRule, hint) {
    const modal = document.getElementById('modal-blocked-domain');
    if (!modal) {
        // Fallback to toast if modal doesn't exist
        showToast(`🚫 Este dominio está bloqueado por el administrador: ${matchedRule}`, 'error');
        return;
    }

    document.getElementById('blocked-domain-name').textContent = domain || 'desconocido';
    document.getElementById('blocked-domain-rule').textContent = matchedRule || 'regla no especificada';
    document.getElementById('blocked-domain-hint').textContent = hint || 'Contacta al administrador para más información';

    openModal('modal-blocked-domain');
}

// Reject a request
async function rejectRequest(requestId, reason) {
    try {
        const response = await RequestsAPI.rejectRequest(requestId, reason);

        if (response.success) {
            showToast('Solicitud rechazada');
            await loadPendingRequests();
        } else {
            showToast(`❌ Error: ${response.error}`, 'error');
        }
    } catch (error) {
        showToast(`❌ Error: ${error.message}`, 'error');
    }
}

// Save requests config
document.getElementById('save-requests-config-btn').addEventListener('click', async () => {
    const url = document.getElementById('requests-api-url').value.trim();
    const token = document.getElementById('requests-api-token').value.trim();

    localStorage.setItem('requests_api_url', url);
    localStorage.setItem('requests_api_token', token);

    RequestsAPI.init(url, token);

    const isOnline = await checkRequestsServerStatus();

    if (isOnline) {
        showToast('✅ Configuración guardada');
        await loadPendingRequests();
    } else {
        showToast('⚠️ Configuración guardada, pero el servidor no responde', 'warning');
    }
});

// Refresh requests button
document.getElementById('refresh-requests-btn').addEventListener('click', async () => {
    await checkRequestsServerStatus();
    await loadPendingRequests();
});

// Toggle requests config visibility
document.getElementById('stat-requests-card').addEventListener('click', () => {
    const configEl = document.getElementById('requests-config');
    configEl.classList.toggle('hidden');
});

// ============== User Management (Admin) ==============

async function loadUsers() {
    const listEl = document.getElementById('users-list');
    if (!listEl) return;

    try {
        const users = await UsersAPI.listUsers();

        if (users.length === 0) {
            listEl.innerHTML = '<p class="empty-message">No hay otros usuarios registrados</p>';
            return;
        }

        listEl.innerHTML = users.map(user => `
            <div class="user-card">
                <div class="user-info">
                    <h3>${escapeHtml(user.name || 'Sin nombre')} <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Activo' : 'Inactivo'}</span></h3>
                    <p>${escapeHtml(user.email)}</p>
                    <div class="user-roles" id="roles-${user.id}">
                        <!-- Roles filled by sub-request or if included in user object -->
                        ${(user.roles || []).map(r => `
                            <span class="role-badge ${r.role}">
                                ${r.role === 'admin' ? '👑 Admin' : r.role === 'teacher' ? '👨‍🏫 Profesor' : '👤 Estudiante'}
                                ${r.groupIds?.length > 0 ? `<span class="group-count">${r.groupIds.length}</span>` : ''}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openAssignRoleModal('${user.id}', '${escapeHtml(user.email)}')">Gestionar Roles</button>
                    <button class="btn btn-ghost btn-icon" onclick="deleteUser('${user.id}')" title="Eliminar usuario">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        listEl.innerHTML = `<p class="empty-message error">Error: ${escapeHtml(error.message)}</p>`;
    }
}

// Global functions for inline handlers
window.openAssignRoleModal = async function (userId, email) {
    document.getElementById('assign-role-user-id').value = userId;
    document.getElementById('assign-role-user-name').textContent = email;

    // Load groups into checkbox list
    const groupList = document.getElementById('assign-role-groups');
    groupList.innerHTML = allGroups.map(g => `
        <div class="checkbox-item">
            <input type="checkbox" id="grp-${g.name}" value="${g.name}" class="group-checkbox">
            <label for="grp-${g.name}">${escapeHtml(g.name)}</label>
        </div>
    `).join('');

    // Pre-select existing roles if we had them (simplified: teachers usually have one entry)
    // For now, let user select from scratch

    openModal('modal-assign-role');
};

window.deleteUser = async function (userId) {
    if (!confirm('¿Seguro que quieres eliminar este usuario?')) return;
    try {
        await UsersAPI.deleteUser(userId);
        showToast('Usuario eliminado');
        loadUsers();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
};

// Handle New User Form
document.getElementById('new-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value;
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    try {
        const result = await UsersAPI.createUser({ name, email, password });
        if (role !== 'student') {
            await UsersAPI.assignRole(result.id, role);
        }
        closeModal('modal-new-user');
        showToast('Usuario creado correctamente');
        loadUsers();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
});

// Handle Assign Role Form
document.getElementById('assign-role-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('assign-role-user-id').value;
    const role = document.getElementById('assign-role-type').value;
    const groupCheckboxes = document.querySelectorAll('.group-checkbox:checked');
    const groupIds = Array.from(groupCheckboxes).map(cb => cb.value);

    try {
        await UsersAPI.assignRole(userId, role, groupIds);
        closeModal('modal-assign-role');
        showToast('Rol asignado correctamente');
        loadUsers();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
});

// ============== Helpers ==============
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============== Init ==============
init();
