import { getErrorMessage, normalize } from '@openpath/shared';
import { init, updateEditUI } from './modules/app-core.js';
import { pushManager } from './push.js';
import { initUsersListeners } from './modules/users.js';
import { initClassroomListeners } from './modules/classrooms.js';
import { initModals, showScreen, openModal, closeModal, initTheme, toggleTheme } from './modules/ui.js';
import { auth } from './auth.js';
import { oauth } from './oauth.js';
import { setup } from './setup.js';
import { showToast } from './utils.js';
import { state, setGithub, setCanEdit } from './modules/state.js';
import { loadDashboard, renderRules, saveCurrentGroup, deleteGroup } from './modules/groups.js';
import { config } from './config.js';
import { GitHubAPI } from './github-api.js';
import { whitelistParser } from './openpath-parser.js';
import { logger } from './lib/logger.js';
import { getElement, requireElement } from './lib/dom.js';
import type { GroupData } from './types/index.js';

// Initialize application
document.addEventListener('DOMContentLoaded', () => void (async () => {
    logger.info('OpenPath SPA initializing...');

    // Initialize UI listeners
    initTheme();
    initModals();
    initUsersListeners();
    initClassroomListeners();
    initMainListeners();

    // Initialize Core
    await init();

    await initSetupLink();

    // Initialize Push Notifications (if logged in)
    try {
        await pushManager.init();
    } catch (e) {
        logger.warn('Push init failed', { error: getErrorMessage(e) });
    }
})());

async function initSetupLink(): Promise<void> {
    const container = getElement('setup-link-container');
    if (container === null) return;

    try {
        const status = await setup.checkStatus();
        if (status.needsSetup) {
            container.classList.remove('hidden');
        }
    } catch (e) {
        logger.warn('Failed to evaluate setup status', { error: getErrorMessage(e) });
    }
}

function initMainListeners() {
    // ============== Login Listeners ==============

    // Email Login
    getElement('email-login-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        const emailInput = requireElement<HTMLInputElement>('login-email');
        const passwordInput = requireElement<HTMLInputElement>('login-password');
        const errorEl = getElement('login-error');
        const btn = requireElement<HTMLButtonElement>('email-login-btn');

        if (errorEl) errorEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Authenticating...';

        try {
            await auth.login(emailInput.value, passwordInput.value);
            await init(); // Re-initialize the app
        } catch (err: unknown) {
            if (errorEl) errorEl.textContent = 'Error: ' + getErrorMessage(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Access Dashboard';
        }
    })());

    // GitHub login button
    document.getElementById('github-login-btn')?.addEventListener('click', () => {
        oauth.login();
    });

    // Notifications button
    document.getElementById('notifications-btn')?.addEventListener('click', () => void (async () => {
        if (!pushManager.isSupported()) {
            showToast('Your browser does not support push notifications', 'error');
            return;
        }

        const btn = document.getElementById('notifications-btn') as HTMLButtonElement;
        const icon = document.getElementById('notifications-icon');

        try {
            const subscription = await pushManager.getSubscription();

            if (subscription) {
                // Already subscribed, offer to unsubscribe
                if (confirm('Disable push notifications?')) {
                    await pushManager.unsubscribe();
                    if (icon) icon.textContent = '🔕';
                    showToast('Notifications disabled');
                }
            } else {
                // Not subscribed, subscribe
                btn.disabled = true;
                if (icon) icon.textContent = '⏳';
                await pushManager.subscribe();
                if (icon) icon.textContent = '🔔';
                showToast('Notifications enabled! You will receive alerts when a student requests access.');
            }
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            logger.error('Push notification error', { error: message });
            if (icon) icon.textContent = '🔕';
            if (message.includes('denied')) {
                showToast('Notification permission denied. Enable it in browser settings.', 'error');
            } else {
                showToast('Error setting up notifications: ' + message, 'error');
            }
        } finally {
            btn.disabled = false;
        }
    })());

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        if (confirm('Log out?')) {
            oauth.logout();
            void auth.logout();
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
            const token = oauth.getToken();
            if (!token) throw new Error('No OAuth token');

            const api = new GitHubAPI(token, owner, repo, branch);
            await api.listFiles(gruposDir);

            // Update state
            setGithub(api);
            config.save({ owner, repo, branch, gruposDir, whitelistPath: gruposDir }); // whitelistPath logic

            const canWrite = await oauth.canWrite(owner, repo);
            setCanEdit(canWrite);

            const userEl = document.getElementById('current-user');
            if (userEl && state.currentUser) userEl.textContent = state.currentUser.login ?? '';
            updateEditUI();
            showScreen('dashboard-screen');
            void loadDashboard();
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
            // Map keys for state
            let type: 'whitelist' | 'blockedSubdomains' | 'blockedPaths' = 'whitelist';
            if (rawType === 'blockedSubdomains') type = 'blockedSubdomains';
            else if (rawType === 'blockedPaths') type = 'blockedPaths';

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
        void loadDashboard();
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
        void deleteGroup();
    });

    // Copy URL
    document.getElementById('copy-url-btn')?.addEventListener('click', () => void (async () => {
        const urlEl = document.getElementById('export-url');
        if (!urlEl) return;

        const text = urlEl.textContent;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            showToast('URL copied to clipboard');
        } catch (e) {
            logger.warn('Failed to copy URL', { error: getErrorMessage(e) });
            showToast('Failed to copy URL', 'error');
        }
    })());

    document.getElementById('copy-registration-token-btn')?.addEventListener('click', () => {
        const tokenEl = document.getElementById('setup-registration-token');
        const token = tokenEl?.textContent.trim();
        if (!token) {
            showToast('No token to copy', 'error');
            return;
        }
        void (async () => {
            try {
                await navigator.clipboard.writeText(token);
                showToast('Token copied to clipboard');
            } catch (e) {
                logger.warn('Failed to copy registration token', { error: getErrorMessage(e) });
                showToast('Failed to copy token', 'error');
            }
        })();
    });

    // Add Rule Modal Trigger
    document.getElementById('add-rule-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-add-rule');
    });

    // Add Rule Form
    getElement('add-rule-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        if (!state.canEdit || !state.currentGroupData) return;

        const input = requireElement<HTMLInputElement>('new-rule-value');
        const value = normalize.domain(input.value);

        if (!value) {
            showToast('Value required', 'error');
            return;
        }

        const typeKey = state.currentRuleType;
        // Check if rule exists
        const list = state.currentGroupData[typeKey];
        if (list.includes(value)) {
            showToast('Rule already exists', 'error');
            return;
        }

        state.currentGroupData[typeKey].push(value);
        await saveCurrentGroup(`Add ${value} to ${state.currentGroup ?? ''}`);

        closeModal('modal-add-rule');
        (document.getElementById('add-rule-form') as HTMLFormElement).reset();
    })());

    // Bulk Add Modal Trigger
    document.getElementById('bulk-add-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-bulk-add');
    });

    // Bulk Add Form
    getElement('bulk-add-form')?.addEventListener('submit', (e) => void (async () => {
        e.preventDefault();
        if (!state.canEdit || !state.currentGroupData) return;

        const input = requireElement<HTMLTextAreaElement>('bulk-values');
        const text = input.value;
        const values = text.split('\n').map(v => normalize.domain(v)).filter(v => v);

        if (values.length === 0) {
            showToast('No values to add', 'error');
            return;
        }

        const typeKey = state.currentRuleType;
        let added = 0;

        // Ensure array exists
        // Array already exists per GroupData type definition

        for (const value of values) {
            if (!state.currentGroupData[typeKey].includes(value)) {
                state.currentGroupData[typeKey].push(value);
                added++;
            }
        }

        if (added > 0) {
            await saveCurrentGroup(`Add ${added.toString()} rules to ${state.currentGroup ?? ''}`);
        }

        closeModal('modal-bulk-add');
        (document.getElementById('bulk-add-form') as HTMLFormElement).reset();
        showToast(`${added.toString()} rules added`);
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

        const appConfig = config.get();
        const gruposDir = appConfig.gruposDir ?? 'grupos';
        const path = `${gruposDir}/${name}.txt`;

        const initialData: GroupData = {
            enabled: true,
            whitelist: [],
            blockedSubdomains: [],
            blockedPaths: []
        };
        const content = whitelistParser.serialize(initialData);

        try {
            await state.github.updateFile(path, content, `Create group ${name}`, ''); // '' for new file
            closeModal('modal-new-group');
            (document.getElementById('new-group-form') as HTMLFormElement).reset();
            showToast('Group created');
            void loadDashboard();
        } catch (err: unknown) {
            if (err instanceof Error) showToast(err.message, 'error');
        }
    })());

    // New Group Button
    document.getElementById('new-group-btn')?.addEventListener('click', () => {
        if (!state.canEdit) return;
        openModal('modal-new-group');
    });

    // Theme Toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        toggleTheme();
    });
}
