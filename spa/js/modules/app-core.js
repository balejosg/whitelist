import { state, setGithub, setCurrentUser, setCanEdit } from './state.js';
import { showScreen } from './ui.js';
import { loadDashboard } from './groups.js';
import { loadUsers } from './users.js';

export async function init() {
    // 0. Check if setup is needed (first-time admin)
    const apiUrl = localStorage.getItem('requests_api_url') || '';
    if (apiUrl) {
        try {
            const setupStatus = await Setup.checkStatus();
            if (setupStatus.needsSetup) {
                showScreen('setup-screen');
                Setup.initSetupPage();
                return;
            }
        } catch (e) {
            console.warn('Setup check failed:', e);
            // Continue to normal login flow
        }
    }

    // 1. Check for OAuth callback first
    const callbackResult = OAuth.handleCallback();
    if (callbackResult?.error) {
        showScreen('login-screen');
        document.getElementById('login-error').textContent =
            'Authentication error: ' + callbackResult.error;
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
            try { await Auth.getMe(); user = Auth.getUser(); } catch (e) { }
            setCurrentUser(user);
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
        } else {
            showConfigScreen();
            return;
        }
    }

    // 6. Initialize GitHub API if possible
    if (isGitHubLoggedIn) {
        const api = new GitHubAPI(
            OAuth.getToken(),
            config.owner,
            config.repo,
            config.branch || 'main'
        );
        setGithub(api);
        const canWrite = await OAuth.canWrite(config.owner, config.repo);
        setCanEdit(canWrite);
    } else if (isJWTLoggedIn) {
        // Teachers/JWT users without GitHub OAuth have limited git access 
        setCanEdit(false);
    }

    // Update UI and start
    const userName = state.currentUser.login || state.currentUser.name || state.currentUser.email;
    document.getElementById('current-user').textContent = userName;

    updateEditUI();
    showScreen('dashboard-screen');
    loadDashboard();
}

export function showConfigScreen() {
    document.getElementById('config-username').textContent = state.currentUser.login;
    showScreen('config-screen');
}

export function updateEditUI() {
    const isAdmin = Auth.isAdmin() || state.canEdit;
    const isTeacher = Auth.isTeacher();
    // const isStudent = Auth.isStudent();

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
            document.getElementById('teacher-name').textContent = state.currentUser.name || state.currentUser.email;
            const groups = Auth.getTeacherGroups();
            document.getElementById('teacher-assigned-groups').textContent =
                groups.length > 0 ? groups.join(', ') : 'no groups yet';
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
        header.insertBefore(badge, header.firstChild);
    } else if (isAdmin && existingBadge) {
        existingBadge.remove();
    }

    // Schedule section (for teachers and admins)
    const scheduleSection = document.getElementById('schedule-section');
    if (scheduleSection) {
        const showSchedule = isAdmin || isTeacher;
        scheduleSection.classList.toggle('hidden', !showSchedule);

        if (showSchedule) {
            initScheduleSection();
        }
    }
}

// Initialize schedule section with classroom selector
async function initScheduleSection() {
    const select = document.getElementById('schedule-classroom-select');
    if (!select || select.dataset.initialized) return;

    select.dataset.initialized = 'true';

    // Load classrooms
    try {
        const response = await fetch(`${RequestsAPI?.apiUrl || ''}/api/classrooms`, {
            headers: Auth.getAuthHeaders()
        });
        const data = await response.json();

        if (data.success && data.classrooms) {
            select.innerHTML = '<option value="">Select classroom...</option>';
            data.classrooms.forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.display_name || c.name;
                select.appendChild(option);
            });
        }
    } catch (e) {
        console.error('Failed to load classrooms for schedule:', e);
    }

    // Handle classroom selection
    select.addEventListener('change', async () => {
        const classroomId = select.value;
        if (classroomId && window.SchedulesModule) {
            await window.SchedulesModule.init(classroomId);
        } else {
            document.getElementById('schedule-grid-container').innerHTML =
                '<p class="empty-message">Select a classroom to view its schedule</p>';
        }
    });

    // Refresh button
    document.getElementById('schedule-refresh-btn')?.addEventListener('click', async () => {
        const classroomId = select.value;
        if (classroomId && window.SchedulesModule) {
            await window.SchedulesModule.loadSchedules();
            window.SchedulesModule.render();
        }
    });
}
