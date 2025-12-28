/**
 * OpenPath Service Worker
 * Handles push notifications for teachers
 */

/**
 * Type-safe access to ServiceWorkerGlobalScope without redeclaring 'self'
 * which conflicts with DOM library.
 */
function getSW(): ServiceWorkerGlobalScope {
    return (globalThis as unknown) as ServiceWorkerGlobalScope;
}

// Skip waiting and take control immediately
getSW().addEventListener('install', () => {
    void (async (): Promise<void> => {
        await getSW().skipWaiting();
    })();
});

getSW().addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(getSW().clients.claim());
});

interface PushData {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: {
        requestId?: string;
        url?: string;
    };
}

/**
 * Push notification received
 */
getSW().addEventListener('push', (event: PushEvent) => {
    let data: PushData = {
        title: 'OpenPath',
        body: 'Nueva notificación',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛡️</text></svg>',
        data: {}
    };

    // Parse push payload
    const eventData = event.data;
    if (eventData) {
        try {
            const payload = eventData.json() as Partial<PushData>;
            data = { ...data, ...payload };
        } catch {
            data.body = eventData.text();
        }
    }

    const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        data: data.data,
        tag: data.data?.requestId ?? 'openpath-notification',
        requireInteraction: true,
        actions: [
            { action: 'view', title: '👁️ Ver solicitud' },
            { action: 'dismiss', title: '❌ Descartar' }
        ]
    };

    event.waitUntil(
        getSW().registration.showNotification(data.title, options as NotificationOptions)
    );
});

/**
 * Notification click handler
 */
getSW().addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // Build URL to open
    const notificationData = event.notification.data as { url?: string; requestId?: string } | undefined;
    const urlPath = notificationData?.url ?? '/';

    event.waitUntil(
        getSW().clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If SPA is already open, focus it and navigate
                for (const client of clientList) {
                    if (client instanceof WindowClient && client.url.includes(getSW().location.origin)) {
                        void (async (): Promise<void> => {
                            await client.focus();
                            // Post message to navigate within SPA
                            client.postMessage({
                                type: 'NAVIGATE',
                                url: urlPath,
                                requestId: notificationData?.requestId
                            });
                        })();
                        return;
                    }
                }
                // Otherwise open a new window
                void getSW().clients.openWindow(urlPath);
            })
    );
});

/**
 * Handle messages from the main app
 */
getSW().addEventListener('message', (event: ExtendableMessageEvent) => {
    const eventData = event.data as { type?: string } | undefined;
    if (eventData?.type === 'SKIP_WAITING') {
        void (async (): Promise<void> => {
            await getSW().skipWaiting();
        })();
    }
});
