/**
 * Whitelist SPA - Main Application
 * Static SPA for managing DNS whitelist via GitHub API
 */

// ============== State ==============
let github = null;
let currentGroup = null;
let currentGroupData = null;
let currentGroupSha = null;
let currentRuleType = 'whitelist';
let allGroups = [];

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

// ============== Setup Flow ==============
async function checkSetup() {
    if (!Config.isConfigured()) {
        showScreen('setup-screen');
        return;
    }

    try {
        const config = Config.getRequired();
        github = new GitHubAPI(config.token, config.owner, config.repo, config.branch || 'main');

        // Validate token
        const user = await github.validateToken();
        document.getElementById('current-user').textContent = user.login;

        showScreen('dashboard-screen');
        loadDashboard();
    } catch (err) {
        console.error('Setup error:', err);
        showToast('Error de configuración: ' + err.message, 'error');
        Config.clear();
        showScreen('setup-screen');
    }
}

// Setup form handler
document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('setup-error');
    errorEl.textContent = '';

    const token = document.getElementById('setup-token').value.trim();
    const owner = document.getElementById('setup-owner').value.trim();
    const repo = document.getElementById('setup-repo').value.trim();
    const branch = document.getElementById('setup-branch').value.trim() || 'main';
    const gruposDir = document.getElementById('setup-grupos-dir').value.trim() || 'grupos';

    if (!token || !owner || !repo) {
        errorEl.textContent = 'Todos los campos son requeridos';
        return;
    }

    try {
        // Test connection
        const testGithub = new GitHubAPI(token, owner, repo, branch);
        await testGithub.validateToken();

        // Save config
        Config.save({ token, owner, repo, branch, gruposDir });

        showToast('Configuración guardada');
        checkSetup();
    } catch (err) {
        errorEl.textContent = err.message || 'Token o repositorio inválido';
    }
});

// Logout / Reset config
document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión y borrar configuración?')) {
        Config.clear();
        showScreen('setup-screen');
    }
});

// ============== Dashboard ==============
async function loadDashboard() {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';

    try {
        // Load groups (txt files in grupos directory)
        const files = await github.listFiles(gruposDir);
        allGroups = files
            .filter(f => f.name.endsWith('.txt'))
            .map(f => ({
                name: f.name.replace('.txt', ''),
                path: f.path,
                sha: f.sha
            }));

        // Load stats for each group
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

        // Update stats
        document.getElementById('stat-groups').textContent = allGroups.length;
        document.getElementById('stat-whitelist').textContent = totalWhitelist;
        document.getElementById('stat-blocked').textContent = totalBlocked;

        // Render groups list
        renderGroupsList();

    } catch (err) {
        console.error('Dashboard error:', err);
        if (err.message.includes('Not Found')) {
            showToast(`Directorio "${gruposDir}" no encontrado. Crear primero.`, 'error');
        } else {
            showToast('Error cargando datos: ' + err.message, 'error');
        }
    }
}

function renderGroupsList() {
    const list = document.getElementById('groups-list');

    if (allGroups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>No hay grupos configurados</p>
                <button class="btn btn-primary" onclick="openNewGroupModal()">Crear primer grupo</button>
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

        renderRules();
        updateRuleCounts();

        // Reset tabs
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

    list.innerHTML = displayed.map((r, i) => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r)}</span>
            <button class="btn btn-ghost btn-icon rule-delete" onclick="deleteRule('${escapeHtml(r)}', event)">🗑️</button>
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

// Save config (enabled state)
document.getElementById('save-config-btn').addEventListener('click', async () => {
    currentGroupData.enabled = document.getElementById('group-enabled').value === '1';
    await saveCurrentGroup('Actualizar estado del grupo');
});

// Delete group
document.getElementById('delete-group-btn').addEventListener('click', async () => {
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
    event.stopPropagation();

    const typeKey = currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    currentGroupData[typeKey] = currentGroupData[typeKey].filter(r => r !== value);
    await saveCurrentGroup(`Eliminar ${value} de ${currentGroup}`);
}

// Save current group to GitHub
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
    const name = document.getElementById('new-group-name').value.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    if (!name) {
        showToast('Nombre requerido', 'error');
        return;
    }

    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${name}.txt`;

    // Create empty whitelist file
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
document.getElementById('add-rule-btn').addEventListener('click', () => openModal('modal-add-rule'));

document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
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
document.getElementById('bulk-add-btn').addEventListener('click', () => openModal('modal-bulk-add'));

document.getElementById('bulk-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
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
checkSetup();
