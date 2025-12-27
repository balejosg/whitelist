import { init, updateEditUI } from './modules/app-core.js';
import { PushManager } from './push.js';
import { initUsersListeners } from './modules/users.js';
import { initClassroomListeners } from './modules/classrooms.js';
import { initModals, showScreen, openModal, closeModal } from './modules/ui.js';
import { Auth } from './auth.js';
import { OAuth } from './oauth.js';
import { showToast } from './modules/utils.js';
import { state, setGithub, setCanEdit } from './modules/state.js';
import { loadDashboard, renderRules, saveCurrentGroup, deleteGroup } from './modules/groups.js';
import { Config } from './config.js';
import { GitHubAPI } from './github-api.js';
import { WhitelistParser } from './openpath-parser.js';
import type { GroupData } from './types/index.js';

// Initialize application
document.addEventListener('DOMContentLoaded', () => void (async () => {
    console.log('OpenPath SPA initializing...');

    // Initialize UI listeners
    initModals();
    initUsersListeners();
    initClassroomListeners();
    initMainListeners();

    // Initialize Core
    await init();

    // Initialize Push Notifications (if logged in)
    try {
        await PushManager.init();
    } catch (e) {
        console.warn('Push init failed:', e);
    }
})());

function initMainListeners() {
    // ============== Login Listeners ==============

    // Email Login
    document.getElementById('email-login-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        const emailInput = document.getElementById('login-email') as HTMLInputElement;
        const passwordInput = document.getElementById('login-password') as HTMLInputElement;
        const errorEl = document.getElementById('login-error');
        const btn = document.getElementById('email-login-btn') as HTMLButtonElement;

        if (!emailInput || !passwordInput || !btn) return;

        if (errorEl) errorEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Authenticating...';

        try {
            await Auth.login(emailInput.value, passwordInput.value);
            await init(); // Re-initialize the app
        } catch (err: unknown) {
            if (errorEl && err instanceof Error) errorEl.textContent = 'Error: ' + err.message;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Access Dashboard';
        }
    })());

    // GitHub login button
    document.getElementById('github-login-btn')?.addEventListener('click', () => {
        OAuth.login();
    });

    // Notifications button
    document.getElementById('notifications-btn')?.addEventListener('click', () => void (async () => {
        if (!PushManager.isSupported()) {
            showToast('Your browser does not support push notifications', 'error');
            return;
        }

        const btn = document.getElementById('notifications-btn') as HTMLButtonElement;
        const icon = document.getElementById('notifications-icon');

        if (!btn || !icon) return;

        try {
            const subscription = await PushManager.getSubscription();

            if (subscription) {
                // Already subscribed, offer to unsubscribe
                if (confirm('Disable push notifications?')) {
                    await PushManager.unsubscribe();
                    icon.textContent = '🔕';
                    showToast('Notifications disabled');
                }
            } else {
                // Not subscribed, subscribe
                btn.disabled = true;
                icon.textContent = '⏳';
                await PushManager.subscribe();
                icon.textContent = '🔔';
                showToast('Notifications enabled! You will receive alerts when a student requests access.');
            }
        } catch (err: unknown) {
            console.error('Push notification error:', err);
            icon.textContent = '🔕';
            if (err instanceof Error) {
                if (err.message.includes('denied')) {
                    showToast('Notification permission denied. Enable it in browser settings.', 'error');
                } else {
                    showToast('Error setting up notifications: ' + err.message, 'error');
                }
            } else {
                showToast('Error setting up notifications: Unknown error', 'error');
            }
        } finally {
            btn.disabled = false;
        }
    })());

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        if (confirm('Log out?')) {
            OAuth.logout();
            Auth.logout();
            showScreen('login-screen');
        }
    });

    // Repo config form
    document.getElementById('repo-config-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        const errorEl = document.getElementById('config-error');
        if (errorEl) errorEl.textContent = '';

        const ownerInput = document.getElementById('config-owner') as HTMLInputElement;
        const repoInput = document.getElementById('config-repo') as HTMLInputElement;
        const branchInput = document.getElementById('config-branch') as HTMLInputElement;
        const gruposDirInput = document.getElementById('config-grupos-dir') as HTMLInputElement;

        const owner = ownerInput.value.trim();
        const repo = repoInput.value.trim();
        const branch = branchInput.value.trim() || 'main';
        const gruposDir = gruposDirInput.value.trim() || 'grupos';

        // Test connection
        try {
            const token = OAuth.getToken();
            if (!token) throw new Error('No OAuth token');

            const api = new GitHubAPI(token, owner, repo, branch);
            await api.listFiles(gruposDir);

            // Update state
            setGithub(api);
            Config.save({ owner, repo, branch, gruposDir, whitelistPath: gruposDir }); // whitelistPath logic

            const canWrite = await OAuth.canWrite(owner, repo);
            setCanEdit(canWrite);

            const userEl = document.getElementById('current-user');
            if (userEl && state.currentUser) userEl.textContent = state.currentUser.login || '';
            updateEditUI();
            showScreen('dashboard-screen');
            loadDashboard();
        } catch (err: unknown) {
            if (errorEl && err instanceof Error) {
                if (err.message.includes('Not Found')) {
                    errorEl.textContent = `Directory "${gruposDir}" not found in ${owner}/${repo}`;
                } else {
                    errorEl.textContent = err.message;
                }
            }
        }
    })());

    // Navigation for Admins
    document.getElementById('admin-users-btn')?.addEventListener('click', () => {
        document.getElementById('users-section')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const rawType = (tab as HTMLElement).dataset.type;
            // Map singular to plural keys for state
            let type: 'whitelist' | 'blocked_subdomains' | 'blocked_paths' = 'whitelist';
            if (rawType === 'blocked_subdomain') type = 'blocked_subdomains';
            else if (rawType === 'blocked_path') type = 'blocked_paths';

            state.currentRuleType = type;
            document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); });
            tab.classList.add('active');
            renderRules();
        });
    });

    // Search rules
    document.getElementById('search-rules')?.addEventListener('input', () => { renderRules(); });

    // Back button
    document.getElementById('back-btn')?.addEventListener('click', () => {
        showScreen('dashboard-screen');
        loadDashboard();
    });

    // Save group config (enable/disable)
    document.getElementById('save-config-btn')?.addEventListener('click', () => void (async () => {
        if (!state.canEdit || !state.currentGroupData) return;
        const enabledSelect = document.getElementById('group-enabled') as HTMLSelectElement;
        state.currentGroupData.enabled = enabledSelect.value === '1';
        await saveCurrentGroup('Update group status');
    })());

    // Delete group
    document.getElementById('delete-group-btn')?.addEventListener('click', () => {
        deleteGroup();
    });

    // Copy URL
    document.getElementById('copy-url-btn')?.addEventListener('click', () => {
        const urlEl = document.getElementById('export-url');
        if (urlEl) {
            navigator.clipboard.writeText(urlEl.textContent || '');
            showToast('URL copied to clipboard');
        }
    });

    // Add Rule Modal Trigger
    document.getElementById('add-rule-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-add-rule');
    });

    // Add Rule Form
    document.getElementById('add-rule-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        if (!state.canEdit || !state.currentGroupData) return;

        const input = document.getElementById('new-rule-value') as HTMLInputElement;
        const value = input.value.toLowerCase().trim();

        if (!value) {
            showToast('Value required', 'error');
            return;
        }

        const typeKey = state.currentRuleType;
        // Check if rule exists
        const list = state.currentGroupData[typeKey] || [];
        if (list.includes(value)) {
            showToast('Rule already exists', 'error');
            return;
        }

        state.currentGroupData[typeKey].push(value);
        await saveCurrentGroup(`Add ${value} to ${state.currentGroup}`);

        closeModal('modal-add-rule');
        (document.getElementById('add-rule-form') as HTMLFormElement).reset();
    })());

    // Bulk Add Modal Trigger
    document.getElementById('bulk-add-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-bulk-add');
    });

    // Bulk Add Form
    document.getElementById('bulk-add-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        if (!state.canEdit || !state.currentGroupData) return;

        const input = document.getElementById('bulk-values') as HTMLTextAreaElement;
        const text = input.value;
        const values = text.split('\n').map(v => v.toLowerCase().trim()).filter(v => v);

        if (values.length === 0) {
            showToast('No values to add', 'error');
            return;
        }

        const typeKey = state.currentRuleType;
        let added = 0;

        // Ensure array exists
        if (!state.currentGroupData[typeKey]) state.currentGroupData[typeKey] = [];

        for (const value of values) {
            if (!state.currentGroupData[typeKey].includes(value)) {
                state.currentGroupData[typeKey].push(value);
                added++;
            }
        }

        if (added > 0) {
            await saveCurrentGroup(`Add ${added} rules to ${state.currentGroup}`);
        }

        closeModal('modal-bulk-add');
        (document.getElementById('bulk-add-form') as HTMLFormElement).reset();
        showToast(`${added} rules added`);
    })());

    // New Group Form
    document.getElementById('new-group-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        if (!state.canEdit || !state.github) return;

        const input = document.getElementById('new-group-name') as HTMLInputElement;
        const name = input.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

        if (!name) {
            showToast('Name required', 'error');
            return;
        }

        const config = Config.get();
        const gruposDir = config.gruposDir || 'grupos'; // Fix: config interface needs checking
        const path = `${gruposDir}/${name}.txt`;

        const initialData: GroupData = {
            enabled: true,
            whitelist: [],
            blocked_subdomains: [],
            blocked_paths: []
        };
        const content = WhitelistParser.serialize(initialData);

        try {
            await state.github.updateFile(path, content, `Create group ${name}`, ''); // '' for new file
            closeModal('modal-new-group');
            (document.getElementById('new-group-form') as HTMLFormElement).reset();
            showToast('Group created');
            loadDashboard();
        } catch (err: unknown) {
            if (err instanceof Error) showToast(err.message, 'error');
        }
    })());

    // New Group Button
    document.getElementById('new-group-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-new-group');
    });
}
