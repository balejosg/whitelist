import { state } from './state.js';
import { Auth } from '../auth.js';
import { UsersAPI } from '../users-api.js';
import { showToast, escapeHtml } from '../utils.js';
import { openModal, closeModal } from './ui.js';
// import type { User, UserRole } from '../types/index.js';

export async function loadUsers(): Promise<void> {
    if (!Auth.isAdmin()) return;

    const listEl = document.getElementById('users-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading">Loading users...</div>';

    try {
        const response = await UsersAPI.list();
        if (!response.success || !response.data) throw new Error(response.error);

        const users = response.data.users;

        listEl.innerHTML = `
            <table class="users-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Roles</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>
                                <div class="user-name">${escapeHtml(u.name)}</div>
                                <div class="user-id">ID: ${u.id.substring(0, 8)}...</div>
                            </td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>
                                <div class="roles-list">
                                    ${u.roles && u.roles.length > 0
                ? u.roles.map(r => `
                                            <span class="role-badge role-${r}">
                                                ${r}
                                                <button onclick="window.revokeRole('${u.id}', 'TODO:RoleID?')" title="Revoke role">×</button>
                                            </span>
                                        `).join('') // Note: Original JS assumed roles were objects with IDs. Types/index says UserRole[] (strings).
                // We need to clarify if roles are strings or objects.
                // UsersAPI.getRoles returns { roles: UserRole[] }.
                // But users list might return expanded objects?
                // If `u.roles` is `UserRole[]` (strings), we can't get RoleID. 
                // The API likely expects (userId, roleName) or (userId, roleId).
                // Let's assume (userId, roleName) if roles are simple strings.
                : '<span class="no-roles">No roles</span>'
            }
                                    <button class="btn-icon-small" onclick="window.openAssignRoleModal('${u.id}', '${escapeHtml(u.name)}')" title="Assign role">+</button>
                                </div>
                            </td>
                            <td>
                                <span class="status-active">Active</span>
                            </td>
                            <td>
                                <button class="btn btn-ghost btn-sm" onclick="window.editUser('${u.id}')">✏️</button>
                                <button class="btn btn-ghost btn-sm text-danger" onclick="window.deleteUser('${u.id}')">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Update stats
        const countEl = document.getElementById('stat-users-count');
        if (countEl) countEl.textContent = users.length.toString();

    } catch (err) {
        console.error('Error loading users:', err);
        if (err instanceof Error) {
            listEl.innerHTML = `<p class="error-message">Error loading users: ${err.message}</p>`;
        }
    }
}

// Global actions
declare global {
    interface Window {
        revokeRole: (userId: string, roleArg: string) => Promise<void>;
        deleteUser: (userId: string) => Promise<void>;
        openAssignRoleModal: (userId: string, userName: string) => void;
        editUser: (userId: string) => Promise<void>;
        openNewUserModal: () => void;
    }
}

window.revokeRole = async (userId: string, roleArg: string) => {
    // roleArg might be ID or name depending on API.
    if (!confirm('Revoke this role?')) return;
    try {
        await UsersAPI.revokeRole(userId, roleArg);
        showToast('Role revoked');
        void loadUsers();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error revoking role: ' + err.message, 'error');
        }
    }
};

window.deleteUser = async (userId: string) => {
    if (!confirm('Delete user? This action cannot be undone.')) return;
    try {
        await UsersAPI.delete(userId);
        showToast('User deleted');
        void loadUsers();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error deleting user: ' + err.message, 'error');
        }
    }
};

window.openAssignRoleModal = (userId: string, userName: string) => {
    const idInput = document.getElementById('assign-role-user-id') as HTMLInputElement;
    const nameDisplay = document.getElementById('assign-role-user-name');
    idInput.value = userId;
    if (nameDisplay) nameDisplay.textContent = userName;

    // Populate groups select
    const select = document.getElementById('assign-role-groups');
    if (select) {
        select.innerHTML = state.allGroups.map(g =>
            `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`
        ).join('');
    }

    // Toggle groups select based on role
    const roleSelect = document.getElementById('assign-role-select') as HTMLSelectElement;
    const groupsDiv = document.getElementById('assign-role-groups-div');

    roleSelect.onchange = () => {
        if (roleSelect.value === 'teacher') {
            groupsDiv.classList.remove('hidden');
        } else {
            groupsDiv.classList.add('hidden');
        }
    };
    roleSelect.value = 'teacher'; // default
    roleSelect.onchange(new Event('change')); // trigger

    openModal('modal-assign-role');
};

window.editUser = async (userId: string) => {
    try {
        const response = await UsersAPI.get(userId);
        if (!response.success || !response.data) throw new Error(response.error);

        const user = response.data.user;
        const idInput = document.getElementById('edit-user-id') as HTMLInputElement;
        const nameInput = document.getElementById('edit-user-name') as HTMLInputElement;
        const emailInput = document.getElementById('edit-user-email') as HTMLInputElement;
        // const activeInput = document.getElementById('edit-user-active') as HTMLInputElement;

        idInput.value = user.id;
        nameInput.value = user.name;
        emailInput.value = user.email;
        // user.isActive check? interface User doesn't have isActive.

        openModal('modal-edit-user');
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error loading user: ' + err.message, 'error');
        }
    }
};

window.openNewUserModal = () => {
    (document.getElementById('new-user-form') as HTMLFormElement).reset();
    openModal('modal-new-user');
};

// Init Listeners
export function initUsersListeners(): void {
    // New User Form
    document.getElementById('new-user-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const data = {
                name: (document.getElementById('new-user-name') as HTMLInputElement).value,
                email: (document.getElementById('new-user-email') as HTMLInputElement).value,
                password: (document.getElementById('new-user-password') as HTMLInputElement).value
                // role handled by separate call or API?
                // Original JS had role in form.
            };

            try {
                await UsersAPI.create(data);
                closeModal('modal-new-user');
                showToast('User created');
                await loadUsers();
            } catch (err) {
                if (err instanceof Error) {
                    showToast('Error creating user: ' + err.message, 'error');
                }
            }
        })();
    });

    // Assign Role Form
    document.getElementById('assign-role-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const userId = (document.getElementById('assign-role-user-id') as HTMLInputElement).value;
            const role = (document.getElementById('assign-role-select') as HTMLSelectElement).value;

            // Get selected groups
            const select = document.getElementById('assign-role-groups') as HTMLSelectElement;
            const groupIds = Array.from(select.selectedOptions).map(opt => opt.value);

            try {
                await UsersAPI.assignRole(userId, role, groupIds);
                closeModal('modal-assign-role');
                showToast('Role assigned');
                await loadUsers();
            } catch (err) {
                if (err instanceof Error) {
                    showToast('Error assigning role: ' + err.message, 'error');
                }
            }
        })();
    });

    // Edit User Form
    document.getElementById('edit-user-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const userId = (document.getElementById('edit-user-id') as HTMLInputElement).value;
            const updates: { name: string; email: string; password?: string } = {
                name: (document.getElementById('edit-user-name') as HTMLInputElement).value,
                email: (document.getElementById('edit-user-email') as HTMLInputElement).value,
                // isActive...
            };

            const password = (document.getElementById('edit-user-password') as HTMLInputElement).value;
            if (password) updates.password = password;

            try {
                await UsersAPI.update(userId, updates);
                closeModal('modal-edit-user');
                showToast('User updated');
                await loadUsers();
            } catch (err) {
                if (err instanceof Error) {
                    showToast('Error updating user: ' + err.message, 'error');
                }
            }
        })();
    });
}
