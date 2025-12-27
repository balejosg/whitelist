import { Auth } from './auth.js';
import { RequestsAPI } from './requests-api.js';
// import type { APIResponse } from './types/index.js'; // Unused
/**
 * Push Notifications Manager
 * Handles push subscription management for teachers
 */
export const PushManager = {
    /**
     * Check if push notifications are supported
     */
    isSupported() {
        return 'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;
    },
    /**
     * Get current permission status
     */
    getPermissionStatus() {
        if (!this.isSupported())
            return 'unsupported';
        return Notification.permission;
    },
    /**
     * Register service worker
     */
    async registerServiceWorker() {
        if (!this.isSupported()) {
            throw new Error('Push notifications not supported in this browser');
        }
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            console.log('[Push] Service Worker registered:', registration.scope);
            return registration;
        }
        catch (error) {
            console.error('[Push] Service Worker registration failed:', error);
            throw error;
        }
    },
    /**
     * Get or wait for service worker registration
     */
    async getRegistration() {
        if (navigator.serviceWorker.controller) {
            return navigator.serviceWorker.ready;
        }
        return this.registerServiceWorker();
    },
    /**
     * Request notification permission
     */
    async requestPermission() {
        if (!this.isSupported()) {
            return 'unsupported';
        }
        const permission = await Notification.requestPermission();
        console.log('[Push] Permission result:', permission);
        return permission;
    },
    /**
     * Get VAPID public key from server
     */
    async getVapidKey() {
        const baseUrl = RequestsAPI.apiUrl || '';
        const response = await fetch(`${baseUrl}/api/push/vapid-key`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to get VAPID key');
        }
        return data.publicKey;
    },
    /**
     * Convert VAPID key to Uint8Array for subscription
     */
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },
    /**
     * Subscribe to push notifications
     */
    async subscribe() {
        // Check permission
        const permission = await this.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Permission denied for notifications');
        }
        // Get service worker registration
        const registration = await this.getRegistration();
        // Get VAPID key from server
        const vapidKey = await this.getVapidKey();
        const applicationServerKey = this.urlBase64ToUint8Array(vapidKey);
        // Subscribe
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey // Lib dom vs implementation mismatch
        });
        console.log('[Push] Subscribed:', subscription.endpoint);
        // Send subscription to server
        const baseUrl = RequestsAPI.apiUrl || '';
        const response = await Auth.fetch(`${baseUrl}/api/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to register subscription');
        }
        console.log('[Push] Subscription registered on server');
        return data;
    },
    /**
     * Check if already subscribed
     */
    async getSubscription() {
        if (!this.isSupported())
            return null;
        try {
            const registration = await navigator.serviceWorker.ready;
            return await registration.pushManager.getSubscription();
        }
        catch {
            return null;
        }
    },
    /**
     * Unsubscribe from push notifications
     */
    async unsubscribe() {
        const subscription = await this.getSubscription();
        if (!subscription) {
            return { success: true, message: 'Not subscribed' };
        }
        // Unsubscribe locally
        await subscription.unsubscribe();
        // Remove from server
        const baseUrl = RequestsAPI.apiUrl || '';
        try {
            await Auth.fetch(`${baseUrl}/api/push/subscribe`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
        }
        catch (error) {
            console.warn('[Push] Server unsubscribe failed:', error);
        }
        console.log('[Push] Unsubscribed');
        return { success: true };
    },
    /**
     * Initialize push notifications UI
     * Call this after login
     */
    async init() {
        if (!this.isSupported()) {
            console.log('[Push] Push notifications not supported');
            return;
        }
        // Register service worker
        await this.registerServiceWorker();
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'NAVIGATE') {
                // Handle navigation request from SW
                const requestId = event.data.requestId;
                // @ts-expect-error - highlightRequest is global UI function, not typed yet
                if (requestId && typeof window.highlightRequest === 'function') {
                    // @ts-expect-error
                    window.highlightRequest(requestId);
                }
            }
        });
    }
};
//# sourceMappingURL=push.js.map