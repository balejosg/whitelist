/**
 * OpenPath Service Worker
 * Handles push notifications for teachers
 */

// Skip waiting and take control immediately
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activated');
    event.waitUntil(clients.claim());
});

/**
 * Push notification received
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'OpenPath',
        body: 'Nueva notificación',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛡️</text></svg>',
        data: {}
    };

    // Parse push payload
    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            console.error('[SW] Error parsing push data:', e);
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || undefined,
        badge: data.badge || undefined,
        data: data.data,
        tag: data.data?.requestId || 'openpath-notification',
        requireInteraction: true,
        actions: [
            { action: 'view', title: '👁️ Ver solicitud' },
            { action: 'dismiss', title: '❌ Descartar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);

    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // Build URL to open
    const urlPath = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If SPA is already open, focus it and navigate
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        // Post message to navigate within SPA
                        client.postMessage({
                            type: 'NAVIGATE',
                            url: urlPath,
                            requestId: event.notification.data?.requestId
                        });
                        return;
                    }
                }
                // Otherwise open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlPath);
                }
            })
    );
});

/**
 * Handle messages from the main app
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
