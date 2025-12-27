/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 * 
 * Setup Module - First-time admin setup
 * Handles the initial configuration when no admins exist
 */

import { Auth } from './auth.js';

interface SetupStatusResponse {
    needsSetup: boolean;
    hasAdmin: boolean;
    error?: string;
}

interface CreateAdminResponse {
    success: boolean;
    registrationToken: string;
    user: {
        id: string;
        email: string;
        name: string;
    };
}

interface TokenResponse {
    registrationToken: string;
}

interface SetupStatus {
    needsSetup: boolean;
    hasAdmin: boolean;
    error?: string;
}

function getApiUrl(): string {
    return localStorage.getItem('requests_api_url') ?? '';
}

/**
 * Check if the server needs initial setup
 */
export async function checkStatus(): Promise<SetupStatus> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        return { needsSetup: false, hasAdmin: true, error: 'API URL not configured' };
    }

    try {
        const response = await fetch(`${apiUrl}/api/setup/status`);
        const data = await response.json() as SetupStatusResponse;

        if (!response.ok) {
            throw new Error(data.error ?? 'Failed to check setup status');
        }

        return {
            needsSetup: data.needsSetup,
            hasAdmin: data.hasAdmin
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Setup status check failed:', error);
        return { needsSetup: false, hasAdmin: true, error: errorMessage };
    }
}

/**
 * Create the first admin user
 */
export async function createFirstAdmin(email: string, name: string, password: string): Promise<CreateAdminResponse> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/first-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password })
    });

    const data = await response.json() as CreateAdminResponse & { error?: string };

    if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create admin');
    }

    return data;
}

/**
 * Get the registration token (requires admin auth)
 */
export async function getRegistrationToken(): Promise<string> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/registration-token`, {
        headers: Auth.getAuthHeaders()
    });

    const data = await response.json() as TokenResponse & { error?: string };

    if (!response.ok) {
        throw new Error(data.error ?? 'Failed to get registration token');
    }

    return data.registrationToken;
}

/**
 * Regenerate the registration token (requires admin auth)
 */
export async function regenerateToken(): Promise<string> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/regenerate-token`, {
        method: 'POST',
        headers: Auth.getAuthHeaders()
    });

    const data = await response.json() as TokenResponse & { error?: string };

    if (!response.ok) {
        throw new Error(data.error ?? 'Failed to regenerate token');
    }

    return data.registrationToken;
}

/**
 * Initialize the setup page
 */
export async function initSetupPage(): Promise<void> {
    const status = await checkStatus();

    const formContainer = document.getElementById('setup-form-container');
    const completeContainer = document.getElementById('setup-complete-container');
    const alreadyContainer = document.getElementById('setup-already-container');

    // Hide all containers first
    formContainer?.classList.add('hidden');
    completeContainer?.classList.add('hidden');
    alreadyContainer?.classList.add('hidden');

    if (status.error !== undefined && status.error !== 'API URL not configured') {
        const errorEl = document.getElementById('setup-error');
        if (errorEl !== null) {
            errorEl.textContent = status.error;
        }
        formContainer?.classList.remove('hidden');
        return;
    }

    if (status.needsSetup) {
        formContainer?.classList.remove('hidden');
    } else {
        alreadyContainer?.classList.remove('hidden');
    }
}

/**
 * Show the setup complete screen with registration token
 */
export function showSetupComplete(token: string): void {
    const formContainer = document.getElementById('setup-form-container');
    const completeContainer = document.getElementById('setup-complete-container');

    formContainer?.classList.add('hidden');
    completeContainer?.classList.remove('hidden');

    const tokenEl = document.getElementById('setup-registration-token');
    if (tokenEl !== null) {
        tokenEl.textContent = token;
    }
}

// Export as object for backwards compatibility
export const Setup = {
    checkStatus,
    createFirstAdmin,
    getRegistrationToken,
    regenerateToken,
    initSetupPage,
    showSetupComplete
};

// Make available globally for HTML onclick handlers
declare global {
    interface Window {
        Setup: typeof Setup;
    }
}
window.Setup = Setup;
