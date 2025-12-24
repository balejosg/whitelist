import { state } from './state.js';
import { relativeTime, escapeHtml, showToast } from './utils.js';
import { openModal, closeModal } from './ui.js';

export async function loadUsers() {
    if (!Auth.isAdmin()) return;

    const listEl = document.getElementById('users-list');
    listEl.innerHTML = '<div class="loading">Cargando usuarios...</div>';

    try {
        const response = await UsersAPI.getAllUsers();
        if (!response.success) throw new Error(response.error);

        const users = response.users;

        listEl.innerHTML = `
            <table class="users-table">
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Email</th>
                        <th>Roles</th>
                        <th>Estado</th>
                        <th>Acciones</th>
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
                                            <span class="role-badge role-${r.role}">
                                                ${r.role}
                                                ${r.groupIds && r.groupIds.length > 0 ? `(${r.groupIds.length})` : ''}
                                                <button onclick="window.revokeRole('${u.id}', '${r.id}')" title="Revocar rol">×</button>
                                            </span>
                                        `).join('')
                : '<span class="no-roles">Sin roles</span>'
            }
                                    <button class="btn-icon-small" onclick="window.openAssignRoleModal('${u.id}', '${escapeHtml(u.name)}')" title="Asignar rol">+</button>
                                </div>
                            </td>
                            <td>
                                ${u.isActive ? '<span class="status-active">Activo</span>' : '<span class="status-inactive">Inactivo</span>'}
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
        document.getElementById('stat-users-count').textContent = users.length;

    } catch (err) {
        console.error('Error loading users:', err);
        listEl.innerHTML = `<p class="error-message">Error cargando usuarios: ${err.message}</p>`;
    }
}

// Global actions
window.revokeRole = async (userId, roleId) => {
    if (!confirm('¿Revocar este rol?')) return;
    try {
        await UsersAPI.revokeRole(userId, roleId);
        showToast('Rol revocado');
        loadUsers();
    } catch (err) {
        showToast('Error revocando rol: ' + err.message, 'error');
    }
};

window.deleteUser = async (userId) => {
    if (!confirm('¿Eliminar usuario? Esta acción no se puede deshacer.')) return;
    try {
        await UsersAPI.deleteUser(userId);
        showToast('Usuario eliminado');
        loadUsers();
    } catch (err) {
        showToast('Error eliminando usuario: ' + err.message, 'error');
    }
};

window.openAssignRoleModal = (userId, userName) => {
    document.getElementById('assign-role-user-id').value = userId;
    document.getElementById('assign-role-user-name').textContent = userName;

    // Populate groups select
    const select = document.getElementById('assign-role-groups');
    select.innerHTML = state.allGroups.map(g =>
        `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`
    ).join('');

    // Toggle groups select based on role
    const roleSelect = document.getElementById('assign-role-select');
    const groupsDiv = document.getElementById('assign-role-groups-div');

    roleSelect.onchange = () => {
        if (roleSelect.value === 'teacher') {
            groupsDiv.classList.remove('hidden');
        } else {
            groupsDiv.classList.add('hidden');
        }
    };
    roleSelect.value = 'teacher'; // default
    roleSelect.onchange(); // trigger

    openModal('modal-assign-role');
};

window.editUser = async (userId) => {
    try {
        const response = await UsersAPI.getUser(userId);
        if (!response.success) throw new Error(response.error);

        const user = response.user;
        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('edit-user-name').value = user.name;
        document.getElementById('edit-user-email').value = user.email;
        document.getElementById('edit-user-active').checked = user.isActive;

        openModal('modal-edit-user');
    } catch (err) {
        showToast('Error cargando usuario: ' + err.message, 'error');
    }
};

window.openNewUserModal = () => {
    document.getElementById('new-user-form').reset();
    openModal('modal-new-user');
};

// Init Listeners
export function initUsersListeners() {
    // New User Form
    document.getElementById('new-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('new-user-name').value,
            email: document.getElementById('new-user-email').value,
            password: document.getElementById('new-user-password').value,
            role: document.getElementById('new-user-role').value,
            groupIds: [] // TODO: Add group selection to new user form if needed
        };

        try {
            await UsersAPI.createUser(data);
            closeModal('modal-new-user');
            showToast('Usuario creado');
            loadUsers();
        } catch (err) {
            showToast('Error creando usuario: ' + err.message, 'error');
        }
    });

    // Assign Role Form
    document.getElementById('assign-role-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('assign-role-user-id').value;
        const role = document.getElementById('assign-role-select').value;

        // Get selected groups
        const select = document.getElementById('assign-role-groups');
        const groupIds = Array.from(select.selectedOptions).map(opt => opt.value);

        try {
            await UsersAPI.assignRole(userId, role, groupIds);
            closeModal('modal-assign-role');
            showToast('Rol asignado');
            loadUsers();
        } catch (err) {
            showToast('Error asignando rol: ' + err.message, 'error');
        }
    });

    // Edit User Form
    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const updates = {
            name: document.getElementById('edit-user-name').value,
            email: document.getElementById('edit-user-email').value,
            isActive: document.getElementById('edit-user-active').checked
        };

        const password = document.getElementById('edit-user-password').value;
        if (password) updates.password = password;

        try {
            await UsersAPI.updateUser(userId, updates);
            closeModal('modal-edit-user');
            showToast('Usuario actualizado');
            loadUsers();
        } catch (err) {
            showToast('Error actualizando usuario: ' + err.message, 'error');
        }
    });
}
