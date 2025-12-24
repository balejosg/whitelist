import { state } from './state.js';
import { showScreen, openModal, closeModal } from './ui.js';
import { showToast, escapeHtml } from './utils.js';
import { initRequestsSection } from './requests.js'; // Will create this

export async function loadDashboard() {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';

    try {
        const files = await state.github.listFiles(gruposDir);
        state.allGroups = files
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
        const isAdmin = Auth.isAdmin() || state.canEdit;
        const assignedGroups = isTeacher && !isAdmin ? Auth.getAssignedGroups() : null;

        for (const group of state.allGroups) {
            try {
                const { content } = await state.github.getFileContent(group.path);
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
            ? state.allGroups.filter(g => assignedGroups.includes(g.name)).length
            : state.allGroups.length;

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

export function renderGroupsList() {
    const list = document.getElementById('groups-list');
    const isTeacher = Auth.isTeacher();
    const isAdmin = Auth.isAdmin() || state.canEdit;

    // Filter groups based on user role
    let visibleGroups = state.allGroups;
    if (isTeacher && !isAdmin) {
        const assignedGroups = Auth.getAssignedGroups();
        visibleGroups = state.allGroups.filter(g => assignedGroups.includes(g.name));
    }

    if (visibleGroups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${isTeacher ? 'No tienes grupos asignados' : 'No hay grupos configurados'}</p>
                ${state.canEdit ? '<button class="btn btn-primary" onclick="window.openNewGroupModal()">Crear primer grupo</button>' : ''}
            </div>
        `;
        return;
    }

    list.innerHTML = visibleGroups.map(g => `
        <div class="group-card" onclick="window.openGroup('${escapeHtml(g.name)}')">
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

export async function openGroup(name) {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${name}.txt`;

    try {
        const { content, sha } = await state.github.getFileContent(path);
        state.currentGroup = name;
        state.currentGroupSha = sha;
        state.currentGroupData = WhitelistParser.parse(content);
        state.currentRuleType = 'whitelist';

        document.getElementById('editor-title').textContent = name;
        document.getElementById('group-name-display').textContent = name;
        document.getElementById('group-enabled').value = state.currentGroupData.enabled ? '1' : '0';
        document.getElementById('export-url').textContent = state.github.getRawUrl(path);

        // Disable editing if no write access
        document.getElementById('group-enabled').disabled = !state.canEdit;

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

export function renderRules() {
    const typeKey = state.currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : state.currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';
    const rules = state.currentGroupData[typeKey] || [];
    const search = document.getElementById('search-rules').value.toLowerCase();
    const displayed = search
        ? rules.filter(r => r.toLowerCase().includes(search))
        : rules;

    const list = document.getElementById('rules-list');

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'No results' : 'No rules in this section'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map((r) => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r)}</span>
            ${state.canEdit ? `<button class="btn btn-ghost btn-icon rule-delete" onclick="window.deleteRule('${escapeHtml(r)}', event)">🗑️</button>` : ''}
        </div>
    `).join('');
}

export function updateRuleCounts() {
    document.getElementById('count-whitelist').textContent = state.currentGroupData.whitelist?.length || 0;
    document.getElementById('count-blocked_subdomain').textContent = state.currentGroupData.blocked_subdomains?.length || 0;
    document.getElementById('count-blocked_path').textContent = state.currentGroupData.blocked_paths?.length || 0;
}

export async function deleteRule(value, event) {
    if (!state.canEdit) return;
    if (event) event.stopPropagation();

    const typeKey = state.currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : state.currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    state.currentGroupData[typeKey] = state.currentGroupData[typeKey].filter(r => r !== value);
    await saveCurrentGroup(`Eliminar ${value} de ${state.currentGroup}`);
}

export async function saveCurrentGroup(message) {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${state.currentGroup}.txt`;
    const content = WhitelistParser.serialize(state.currentGroupData);

    try {
        const result = await state.github.updateFile(path, content, message, state.currentGroupSha);
        state.currentGroupSha = result.content.sha;
        showToast('Cambios guardados');
        renderRules();
        updateRuleCounts();
    } catch (err) {
        showToast('Error guardando: ' + err.message, 'error');
    }
}

export async function deleteGroup() {
    if (!state.canEdit) return;
    if (!confirm('Delete this group and all its rules?')) return;

    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${state.currentGroup}.txt`;

    try {
        await state.github.deleteFile(path, `Eliminar grupo ${state.currentGroup}`, state.currentGroupSha);
        showToast('Grupo eliminado');
        showScreen('dashboard-screen');
        loadDashboard();
    } catch (err) {
        showToast('Error eliminando grupo: ' + err.message, 'error');
    }
}

// Expose functions for dynamic HTML onclicks
window.openGroup = openGroup;
window.deleteRule = deleteRule;
window.openNewGroupModal = () => {
    if (!state.canEdit) return;
    openModal('modal-new-group');
};
