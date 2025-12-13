/**
 * Monitor de Bloqueos de Red - Popup Script
 * 
 * Gestiona la interfaz del popup: muestra dominios bloqueados,
 * copia al portapapeles, verifica en whitelist y permite limpiar la lista.
 * 
 * @version 1.1.0
 */

// DOM Elements
const tabDomainEl = document.getElementById('tab-domain');
const countEl = document.getElementById('count');
const domainsListEl = document.getElementById('domains-list');
const emptyMessageEl = document.getElementById('empty-message');
const btnCopy = document.getElementById('btn-copy');
const btnVerify = document.getElementById('btn-verify');
const btnClear = document.getElementById('btn-clear');
const toastEl = document.getElementById('toast');
const nativeStatusEl = document.getElementById('native-status');
const verifyResultsEl = document.getElementById('verify-results');
const verifyListEl = document.getElementById('verify-list');

// Current tab ID
let currentTabId = null;

// Current blocked domains data
let blockedDomainsData = {};

// Native Messaging available
let nativeAvailable = false;

/**
 * Muestra un toast de notificación temporal
 * @param {string} message - Mensaje a mostrar
 * @param {number} duration - Duración en ms
 */
function showToast(message, duration = 2000) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');

    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, duration);
}

/**
 * Formatea el tipo de error para mostrar al usuario
 * @param {string[]} errors - Array de tipos de error
 * @returns {string} - Texto formateado
 */
function formatErrorTypes(errors) {
    const errorLabels = {
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
 * Renderiza la lista de dominios bloqueados
 * @param {Object} domains - Objeto { hostname: [errors] }
 */
function renderDomainsList(domains) {
    const hostnames = Object.keys(domains);
    countEl.textContent = hostnames.length;

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
        const errors = domains[hostname];
        const errorText = formatErrorTypes(errors);

        return `
      <li>
        <span class="hostname">${escapeHtml(hostname)}</span>
        <span class="error-type">${escapeHtml(errorText)}</span>
      </li>
    `;
    }).join('');
}

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} - Texto escapado
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Extrae el hostname del URL de una pestaña
 * @param {string} url - URL de la pestaña
 * @returns {string} - Hostname o texto por defecto
 */
function extractTabHostname(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return 'Página local';
    }
}

/**
 * Obtiene los dominios bloqueados del background script
 */
async function loadBlockedDomains() {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'getBlockedDomains',
            tabId: currentTabId
        });

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
async function copyToClipboard() {
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
async function clearDomains() {
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

/**
 * Verifica si Native Messaging está disponible
 */
async function checkNativeAvailable() {
    try {
        const response = await browser.runtime.sendMessage({
            action: 'isNativeAvailable'
        });

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

/**
 * Verifica los dominios bloqueados en el sistema de whitelist local
 */
async function verifyDomainsWithNative() {
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
        });

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
 * @param {Object[]} results - Array de resultados de verificación
 */
function renderVerifyResults(results) {
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
function hideVerifyResults() {
    verifyResultsEl.classList.add('hidden');
    verifyListEl.innerHTML = '';
}

/**
 * Inicializa el popup
 */
async function init() {
    try {
        // Obtener pestaña activa
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });

        if (tabs.length === 0) {
            tabDomainEl.textContent = 'Sin pestaña activa';
            return;
        }

        const tab = tabs[0];
        currentTabId = tab.id;

        // Mostrar hostname de la pestaña actual
        tabDomainEl.textContent = extractTabHostname(tab.url);

        // Cargar dominios bloqueados
        await loadBlockedDomains();

        // Verificar si Native Messaging está disponible
        await checkNativeAvailable();

    } catch (error) {
        console.error('[Popup] Error de inicialización:', error);
        tabDomainEl.textContent = 'Error';
    }
}

// Event Listeners
btnCopy.addEventListener('click', copyToClipboard);
btnClear.addEventListener('click', clearDomains);
btnVerify.addEventListener('click', verifyDomainsWithNative);

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', init);

