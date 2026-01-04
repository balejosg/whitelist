/**
 * OpenPath - Setup Page JavaScript
 * Handles initial system setup and first admin creation
 */

// Use port 3006 for API when testing locally
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = localStorage.getItem('requests_api_url') ||
    (isLocal ? 'http://localhost:3006' : window.location.origin);

// Check setup status on load
async function checkSetupStatus() {
    try {
        const response = await fetch(`${API_URL}/trpc/setup.status`);
        const trpcResult = await response.json();
        const data = trpcResult.result?.data;

        document.getElementById('loading-state').classList.add('hidden');

        if (data?.needsSetup) {
            document.getElementById('setup-form').classList.remove('hidden');
        } else {
            document.getElementById('already-setup').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error checking setup status:', error);
        showError('Error al conectar con el servidor');
    }
}

// Handle form submission
document.getElementById('first-admin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('admin-email').value;
    const name = document.getElementById('admin-name').value;
    const password = document.getElementById('admin-password').value;
    const passwordConfirm = document.getElementById('admin-password-confirm').value;

    // Client-side validation
    if (password.length < 8) {
        showError('La contraseña debe tener al menos 8 caracteres');
        return;
    }

    if (password !== passwordConfirm) {
        showError('Las contraseñas no coinciden');
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando...';

    try {
        const response = await fetch(`${API_URL}/trpc/setup.createFirstAdmin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ json: { email, name, password } })
        });

        const trpcResult = await response.json();
        const data = trpcResult.result?.data;

        if (response.ok && data) {
            document.getElementById('setup-form').classList.add('hidden');
            document.getElementById('setup-success').classList.remove('hidden');
            document.getElementById('registration-token').value = data.registrationToken;
        } else {
            const errorMessage = trpcResult.error?.message || 'Error al crear administrador';
            showError(errorMessage);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Crear Administrador';
        }
    } catch (error) {
        console.error('Error creating admin:', error);
        showError('Error al conectar con el servidor');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Administrador';
    }
});

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

function copyToken() {
    const tokenInput = document.getElementById('registration-token');
    tokenInput.select();
    document.execCommand('copy');

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copiado';
    btn.style.background = '#059669';

    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 2000);
}

// Initialize
checkSetupStatus();
