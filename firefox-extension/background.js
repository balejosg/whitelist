/**
 * Monitor de Bloqueos de Red - Background Script
 * 
 * Captura errores de red asociados a bloqueos DNS/Firewall y mantiene
 * un registro por pestaña de los dominios afectados.
 * 
 * @version 1.1.0
 */

// Almacenamiento en memoria: { tabId: Map<hostname, Set<errorTypes>> }
const blockedDomains = {};

// Estado de Native Messaging
let nativeHostConnected = false;
let nativePort = null;

// Nombre del host de Native Messaging
const NATIVE_HOST_NAME = 'whitelist_native_host';

// Errores que indican bloqueo (no ruido)
const BLOCKING_ERRORS = [
    'NS_ERROR_UNKNOWN_HOST',           // Bloqueo DNS (NXDOMAIN)
    'NS_ERROR_CONNECTION_REFUSED',     // Bloqueo Firewall
    'NS_ERROR_NET_TIMEOUT',            // Paquetes descartados (DROP)
    'NS_ERROR_PROXY_CONNECTION_REFUSED' // Proxy bloqueado
];

// Errores a ignorar (ruido)
const IGNORED_ERRORS = [
    'NS_BINDING_ABORTED',              // Usuario canceló
    'NS_ERROR_ABORT'                   // Navegación abortada
];

/**
 * Extrae el hostname de una URL
 * @param {string} url - URL completa
 * @returns {string|null} - Hostname o null si inválido
 */
function extractHostname(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return null;
    }
}

/**
 * Inicializa el almacenamiento para una pestaña si no existe
 * @param {number} tabId - ID de la pestaña
 */
function ensureTabStorage(tabId) {
    if (!blockedDomains[tabId]) {
        blockedDomains[tabId] = new Map();
    }
}

/**
 * Añade un dominio bloqueado al registro
 * @param {number} tabId - ID de la pestaña
 * @param {string} hostname - Dominio bloqueado
 * @param {string} error - Tipo de error
 */
function addBlockedDomain(tabId, hostname, error) {
    ensureTabStorage(tabId);

    if (!blockedDomains[tabId].has(hostname)) {
        blockedDomains[tabId].set(hostname, new Set());
    }
    blockedDomains[tabId].get(hostname).add(error);

    updateBadge(tabId);
}

/**
 * Actualiza el badge (contador) del icono de la extensión
 * @param {number} tabId - ID de la pestaña
 */
function updateBadge(tabId) {
    const count = blockedDomains[tabId] ? blockedDomains[tabId].size : 0;

    browser.browserAction.setBadgeText({
        text: count > 0 ? count.toString() : '',
        tabId: tabId
    });

    browser.browserAction.setBadgeBackgroundColor({
        color: '#FF0000',
        tabId: tabId
    });
}

/**
 * Limpia los dominios bloqueados para una pestaña
 * @param {number} tabId - ID de la pestaña
 */
function clearBlockedDomains(tabId) {
    if (blockedDomains[tabId]) {
        blockedDomains[tabId].clear();
    }
    updateBadge(tabId);
}

/**
 * Obtiene los dominios bloqueados para una pestaña
 * @param {number} tabId - ID de la pestaña
 * @returns {Object} - Objeto con dominios y sus errores
 */
function getBlockedDomainsForTab(tabId) {
    const result = {};

    if (blockedDomains[tabId]) {
        blockedDomains[tabId].forEach((errors, hostname) => {
            result[hostname] = Array.from(errors);
        });
    }

    return result;
}

// ============================================================================
// Native Messaging
// ============================================================================

/**
 * Conecta con el host de Native Messaging
 * @returns {Promise<boolean>} - true si la conexión fue exitosa
 */
async function connectNativeHost() {
    return new Promise((resolve) => {
        try {
            nativePort = browser.runtime.connectNative(NATIVE_HOST_NAME);

            nativePort.onDisconnect.addListener((port) => {
                console.log('[Monitor] Native host desconectado:', browser.runtime.lastError);
                nativeHostConnected = false;
                nativePort = null;
            });

            nativeHostConnected = true;
            console.log('[Monitor] Native host conectado');
            resolve(true);
        } catch (error) {
            console.error('[Monitor] Error conectando Native host:', error);
            nativeHostConnected = false;
            resolve(false);
        }
    });
}

/**
 * Envía un mensaje al host de Native Messaging y espera respuesta
 * @param {Object} message - Mensaje a enviar
 * @returns {Promise<Object>} - Respuesta del host
 */
async function sendNativeMessage(message) {
    return new Promise(async (resolve, reject) => {
        try {
            // Intentar conectar si no está conectado
            if (!nativePort) {
                const connected = await connectNativeHost();
                if (!connected) {
                    reject(new Error('No se pudo conectar con el host nativo'));
                    return;
                }
            }

            // Usar sendNativeMessage para comunicación simple
            const response = await browser.runtime.sendNativeMessage(
                NATIVE_HOST_NAME,
                message
            );

            resolve(response);
        } catch (error) {
            console.error('[Monitor] Error en Native Messaging:', error);
            reject(error);
        }
    });
}

/**
 * Verifica dominios usando el sistema de whitelist local
 * @param {string[]} domains - Lista de dominios a verificar
 * @returns {Promise<Object>} - Resultado de la verificación
 */
async function checkDomainsWithNative(domains) {
    try {
        const response = await sendNativeMessage({
            action: 'check',
            domains: domains
        });

        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Error desconocido'
        };
    }
}

/**
 * Verifica si el host de Native Messaging está disponible
 * @returns {Promise<boolean>}
 */
async function isNativeHostAvailable() {
    try {
        const response = await sendNativeMessage({ action: 'ping' });
        return response && response.success;
    } catch {
        return false;
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Listener: Errores de red
 * Captura peticiones que fallan con errores de bloqueo
 */
browser.webRequest.onErrorOccurred.addListener(
    (details) => {
        // Ignorar errores de ruido
        if (IGNORED_ERRORS.includes(details.error)) {
            return;
        }

        // Solo procesar errores de bloqueo
        if (!BLOCKING_ERRORS.includes(details.error)) {
            return;
        }

        // Extraer hostname
        const hostname = extractHostname(details.url);
        if (!hostname) {
            return;
        }

        // Ignorar peticiones sin tab (background requests)
        if (details.tabId < 0) {
            return;
        }

        console.log(`[Monitor] Bloqueado: ${hostname} (${details.error})`);
        addBlockedDomain(details.tabId, hostname, details.error);
    },
    { urls: ['<all_urls>'] }
);

/**
 * Listener: Navegación iniciada
 * Limpia la lista de bloqueos cuando el usuario navega a una nueva página
 */
browser.webNavigation.onBeforeNavigate.addListener(
    (details) => {
        // Solo limpiar para navegación principal (no iframes)
        if (details.frameId === 0) {
            console.log(`[Monitor] Limpiando bloqueos para tab ${details.tabId}`);
            clearBlockedDomains(details.tabId);
        }
    }
);

/**
 * Listener: Pestaña cerrada
 * Elimina los datos de la pestaña para evitar fugas de memoria
 */
browser.tabs.onRemoved.addListener(
    (tabId) => {
        if (blockedDomains[tabId]) {
            delete blockedDomains[tabId];
            console.log(`[Monitor] Tab ${tabId} cerrada, datos eliminados`);
        }
    }
);

/**
 * Listener: Mensajes del popup
 * Responde a solicitudes de datos del popup
 */
browser.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        switch (message.action) {
            case 'getBlockedDomains':
                sendResponse({
                    domains: getBlockedDomainsForTab(message.tabId)
                });
                break;

            case 'clearBlockedDomains':
                clearBlockedDomains(message.tabId);
                sendResponse({ success: true });
                break;

            case 'checkWithNative':
                // Verificar dominios con Native Messaging (async)
                checkDomainsWithNative(message.domains)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({
                        success: false,
                        error: error.message
                    }));
                return true; // Mantener canal abierto para respuesta async

            case 'isNativeAvailable':
                isNativeHostAvailable()
                    .then(available => sendResponse({ available }))
                    .catch(() => sendResponse({ available: false }));
                return true;

            default:
                sendResponse({ error: 'Unknown action' });
        }

        return true; // Indica respuesta asíncrona
    }
);

console.log('[Monitor de Bloqueos] Background script v1.1.0 cargado');

