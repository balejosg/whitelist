/**
 * Setup Module - First-time admin setup
 * Handles the initial configuration when no admins exist
 */

const Setup = {
    /**
     * Check if the server needs initial setup
     * @returns {Promise<{needsSetup: boolean, hasAdmin: boolean}>}
     */
    async checkStatus() {
        const apiUrl = localStorage.getItem('requests_api_url') || '';
        if (!apiUrl) {
            return { needsSetup: false, hasAdmin: true, error: 'API URL not configured' };
        }

        try {
            const response = await fetch(`${apiUrl}/api/setup/status`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check setup status');
            }

            return {
                needsSetup: data.needsSetup,
                hasAdmin: data.hasAdmin
            };
        } catch (error) {
            console.error('Setup status check failed:', error);
            return { needsSetup: false, hasAdmin: true, error: error.message };
        }
    },

    /**
     * Create the first admin user
     * @param {Object} data - { email, name, password }
     * @returns {Promise<Object>} - { success, registrationToken, user }
     */
    async createFirstAdmin(email, name, password) {
        const apiUrl = localStorage.getItem('requests_api_url') || '';
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/setup/first-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create admin');
        }

        return data;
    },

    /**
     * Get the registration token (requires admin auth)
     * @returns {Promise<string>}
     */
    async getRegistrationToken() {
        const apiUrl = localStorage.getItem('requests_api_url') || '';
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/setup/registration-token`, {
            headers: Auth.getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to get registration token');
        }

        return data.registrationToken;
    },

    /**
     * Regenerate the registration token (requires admin auth)
     * @returns {Promise<string>}
     */
    async regenerateToken() {
        const apiUrl = localStorage.getItem('requests_api_url') || '';
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/api/setup/regenerate-token`, {
            method: 'POST',
            headers: Auth.getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to regenerate token');
        }

        return data.registrationToken;
    },

    /**
     * Initialize the setup page
     */
    async initSetupPage() {
        const status = await this.checkStatus();

        const formContainer = document.getElementById('setup-form-container');
        const completeContainer = document.getElementById('setup-complete-container');
        const alreadyContainer = document.getElementById('setup-already-container');

        // Hide all containers first
        formContainer?.classList.add('hidden');
        completeContainer?.classList.add('hidden');
        alreadyContainer?.classList.add('hidden');

        if (status.error && status.error !== 'API URL not configured') {
            document.getElementById('setup-error').textContent = status.error;
            formContainer?.classList.remove('hidden');
            return;
        }

        if (status.needsSetup) {
            formContainer?.classList.remove('hidden');
        } else {
            alreadyContainer?.classList.remove('hidden');
        }
    },

    /**
     * Show the setup complete screen with registration token
     * @param {string} token
     */
    showSetupComplete(token) {
        const formContainer = document.getElementById('setup-form-container');
        const completeContainer = document.getElementById('setup-complete-container');

        formContainer?.classList.add('hidden');
        completeContainer?.classList.remove('hidden');

        const tokenEl = document.getElementById('setup-registration-token');
        if (tokenEl) {
            tokenEl.textContent = token;
        }
    }
};

// Make available globally
window.Setup = Setup;
