/**
 * Whitelist SPA - Main Application
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

// ============== Screens ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ============== OAuth Flow ==============
async function init() {
    // Check for OAuth callback
    const callbackResult = OAuth.handleCallback();
    if (callbackResult?.error) {
        showScreen('login-screen');
        document.getElementById('login-error').textContent =
            'Error de autenticación: ' + callbackResult.error;
        return;
    }

    // Check if logged in
    if (!OAuth.isLoggedIn()) {
        showScreen('login-screen');
        return;
    }

    // Get user info
    currentUser = await OAuth.getUser();
    if (!currentUser) {
        showScreen('login-screen');
        return;
    }

    // Check if repo config exists
    const config = Config.get();
    if (!config.owner || !config.repo) {
        showConfigScreen();
        return;
    }

    // Initialize GitHub API with OAuth token
    github = new GitHubAPI(
        OAuth.getToken(),
        config.owner,
        config.repo,
        config.branch || 'main'
    );

    // Check write permissions
    canEdit = await OAuth.canWrite(config.owner, config.repo);

    document.getElementById('current-user').textContent = currentUser.login;
    updateEditUI();
    showScreen('dashboard-screen');
    loadDashboard();
}

function showConfigScreen() {
    document.getElementById('config-username').textContent = currentUser.login;
    showScreen('config-screen');
}

function updateEditUI() {
    // Hide/show edit buttons based on permissions
    const editButtons = document.querySelectorAll(
        '#new-group-btn, #save-config-btn, #delete-group-btn, #add-rule-btn, #bulk-add-btn'
    );
    editButtons.forEach(btn => {
        btn.style.display = canEdit ? '' : 'none';
    });

    // Show read-only badge if no write access
    const header = document.querySelector('.header-right');
    const existingBadge = document.getElementById('readonly-badge');
    if (!canEdit && !existingBadge) {
        const badge = document.createElement('span');
        badge.id = 'readonly-badge';
        badge.className = 'user-badge';
        badge.textContent = '👁️ Solo lectura';
        badge.style.background = 'rgba(234, 179, 8, 0.2)';
        badge.style.color = '#eab308';
        header.insertBefore(badge, header.firstChild);
    } else if (canEdit && existingBadge) {
        existingBadge.remove();
    }
}

// Login button
document.getElementById('github-login-btn').addEventListener('click', () => {
    OAuth.login();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
        OAuth.logout();
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

        for (const group of allGroups) {
            try {
                const { content } = await github.getFileContent(group.path);
                const data = WhitelistParser.parse(content);
                const stats = WhitelistParser.getStats(data);
                group.stats = stats;
                group.enabled = data.enabled;
                totalWhitelist += stats.whitelist;
                totalBlocked += stats.blocked_subdomains + stats.blocked_paths;
            } catch {
                group.stats = { whitelist: 0, blocked_subdomains: 0, blocked_paths: 0 };
                group.enabled = true;
            }
        }

        document.getElementById('stat-groups').textContent = allGroups.length;
        document.getElementById('stat-whitelist').textContent = totalWhitelist;
        document.getElementById('stat-blocked').textContent = totalBlocked;

        renderGroupsList();
    } catch (err) {
        console.error('Dashboard error:', err);
        showToast('Error cargando datos: ' + err.message, 'error');
    }
}

function renderGroupsList() {
    const list = document.getElementById('groups-list');

    if (allGroups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>No hay grupos configurados</p>
                ${canEdit ? '<button class="btn btn-primary" onclick="openNewGroupModal()">Crear primer grupo</button>' : ''}
            </div>
        `;
        return;
    }

    list.innerHTML = allGroups.map(g => `
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

// ============== Helpers ==============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============== Init ==============
init();
