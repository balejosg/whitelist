import { init, showConfigScreen, updateEditUI } from './app-core.js';
import { initModals, showScreen } from './ui.js';
import { initUsersListeners } from './users.js';
import { showToast } from './utils.js';
import { state, setGithub, setCanEdit } from './state.js';
import { loadDashboard, renderRules, saveCurrentGroup, deleteGroup, openNewGroupModal } from './groups.js';

// Initialize Modals
initModals();

// Initialize User Management Listeners
initUsersListeners();

// ============== Login Listeners ==============

// Email Login
document.getElementById('email-login-form')?.addEventListener('submit', async (e) => {
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
document.getElementById('github-login-btn')?.addEventListener('click', () => {
    OAuth.login();
});

// Notifications button
document.getElementById('notifications-btn')?.addEventListener('click', async () => {
    if (!PushManager.isSupported()) {
        showToast('Tu navegador no soporta notificaciones push', 'error');
        return;
    }

    const btn = document.getElementById('notifications-btn');
    const icon = document.getElementById('notifications-icon');

    try {
        const subscription = await PushManager.getSubscription();

        if (subscription) {
            // Already subscribed, offer to unsubscribe
            if (confirm('¿Desactivar notificaciones push?')) {
                await PushManager.unsubscribe();
                icon.textContent = '🔕';
                showToast('Notificaciones desactivadas');
            }
        } else {
            // Not subscribed, subscribe
            btn.disabled = true;
            icon.textContent = '⏳';
            await PushManager.subscribe();
            icon.textContent = '🔔';
            showToast('¡Notificaciones activadas! Recibirás alertas cuando un alumno solicite acceso.');
        }
    } catch (err) {
        console.error('Push notification error:', err);
        icon.textContent = '🔕';
        if (err.message.includes('denied')) {
            showToast('Permiso de notificaciones denegado. Habilítalo en la configuración del navegador.', 'error');
        } else {
            showToast('Error configurando notificaciones: ' + err.message, 'error');
        }
    } finally {
        btn.disabled = false;
    }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
        OAuth.logout();
        Auth.logout();
        showScreen('login-screen');
    }
});

// Repo config form
document.getElementById('repo-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('config-error');
    errorEl.textContent = '';

    const owner = document.getElementById('config-owner').value.trim();
    const repo = document.getElementById('config-repo').value.trim();
    const branch = document.getElementById('config-branch').value.trim() || 'main';
    const gruposDir = document.getElementById('config-grupos-dir').value.trim() || 'grupos';

    // Test connection
    try {
        const api = new GitHubAPI(OAuth.getToken(), owner, repo, branch);
        await api.listFiles(gruposDir);

        // Update state
        setGithub(api);
        Config.save({ owner, repo, branch, gruposDir });

        const canWrite = await OAuth.canWrite(owner, repo);
        setCanEdit(canWrite);

        document.getElementById('current-user').textContent = state.currentUser.login;
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

// Navigation for Admins
document.getElementById('admin-users-btn')?.addEventListener('click', () => {
    document.getElementById('users-section').scrollIntoView({ behavior: 'smooth' });
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        state.currentRuleType = tab.dataset.type;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderRules();
    });
});

// Search rules
document.getElementById('search-rules')?.addEventListener('input', () => renderRules());

// Back button
document.getElementById('back-btn')?.addEventListener('click', () => {
    showScreen('dashboard-screen');
    loadDashboard();
});

// Save group config (enable/disable)
document.getElementById('save-config-btn')?.addEventListener('click', async () => {
    if (!state.canEdit) return;
    state.currentGroupData.enabled = document.getElementById('group-enabled').value === '1';
    await saveCurrentGroup('Actualizar estado del grupo');
});

// Delete group
document.getElementById('delete-group-btn')?.addEventListener('click', () => {
    deleteGroup();
});

// Copy URL
document.getElementById('copy-url-btn')?.addEventListener('click', () => {
    const url = document.getElementById('export-url').textContent;
    navigator.clipboard.writeText(url);
    showToast('URL copiada al portapapeles');
});

// Add Rule Modal Trigger - Handled by modules/groups.js logic but button listener here
document.getElementById('add-rule-btn')?.addEventListener('click', () => {
    if (!state.canEdit) return;
    openModal('modal-add-rule');
});

// Add Rule Form
document.getElementById('add-rule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.canEdit) return;

    const value = document.getElementById('new-rule-value').value.toLowerCase().trim();

    if (!value) {
        showToast('Valor requerido', 'error');
        return;
    }

    const typeKey = state.currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : state.currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    if (state.currentGroupData[typeKey].includes(value)) {
        showToast('La regla ya existe', 'error');
        return;
    }

    state.currentGroupData[typeKey].push(value);
    await saveCurrentGroup(`Añadir ${value} a ${state.currentGroup}`);

    closeModal('modal-add-rule');
    document.getElementById('add-rule-form').reset();
});

// Bulk Add Modal Trigger
document.getElementById('bulk-add-btn')?.addEventListener('click', () => {
    if (!state.canEdit) return;
    openModal('modal-bulk-add');
});

// Bulk Add Form
document.getElementById('bulk-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.canEdit) return;

    const text = document.getElementById('bulk-values').value;
    const values = text.split('\n').map(v => v.toLowerCase().trim()).filter(v => v);

    if (values.length === 0) {
        showToast('No hay valores para añadir', 'error');
        return;
    }

    const typeKey = state.currentRuleType === 'blocked_subdomain' ? 'blocked_subdomains'
        : state.currentRuleType === 'blocked_path' ? 'blocked_paths'
            : 'whitelist';

    let added = 0;
    for (const value of values) {
        if (!state.currentGroupData[typeKey].includes(value)) {
            state.currentGroupData[typeKey].push(value);
            added++;
        }
    }

    if (added > 0) {
        await saveCurrentGroup(`Añadir ${added} reglas a ${state.currentGroup}`);
    }

    closeModal('modal-bulk-add');
    document.getElementById('bulk-add-form').reset();
    showToast(`${added} reglas añadidas`);
});

// New Group Form -> Handled in main or groups? 
// app.js handled it. It depends on 'openNewGroupModal' logic.
// The form submit listener:
document.getElementById('new-group-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.canEdit) return;

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
        await state.github.updateFile(path, content, `Crear grupo ${name}`);
        closeModal('modal-new-group');
        document.getElementById('new-group-form').reset();
        showToast('Grupo creado');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// New Group Button
document.getElementById('new-group-btn')?.addEventListener('click', () => {
    if (!state.canEdit) return;
    openModal('modal-new-group'); // From ui.js export
});


// Start application
init();
