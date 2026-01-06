import { state, setGithub, setCurrentUser, setCanEdit } from './state.js';
import { showScreen } from './ui.js';
import { loadDashboard } from './groups.js';
import { loadUsers } from './users.js';
import { oauth } from '../oauth.js';
import { auth } from '../auth.js';
import { config as appConfig } from '../config.js';
import { GitHubAPI } from '../github-api.js';
import { schedulesModule } from './schedules.js';
import { trpc } from '../trpc.js';
import { logger } from '../lib/logger.js';
import { setup } from '../setup.js';

export async function init(): Promise<void> {
    // 0. Check if system needs initial setup FIRST
    try {
        const status = await setup.checkStatus();
        if (status.needsSetup) {
            await setup.initSetupPage();
            showScreen('setup-screen');
            return;
        }
    } catch (e) {
        logger.warn('Setup status check failed, continuing to login', { 
            error: e instanceof Error ? e.message : String(e) 
        });
    }

    // 1. Check for OAuth callback first
    const callbackResult = oauth.handleCallback();
    if (callbackResult?.error) {
        showScreen('login-screen');
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.textContent = 'Authentication error: ' + callbackResult.error;
        return;
    }

    // 2. Check if logged in (either via GitHub OAuth or JWT)
    const isGitHubLoggedIn = oauth.isLoggedIn();
    const isJWTLoggedIn = auth.isAuthenticated();

    if (!isGitHubLoggedIn && !isJWTLoggedIn) {
        showScreen('login-screen');
        return;
    }

    // 3. Load user info
    try {
        if (isGitHubLoggedIn) {
            const user = await oauth.getUser();
            setCurrentUser(user);
        } else if (isJWTLoggedIn) {
            let user = auth.getUser();
            // Optional: refresh user info from server
            try {
                await auth.getMe();
                user = auth.getUser();
            } catch {
                // Ignore errors when refreshing user info
            }
            if (user) setCurrentUser(user);
        }
    } catch (err) {
        logger.error('Failed to load user', { error: err instanceof Error ? err.message : String(err) });
        showScreen('login-screen');
        return;
    }

    if (!state.currentUser) {
        showScreen('login-screen');
        return;
    }

    // 4. Setup Whitelist Requests API (Home Server) - Handled by tRPC client automatically via localStorage
    // const savedUrl = localStorage.getItem('requests_api_url') ?? '';
    // const savedToken = localStorage.getItem('requests_api_token') ?? '';
    // if (savedUrl) {
    //     RequestsAPI.init(savedUrl, savedToken);
    // }

    // 5. Check if repo config exists (only for admins/github users)
    const activeConfig = appConfig.get();
    if (!activeConfig.owner || !activeConfig.repo) {
        // If teacher, they don't need to configure the repo
        if (auth.isTeacher() && !auth.isAdmin()) {
            // But we need to make sure github-api is initialized with SOME credentials 
            // if we want them to see group names. 
        } else {
            showConfigScreen();
            return;
        }
    }

    // 6. Initialize GitHub API if possible
    if (isGitHubLoggedIn && activeConfig.owner && activeConfig.repo) {
        const token = oauth.getToken();
        if (token) {
            const api = new GitHubAPI(
                token,
                activeConfig.owner,
                activeConfig.repo,
                activeConfig.branch ?? 'main'
            );
            setGithub(api);
            const canWrite = await oauth.canWrite(activeConfig.owner, activeConfig.repo);
            setCanEdit(canWrite);
        }
    } else if (isJWTLoggedIn) {
        // Teachers/JWT users without GitHub OAuth have limited git access 
        setCanEdit(false);
    }

    // Update UI and start
    let userName = '';
    if (state.currentUser.login) userName = state.currentUser.login;
    else if (state.currentUser.name) userName = state.currentUser.name;
    else if (state.currentUser.email) userName = state.currentUser.email;
    const userEl = document.getElementById('current-user');
    if (userEl) userEl.textContent = userName;

    updateEditUI();
    showScreen('dashboard-screen');
    await loadDashboard();
}

export function showConfigScreen(): void {
    const el = document.getElementById('config-username');
    if (el && state.currentUser) {
        el.textContent = state.currentUser.login ?? state.currentUser.email;
    }
    showScreen('config-screen');
}

export function updateEditUI(): void {
    const isAdmin = auth.isAdmin() || state.canEdit;
    const isTeacher = auth.isTeacher();

    // Hide/show edit buttons based on permissions
    const editButtons = document.querySelectorAll(
        '#new-group-btn, #save-config-btn, #delete-group-btn, #add-rule-btn, #bulk-add-btn'
    );
    editButtons.forEach(btn => {
        (btn as HTMLElement).style.display = isAdmin ? '' : 'none';
    });

    // Toggle users section for admins
    const usersSection = document.getElementById('users-section');
    if (usersSection) {
        usersSection.classList.toggle('hidden', !auth.isAdmin());
        const adminBtn = document.getElementById('admin-users-btn');
        if (auth.isAdmin()) {
            void loadUsers();
            if (adminBtn) adminBtn.classList.remove('hidden');
        } else {
            if (adminBtn) adminBtn.classList.add('hidden');
        }
    }

    // Teacher Banner
    const teacherBanner = document.getElementById('teacher-banner');
    if (teacherBanner) {
        if (isTeacher && !isAdmin) {
            teacherBanner.classList.remove('hidden');
            const nameEl = document.getElementById('teacher-name');
            if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name || state.currentUser.email;

            const groups = auth.getTeacherGroups();
            const groupsEl = document.getElementById('teacher-assigned-groups');
            if (groupsEl) groupsEl.textContent = groups.length > 0 ? groups.join(', ') : 'no groups yet';
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
        badge.textContent = '👁️ Read-only';
        badge.style.background = 'rgba(234, 179, 8, 0.2)';
        badge.style.color = '#eab308';
        if (header) header.insertBefore(badge, header.firstChild);
    } else if (isAdmin && existingBadge) {
        existingBadge.remove();
    }

    // Schedule section (for teachers and admins)
    const scheduleSection = document.getElementById('schedule-section');
    if (scheduleSection) {
        const showSchedule = isAdmin || isTeacher;
        scheduleSection.classList.toggle('hidden', !showSchedule);

        if (showSchedule) {
            void initScheduleSection();
        }
    }
}

// Initialize schedule section with classroom selector
async function initScheduleSection(): Promise<void> {
    const select = document.getElementById('schedule-classroom-select') as HTMLSelectElement;

    select.dataset.initialized = 'true';

    // Load classrooms
    try {
        const classrooms = await trpc.classrooms.list.query();

        select.innerHTML = '<option value="">Select classroom...</option>';
        // Note: Classroom type in API vs SPA might differ slightly in casing (display_name vs displayName) 
        // but the query returns what API returns. 
        // In API router `list`: returns `Classroom[]`. 
        // In SPA types: `Classroom` has `display_name`?
        // Let's assume tRPC types from shared package will be correct.
        classrooms.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.displayName || c.name;
            select.appendChild(option);
        });
    } catch (e) {
        logger.error('Failed to load classrooms for schedule', { error: e instanceof Error ? e.message : String(e) });
    }

    // Handle classroom selection
    select.addEventListener('change', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await schedulesModule.init(classroomId);
        } else {
            const container = document.getElementById('schedule-grid-container');
            if (container) container.innerHTML = '<p class="empty-message">Select a classroom to view its schedule</p>';
        }
    })());

    // Refresh button
    document.getElementById('schedule-refresh-btn')?.addEventListener('click', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await schedulesModule.loadSchedules();
            schedulesModule.render();
        }
    })());
}
