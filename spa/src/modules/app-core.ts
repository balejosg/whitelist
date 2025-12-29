import { state, setGithub, setCurrentUser, setCanEdit } from './state.js';
import { showScreen } from './ui.js';
import { loadDashboard } from './groups.js';
import { loadUsers } from './users.js';
import { OAuth } from '../oauth.js';
import { Auth } from '../auth.js';
import { Config } from '../config.js';
import { GitHubAPI } from '../github-api.js';
import { SchedulesModule } from './schedules.js';
import { trpc } from '../trpc.js';

export async function init(): Promise<void> {
    // 1. Check for OAuth callback first
    const callbackResult = OAuth.handleCallback();
    if (callbackResult?.error) {
        showScreen('login-screen');
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.textContent = 'Authentication error: ' + callbackResult.error;
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
            const user = await OAuth.getUser();
            setCurrentUser(user);
        } else if (isJWTLoggedIn) {
            let user = Auth.getUser();
            // Optional: refresh user info from server
            try {
                await Auth.getMe();
                user = Auth.getUser();
            } catch {
                // Ignore errors when refreshing user info
            }
            if (user) setCurrentUser(user);
        }
    } catch (err) {
        console.error('Failed to load user:', err);
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
    const config = Config.get();
    if (!config.owner || !config.repo) {
        // If teacher, they don't need to configure the repo
        if (Auth.isTeacher() && !Auth.isAdmin()) {
            // But we need to make sure github-api is initialized with SOME credentials 
            // if we want them to see group names. 
        } else {
            showConfigScreen();
            return;
        }
    }

    // 6. Initialize GitHub API if possible
    if (isGitHubLoggedIn && config.owner && config.repo) {
        const token = OAuth.getToken();
        if (token) {
            const api = new GitHubAPI(
                token,
                config.owner,
                config.repo,
                config.branch ?? 'main'
            );
            setGithub(api);
            const canWrite = await OAuth.canWrite(config.owner, config.repo);
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
    const isAdmin = Auth.isAdmin() || state.canEdit;
    const isTeacher = Auth.isTeacher();

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
        usersSection.classList.toggle('hidden', !Auth.isAdmin());
        const adminBtn = document.getElementById('admin-users-btn');
        if (Auth.isAdmin()) {
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

            const groups = Auth.getTeacherGroups();
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
        console.error('Failed to load classrooms for schedule:', e);
    }

    // Handle classroom selection
    select.addEventListener('change', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await SchedulesModule.init(classroomId);
        } else {
            const container = document.getElementById('schedule-grid-container');
            if (container) container.innerHTML = '<p class="empty-message">Select a classroom to view its schedule</p>';
        }
    })());

    // Refresh button
    document.getElementById('schedule-refresh-btn')?.addEventListener('click', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await SchedulesModule.loadSchedules();
            SchedulesModule.render();
        }
    })());
}
