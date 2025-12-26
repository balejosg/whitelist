/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notification Module
 * Handles Web Push subscriptions and notification sending
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import webPush from 'web-push';
import type { DomainRequest } from '../types/index.js';

// =============================================================================
// Constants
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

// =============================================================================
// Types
// =============================================================================

export interface PushSubscription {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

interface SubscriptionRecord {
    id: string;
    userId: string;
    groupIds: string[];
    subscription: PushSubscription;
    userAgent: string;
    createdAt: string;
}

interface SubscriptionsData {
    subscriptions: SubscriptionRecord[];
}

interface NotificationPayload {
    title: string;
    body: string;
    icon: string;
    badge: string;
    data: {
        requestId: string;
        domain: string;
        groupId: string;
        url: string;
    };
}

interface NotificationResult {
    sent: number;
    failed: number;
    disabled?: boolean;
    noSubscriptions?: boolean;
    total?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const VAPID_CONFIGURED = !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
);

if (VAPID_CONFIGURED === true) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
    );
} else {
    console.warn('⚠️  WARNING: VAPID keys not configured. Push notifications disabled.');
    console.warn('   Generate keys with: npx web-push generate-vapid-keys');
}

// =============================================================================
// Storage Functions
// =============================================================================

function loadSubscriptions(): SubscriptionsData {
    try {
        if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
            return { subscriptions: [] };
        }
        const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
        return JSON.parse(data) as SubscriptionsData;
    } catch (error) {
        console.error('Error loading push subscriptions:', error);
        return { subscriptions: [] };
    }
}

function saveSubscriptions(data: SubscriptionsData): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
}

export function saveSubscription(
    userId: string,
    groupIds: string[],
    subscription: PushSubscription,
    userAgent = ''
): SubscriptionRecord {
    const data = loadSubscriptions();

    data.subscriptions = data.subscriptions.filter(
        (s) => s.subscription.endpoint !== subscription.endpoint
    );

    const record: SubscriptionRecord = {
        id: `push_${uuidv4().slice(0, 8)}`,
        userId,
        groupIds,
        subscription,
        userAgent,
        createdAt: new Date().toISOString()
    };

    data.subscriptions.push(record);
    saveSubscriptions(data);

    return record;
}

export function getSubscriptionsForGroup(groupId: string): SubscriptionRecord[] {
    const data = loadSubscriptions();
    return data.subscriptions.filter((s) => s.groupIds.includes(groupId));
}

export function getSubscriptionsForUser(userId: string): SubscriptionRecord[] {
    const data = loadSubscriptions();
    return data.subscriptions.filter((s) => s.userId === userId);
}

export function deleteSubscriptionByEndpoint(endpoint: string): boolean {
    const data = loadSubscriptions();
    const initialLength = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter(
        (s) => s.subscription.endpoint !== endpoint
    );

    if (data.subscriptions.length < initialLength) {
        saveSubscriptions(data);
        return true;
    }
    return false;
}

export function deleteSubscriptionById(id: string): boolean {
    const data = loadSubscriptions();
    const initialLength = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter((s) => s.id !== id);

    if (data.subscriptions.length < initialLength) {
        saveSubscriptions(data);
        return true;
    }
    return false;
}

// =============================================================================
// Notification Functions
// =============================================================================

export async function notifyTeachersOfNewRequest(
    request: DomainRequest
): Promise<NotificationResult> {
    if (!VAPID_CONFIGURED) {
        return { sent: 0, failed: 0, disabled: true };
    }

    const subscriptions = getSubscriptionsForGroup(request.group_id);

    if (subscriptions.length === 0) {
        return { sent: 0, failed: 0, noSubscriptions: true };
    }

    const payload: NotificationPayload = {
        title: '📨 Nueva solicitud',
        body: `Dominio: ${request.domain}`,
        icon: '/icon-192.png',
        badge: '/badge.png',
        data: {
            requestId: request.id,
            domain: request.domain,
            groupId: request.group_id,
            url: `/?highlight=${request.id}`
        }
    };

    const results = await Promise.allSettled(
        subscriptions.map((sub) =>
            webPush.sendNotification(sub.subscription, JSON.stringify(payload))
        )
    );

    let sent = 0;
    let failed = 0;

    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            sent++;
        } else {
            failed++;
            const reason = result.reason as { statusCode?: number; message?: string } | undefined;
            if (reason?.statusCode === 410) {
                const sub = subscriptions[i];
                if (sub !== undefined) {
                    deleteSubscriptionByEndpoint(sub.subscription.endpoint);
                    console.log(`Removed expired push subscription: ${sub.id}`);
                }
            } else {
                console.error('Push notification failed:', reason?.message);
            }
        }
    });

    console.log(`Push notifications sent: ${sent}/${subscriptions.length} for request ${request.id}`);
    return { sent, failed, total: subscriptions.length };
}

export function getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function isPushEnabled(): boolean {
    return VAPID_CONFIGURED;
}

export default {
    saveSubscription,
    getSubscriptionsForGroup,
    getSubscriptionsForUser,
    deleteSubscriptionByEndpoint,
    deleteSubscriptionById,
    notifyTeachersOfNewRequest,
    getVapidPublicKey,
    isPushEnabled
};
