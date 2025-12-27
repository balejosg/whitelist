/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

/**
 * Monitor de Bloqueos de Red - Popup Script
 * 
 * Gestiona la interfaz del popup: muestra dominios bloqueados,
 * copia al portapapeles, verifica en whitelist y permite limpiar la lista.
 * 
 * @version 1.2.0
 */

import { Browser } from 'webextension-polyfill';

declare const browser: Browser;

// DOM Elements
const tabDomainEl = document.getElementById('tab-domain') as HTMLElement;
const countEl = document.getElementById('count') as HTMLElement;
const domainsListEl = document.getElementById('domains-list') as HTMLElement;
const emptyMessageEl = document.getElementById('empty-message') as HTMLElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnVerify = document.getElementById('btn-verify') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnRequest = document.getElementById('btn-request') as HTMLButtonElement;
const toastEl = document.getElementById('toast') as HTMLElement;
const nativeStatusEl = document.getElementById('native-status') as HTMLElement;
const verifyResultsEl = document.getElementById('verify-results') as HTMLElement;
const verifyListEl = document.getElementById('verify-list') as HTMLElement;

// Request form elements
const requestSectionEl = document.getElementById('request-section') as HTMLElement;
const requestDomainSelectEl = document.getElementById('request-domain-select') as HTMLSelectElement;
const requestReasonEl = document.getElementById('request-reason') as HTMLTextAreaElement;
const btnSubmitRequest = document.getElementById('btn-submit-request') as HTMLButtonElement;
const requestStatusEl = document.getElementById('request-status') as HTMLElement;

// Current tab ID
let currentTabId: number | null = null;

interface BlockedDomainInfo {
    errors: string[] | string;
    origin: string | null;
    timestamp: number;
}

// Current blocked domains data
let blockedDomainsData: Record<string, BlockedDomainInfo> = {};

// Native Messaging available
let nativeAvailable = false;

// Global config type (will be populated from config.ts if we imported it, 
// but popup often loads config via message or storage)
// For now we'll define a simple interface for the config object structure we expect
interface Config {
    [key: string]: any;
}

declare global {
    interface Window {
        WHITELIST_CONFIG?: Config;
    }
}

/**
 * Muestra un toast de notificación temporal
 * @param message - Mensaje a mostrar
 * @param duration - Duración en ms
 */
function showToast(message: string, duration = 2000): void {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');

    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, duration);
}

/**
 * Formatea el tipo de error para mostrar al usuario
 * @param errors - Array de tipos de error
 * @returns Texto formateado
 */
function formatErrorTypes(errors: string[]): string {
    const errorLabels: Record<string, string> = {
        'NS_ERROR_UNKNOWN_HOST': 'DNS bloqueado',
        'NS_ERROR_CONNECTION_REFUSED': 'Conexión rechazada',
        'NS_ERROR_NET_TIMEOUT': 'Timeout de red',
        'NS_ERROR_PROXY_CONNECTION_REFUSED': 'Proxy bloqueado'
    };

    return errors
        .map(err => errorLabels[err] || err)
        .join(', ');
}

/**
 * Escapa HTML para prevenir XSS
 * @param text - Texto a escapar
 * @returns Texto escapado
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Renderiza la lista de dominios bloqueados
 * @param domains - Objeto { hostname: { errors: [], origin: string } }
 */
function renderDomainsList(domains: Record<string, BlockedDomainInfo>): void {
    const hostnames = Object.keys(domains);
    countEl.textContent = hostnames.length.toString();

    if (hostnames.length === 0) {
        domainsListEl.innerHTML = '';
        domainsListEl.classList.add('hidden');
        emptyMessageEl.classList.remove('hidden');
        btnCopy.disabled = true;
        btnCopy.style.opacity = '0.5';
        if (btnVerify) {
            btnVerify.disabled = true;
            btnVerify.style.opacity = '0.5';
        }
        return;
    }

    domainsListEl.classList.remove('hidden');
    emptyMessageEl.classList.add('hidden');
    btnCopy.disabled = false;
    btnCopy.style.opacity = '1';
    if (btnVerify && nativeAvailable) {
        btnVerify.disabled = false;
        btnVerify.style.opacity = '1';
    }

    // Ordenar alfabéticamente
    hostnames.sort();

    domainsListEl.innerHTML = hostnames.map(hostname => {
        const data = domains[hostname];
        if (!data) return ''; // Should not happen

        // Support both old and new format (errors could be array or single string in legacy)
        const errors = Array.isArray(data.errors) ? data.errors : [data.errors as string];
        const origin = data.origin || '';
        const errorText = formatErrorTypes(errors);

        return `
      <li data-origin="${escapeHtml(origin)}">
        <span class="hostname">${escapeHtml(hostname)}</span>
        <span class="error-type">${escapeHtml(errorText)}</span>
        ${origin ? `<span class="origin-tag" title="Origen: ${escapeHtml(origin)}">📍</span>` : ''}
      </li>
    `;
    }).join('');
}

/**
 * Extrae el hostname del URL de una pestaña
 * @param url - URL de la pestaña
 * @returns Hostname o texto por defecto
 */
function extractTabHostname(url?: string): string {
    if (!url) return 'Página local';
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return 'Página local';
    }
}

interface BlockedDomainsResponse {
    domains: Record<string, BlockedDomainInfo>;
}

/**
 * Obtiene los dominios bloqueados del background script
 */
async function loadBlockedDomains(): Promise<void> {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'getBlockedDomains',
            tabId: currentTabId
        }) as BlockedDomainsResponse;

        blockedDomainsData = response.domains || {};
        renderDomainsList(blockedDomainsData);
    } catch (error) {
        console.error('[Popup] Error al obtener dominios:', error);
        renderDomainsList({});
    }
}

/**
 * Copia la lista de dominios al portapapeles
 */
async function copyToClipboard(): Promise<void> {
    const hostnames = Object.keys(blockedDomainsData);

    if (hostnames.length === 0) {
        showToast('No hay dominios para copiar');
        return;
    }

    // Formato: un dominio por línea
    const text = hostnames.sort().join('\n');

    try {
        await navigator.clipboard.writeText(text);
        showToast(`✅ ${hostnames.length} dominio(s) copiado(s)`);
    } catch (error) {
        // Fallback para navegadores más antiguos
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(`✅ ${hostnames.length} dominio(s) copiado(s)`);
    }
}

/**
 * Limpia la lista de dominios bloqueados
 */
async function clearDomains(): Promise<void> {
    try {
        await browser.runtime.sendMessage({
            action: 'clearBlockedDomains',
            tabId: currentTabId
        });

        blockedDomainsData = {};
        renderDomainsList({});
        hideVerifyResults();
        showToast('🗑️ Lista limpiada');
    } catch (error) {
        console.error('[Popup] Error al limpiar:', error);
    }
}

interface NativeAvailabilityResponse {
    available: boolean;
}

/**
 * Verifica si Native Messaging está disponible
 */
async function checkNativeAvailable(): Promise<boolean> {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'isNativeAvailable'
        }) as NativeAvailabilityResponse;

        nativeAvailable = response && response.available;

        if (nativeAvailable) {
            nativeStatusEl.classList.remove('hidden');
            btnVerify.classList.remove('hidden');
        }

        return nativeAvailable;
    } catch (error) {
        console.error('[Popup] Error checking native availability:', error);
        return false;
    }
}

interface VerifyResult {
    domain: string;
    in_whitelist: boolean;
    resolved_ip?: string;
}

interface VerifyResponse {
    success: boolean;
    results: VerifyResult[];
    error?: string;
}

/**
 * Verifica los dominios bloqueados en el sistema de whitelist local
 */
async function verifyDomainsWithNative(): Promise<void> {
    const hostnames = Object.keys(blockedDomainsData);

    if (hostnames.length === 0) {
        showToast('No hay dominios para verificar');
        return;
    }

    // Deshabilitar botón mientras verifica
    btnVerify.disabled = true;
    btnVerify.textContent = '⏳ Verificando...';

    try {
        const response = await browser.runtime.sendMessage({
            action: 'checkWithNative',
            domains: hostnames
        }) as VerifyResponse;

        if (response.success) {
            renderVerifyResults(response.results);
            showToast(`🔍 ${response.results.length} dominio(s) verificado(s)`);
        } else {
            showToast(`❌ Error: ${response.error || 'Desconocido'}`);
        }
    } catch (error) {
        console.error('[Popup] Error verificando dominios:', error);
        showToast('❌ Error al verificar dominios');
    } finally {
        btnVerify.disabled = false;
        btnVerify.textContent = '🔍 Verificar';
    }
}

/**
 * Renderiza los resultados de verificación
 * @param results - Array de resultados de verificación
 */
function renderVerifyResults(results: VerifyResult[]): void {
    if (!results || results.length === 0) {
        hideVerifyResults();
        return;
    }

    verifyResultsEl.classList.remove('hidden');

    verifyListEl.innerHTML = results.map(result => {
        const icon = result.in_whitelist ? '✅' : '❌';
        const statusClass = result.in_whitelist ? 'in-whitelist' : 'not-in-whitelist';
        const statusText = result.in_whitelist ? 'En WL' : 'No en WL';
        const ipText = result.resolved_ip ? ` → ${result.resolved_ip}` : '';

        return `
            <li>
                <span class="status-icon">${icon}</span>
                <span class="domain-name">${escapeHtml(result.domain)}${escapeHtml(ipText)}</span>
                <span class="whitelist-status ${statusClass}">${statusText}</span>
            </li>
        `;
    }).join('');
}

/**
 * Oculta la sección de resultados de verificación
 */
function hideVerifyResults(): void {
    verifyResultsEl.classList.add('hidden');
    verifyListEl.innerHTML = '';
}

// =============================================================================
// Request API Functions
// =============================================================================

/**
 * Get config value with fallback
 */
function getConfig<T>(key: string, defaultValue: T): T {
    if (typeof window.WHITELIST_CONFIG !== 'undefined' && window.WHITELIST_CONFIG[key] !== undefined) {
        return window.WHITELIST_CONFIG[key] as T;
    }
    return defaultValue;
}

/**
 * Check if the request API is available
 */
async function checkRequestApiAvailable(): Promise<boolean> {
    const apiUrl = getConfig('REQUEST_API_URL', '');

    if (!apiUrl || !getConfig('ENABLE_REQUESTS', true)) {
        return false;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => { controller.abort(); }, 5000);

        const response = await fetch(`${apiUrl}/health`, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
            return true;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (getConfig('DEBUG_MODE', false)) {
            console.log('[Popup] Request API not available:', errorMessage);
        }
    }

    return false;
}

/**
 * Toggle request section visibility
 */
function toggleRequestSection(): void {
    const isHidden = requestSectionEl.classList.contains('hidden');

    if (isHidden) {
        // Show and populate
        requestSectionEl.classList.remove('hidden');
        populateRequestDomainSelect();
        hideVerifyResults();
    } else {
        // Hide
        requestSectionEl.classList.add('hidden');
        hideRequestStatus();
    }
}

/**
 * Populate the domain select dropdown with origin info
 */
function populateRequestDomainSelect(): void {
    const hostnames = Object.keys(blockedDomainsData).sort();

    requestDomainSelectEl.innerHTML = '<option value="">Seleccionar dominio...</option>';

    hostnames.forEach(hostname => {
        const data = blockedDomainsData[hostname];
        if (!data) return;
        const origin = data.origin || 'desconocido';
        const option = document.createElement('option');
        option.value = hostname;
        option.textContent = hostname;
        option.dataset.origin = origin;
        requestDomainSelectEl.appendChild(option);
    });

    updateSubmitButtonState();
}

/**
 * Update submit button enabled state
 */
function updateSubmitButtonState(): void {
    const hasSelection = requestDomainSelectEl.value !== '';
    const hasReason = requestReasonEl.value.trim().length >= 3;

    btnSubmitRequest.disabled = !hasSelection || !hasReason;
}

/**
 * Generate token from hostname using SHA-256
 */
async function generateToken(hostname: string, secret: string): Promise<string> {
    const data = new TextEncoder().encode(hostname + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return btoa(String.fromCharCode(...hashArray));
}

interface HostnameResponse {
    success: boolean;
    hostname: string;
    error?: string;
}

interface AutoIncludeResponse {
    success: boolean;
    group_id: string;
    error?: string;
}

/**
 * Submit a domain request using auto-inclusion endpoint
 */
async function submitDomainRequest(): Promise<void> {
    const domain = requestDomainSelectEl.value;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const reason = requestReasonEl.value.trim();
    const selectedOption = requestDomainSelectEl.selectedOptions[0];
    const origin = selectedOption ? selectedOption.dataset.origin : '';

    if (!domain || reason.length < 3) {
        showRequestStatus('❌ Selecciona un dominio y escribe un motivo', 'error');
        return;
    }

    if (!origin) {
        showRequestStatus('❌ El dominio no tiene un origen válido', 'error');
        return;
    }

    const apiUrl = getConfig('REQUEST_API_URL', '');
    const groupId = getConfig('DEFAULT_GROUP', 'default');
    const sharedSecret = getConfig('SHARED_SECRET', '');

    // Disable button while submitting
    btnSubmitRequest.disabled = true;
    btnSubmitRequest.textContent = '⏳ Enviando...';
    showRequestStatus('Enviando solicitud...', 'pending');

    try {
        // Get hostname via Native Messaging
        const hostnameResult = await browser.runtime.sendMessage({ action: 'getHostname' }) as HostnameResponse;
        if (!hostnameResult.success) {
            throw new Error('No se pudo obtener el hostname del sistema');
        }
        const systemHostname = hostnameResult.hostname;

        // Generate token
        const token = await generateToken(systemHostname, sharedSecret);

        const controller = new AbortController();
        const timeout = setTimeout(() => { controller.abort(); }, getConfig('REQUEST_TIMEOUT', 10000));

        // Use auto-inclusion endpoint
        const response = await fetch(`${apiUrl}/api/requests/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domain,
                origin_page: origin,
                group_id: groupId,
                token,
                hostname: systemHostname
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const data = await response.json() as AutoIncludeResponse;

        if (response.ok && data.success) {
            showRequestStatus(
                `✅ Dominio añadido a ${data.group_id}\nActualizando whitelist local...`,
                'success'
            );

            // Trigger local whitelist update
            try {
                const updateResult = await browser.runtime.sendMessage({ action: 'triggerWhitelistUpdate' }) as { success: boolean };
                if (updateResult.success) {
                    showRequestStatus(
                        `✅ Dominio ${domain} añadido y whitelist local actualizada`,
                        'success'
                    );
                    showToast('✅ Dominio añadido y WL actualizada');
                } else {
                    showRequestStatus(
                        `✅ Dominio añadido (actualización local pendiente)`,
                        'success'
                    );
                    showToast('✅ Dominio añadido');
                }
            } catch (updateError) {
                console.warn('Whitelist update failed:', updateError);
                showToast('✅ Dominio añadido');
            }

            // Clear form
            requestDomainSelectEl.value = '';
            requestReasonEl.value = '';
        } else {
            const errorMsg = data.error || 'Error desconocido';
            showRequestStatus(`❌ ${errorMsg}`, 'error');
            showToast(`❌ ${errorMsg}`);
        }

    } catch (error) {
        let errorMsg = 'Error de conexión';

        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                errorMsg = 'Timeout - servidor no responde';
            } else {
                errorMsg = error.message;
            }
        }

        showRequestStatus(`❌ ${errorMsg}`, 'error');
        showToast(`❌ Error al enviar`);

        if (getConfig('DEBUG_MODE', false)) {
            console.error('[Popup] Request error:', error);
        }
    } finally {
        btnSubmitRequest.disabled = false;
        btnSubmitRequest.textContent = 'Enviar Solicitud';
        updateSubmitButtonState();
    }
}

/**
 * Show request status message
 */
function showRequestStatus(message: string, type = 'info'): void {
    requestStatusEl.classList.remove('hidden', 'success', 'error', 'pending');
    requestStatusEl.classList.add(type);
    requestStatusEl.textContent = message;
}

/**
 * Hide request status message
 */
function hideRequestStatus(): void {
    requestStatusEl.classList.add('hidden');
    requestStatusEl.textContent = '';
}

/**
 * Inicializa el popup
 */
async function init(): Promise<void> {
    try {
        // Obtener pestaña activa
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });

        if (tabs.length === 0) {
            tabDomainEl.textContent = 'Sin pestaña activa';
            return;
        }

        const tab = tabs[0];
        if (!tab || tab.id === undefined) {
            tabDomainEl.textContent = 'Error: Tab ID undefined';
            return;
        }
        currentTabId = tab.id;

        // Mostrar hostname de la pestaña actual
        tabDomainEl.textContent = extractTabHostname(tab.url);

        // Cargar dominios bloqueados
        await loadBlockedDomains();

        // Verificar si Native Messaging está disponible
        await checkNativeAvailable();

        // Verificar si Request API está disponible
        const requestAvailable = await checkRequestApiAvailable();
        if (requestAvailable) {
            btnRequest.classList.remove('hidden');
            btnRequest.disabled = false;
        } else {
            btnRequest.classList.add('hidden');
        }

    } catch (error) {
        console.error('[Popup] Error de inicialización:', error);
        tabDomainEl.textContent = 'Error';
    }
}

// Event Listeners
btnCopy.addEventListener('click', () => { void copyToClipboard(); });
btnClear.addEventListener('click', () => { void clearDomains(); });
btnVerify.addEventListener('click', () => { void verifyDomainsWithNative(); });
btnRequest.addEventListener('click', toggleRequestSection);
btnSubmitRequest.addEventListener('click', () => { void submitDomainRequest(); });
requestDomainSelectEl.addEventListener('change', updateSubmitButtonState);
requestReasonEl.addEventListener('input', updateSubmitButtonState);

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => { void init(); });
