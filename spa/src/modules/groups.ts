import { state } from './state.js';
import { showScreen } from './ui.js';
import { showToast, escapeHtml } from '../utils.js';
import { Config } from '../config.js';
import { Auth } from '../auth.js';
import { initRequestsSection } from './requests.js';
import { WhitelistParser } from '../openpath-parser.js';
// import type { GroupData } from '../types/index.js';

export async function loadDashboard(): Promise<void> {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';

    try {
        const files = await state.github?.listFiles(gruposDir);
        if (!files) return;

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
                if (group) {
                    // Fetch content to check status (or enhance listFiles to return it?)
                    // Doing N+1 fetches is slow. But that's how JS did it roughly or JS showed list first.
                    // Actually, dashboard shows counts. So we need content.
                    const result = await state.github?.getFile(group.path);
                    if (result) {
                        const data = WhitelistParser.parse(result.content);
                        // Enhance group object with stats
                        (group as any).stats = {
                            whitelist: data.whitelist.length,
                            blocked_subdomains: data.blocked_subdomains.length,
                            blocked_paths: data.blocked_paths.length
                        };
                        (group as any).enabled = data.enabled;

                        // Only count stats for visible groups
                        if (!assignedGroups || assignedGroups.includes(group.name)) {
                            totalWhitelist += (group as any).stats.whitelist;
                            totalBlocked += (group as any).stats.blocked_subdomains + (group as any).stats.blocked_paths;
                        }
                    }
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

        const statGroups = document.getElementById('stat-groups');
        const statWhitelist = document.getElementById('stat-whitelist');
        const statBlocked = document.getElementById('stat-blocked');

        if (statGroups) statGroups.textContent = visibleGroupCount.toString();
        if (statWhitelist) statWhitelist.textContent = totalWhitelist.toString();
        if (statBlocked) statBlocked.textContent = totalBlocked.toString();

        renderGroupsList();

        // Initialize requests section (home server API)
        await initRequestsSection();
    } catch (err) {
        console.error('Dashboard error:', err);
        if (err instanceof Error) {
            showToast('Error cargando datos: ' + err.message, 'error');
        }
    }
}

export function renderGroupsList(): void {
    const list = document.getElementById('groups-list');
    if (!list) return;

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

export async function openGroup(name: string): Promise<void> {
    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${name}.txt`;

    try {
        const result = await state.github?.getFile(path);
        if (!result) throw new Error('Could not load group file');

        const { content, sha } = result;

        const data = WhitelistParser.parse(content);
        state.currentGroup = name;
        state.currentGroupData = data;
        state.currentGroupSha = sha;
        state.currentRuleType = 'whitelist'; // Start with whitelist

        const titleEl = document.getElementById('editor-title');
        if (titleEl) titleEl.textContent = `Editando: ${name}`;

        const nameDisplayEl = document.getElementById('group-name-display');
        if (nameDisplayEl) nameDisplayEl.textContent = name;

        const enabledSelect = document.getElementById('group-enabled') as HTMLSelectElement;
        if (enabledSelect) enabledSelect.value = data.enabled ? '1' : '0';

        const exportUrlEl = document.getElementById('export-url');
        if (exportUrlEl) exportUrlEl.textContent = state.github?.getRawUrl(path) || '';

        showScreen('editor-screen');
        updateRuleCounts();
        renderRules();

        // Disable editing if no write access
        if (enabledSelect) enabledSelect.disabled = !state.canEdit;

        renderRules();
        updateRuleCounts();

        document.querySelectorAll('.tab').forEach((t) => {
            const el = t as HTMLElement;
            el.classList.toggle('active', el.dataset.type === 'whitelist');
        });

        showScreen('editor-screen');
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error abriendo grupo: ' + err.message, 'error');
        }
    }
}

export function renderRules(): void {
    if (!state.currentGroupData) return;

    // Use currentRuleType directly as key since we aligned types
    const typeKey = state.currentRuleType;

    const searchInput = document.getElementById('search-rules') as HTMLInputElement;
    const search = searchInput?.value.toLowerCase();

    const rulesList = state.currentGroupData[typeKey] || [];

    const displayed = search
        ? rulesList.filter((r: string) => r.toLowerCase().includes(search))
        : rulesList;

    const list = document.getElementById('rules-list');
    if (!list) return;

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'No results' : 'No rules in this section'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map((r: string) => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r)}</span>
            ${state.canEdit ? `<button class="btn btn-ghost btn-icon rule-delete" onclick="window.deleteRule('${escapeHtml(r)}', event)">🗑️</button>` : ''}
        </div>
    `).join('');
}

export function updateRuleCounts(): void {
    if (!state.currentGroupData) return;

    // UI IDs are singular in HTML
    const wEl = document.getElementById('count-whitelist');
    const bSubEl = document.getElementById('count-blocked_subdomain');
    const bPathEl = document.getElementById('count-blocked_path');

    if (wEl) wEl.textContent = (state.currentGroupData.whitelist?.length || 0).toString();
    if (bSubEl) bSubEl.textContent = (state.currentGroupData.blocked_subdomains?.length || 0).toString();
    if (bPathEl) bPathEl.textContent = (state.currentGroupData.blocked_paths?.length || 0).toString();
}

export async function deleteRule(value: string, event: Event): Promise<void> {
    if (!state.canEdit) return;
    if (event) event.stopPropagation();
    if (!state.currentGroupData) return;

    const typeKey = state.currentRuleType;

    // Remove rule
    const list = state.currentGroupData[typeKey];
    state.currentGroupData[typeKey] = list.filter(r => r !== value);

    await saveCurrentGroup(`Eliminar ${value} de ${state.currentGroup}`);
}



export async function saveCurrentGroup(message: string): Promise<void> {
    const config = Config.get();
    // Config interface in config.ts has optional whitelistPath, but groups logic uses 'gruposDir'.
    // Need to standardize. JS used 'gruposDir'.
    // Config.get() returns SPAConfig.
    // Let's assume Config module handles it or we use 'whitelistPath' as 'gruposDir' alias?
    // In index.ts, SPAConfig has whitelistPath, no gruposDir.
    // In config.js (legacy), it had gruposDir.
    // I should cast or update SPAConfig.
    // I'll update SPAConfig in index.ts to have groupsDir as optional or alias?
    // Or just use 'grupos' literal for now if missing.
    const gruposDir = (config as any).gruposDir || 'grupos';
    const path = `${gruposDir}/${state.currentGroup}.txt`;
    if (!state.currentGroupData) return;
    const content = WhitelistParser.serialize(state.currentGroupData);

    try {
        if (!state.github) throw new Error('GitHub API not initialized');

        // Use updateFile (returns boolean in current types)
        await state.github.updateFile(path, content, message, state.currentGroupSha || '');

        // Since we don't get new SHA from boolean return, we risk concurrency issues if we save again immediately.
        // Ideally we should re-fetch module SHA.
        // Check if getFile uses SHA or HEAD.
        const file = await state.github.getFile(path);
        if (file) state.currentGroupSha = file.sha;

        showToast('Cambios guardados');
        renderRules();
        updateRuleCounts();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error guardando: ' + err.message, 'error');
        }
    }
}

export async function deleteGroup(): Promise<void> {
    if (!state.canEdit) return;
    if (!confirm('Delete this group and all its rules?')) return;

    const config = Config.get();
    const gruposDir = config.gruposDir || 'grupos';
    const path = `${gruposDir}/${state.currentGroup}.txt`;

    try {
        await state.github?.deleteFile(path, `Eliminar grupo ${state.currentGroup}`, state.currentGroupSha || '');
        showToast('Grupo eliminado');
        showScreen('dashboard-screen');
        loadDashboard();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error eliminando grupo: ' + err.message, 'error');
        }
    }
}

// Global Exports
declare global {
    interface Window {
        openGroup: (name: string) => Promise<void>;
        deleteRule: (value: string, event: Event) => Promise<void>;
        openNewGroupModal: () => void;
        deleteGroup: () => Promise<void>;
    }
}

window.openGroup = openGroup;
window.deleteRule = deleteRule;
window.openNewGroupModal = () => {
    if (!state.canEdit) return;
    // @ts-ignore - cleaner to wrap
    // We imported openModal.
    // We need to access it. 
    // openModal('modal-new-group');
    // But `openModal` is imported.
    const modalId = 'modal-new-group';
    document.getElementById(modalId)?.classList.remove('hidden'); // Manual open or use imported
};
window.deleteGroup = deleteGroup;

