/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notification Module
 * Handles Web Push subscriptions and notification sending
 * Storage: PostgreSQL via Drizzle ORM
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import webPush from 'web-push';
import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import type { DomainRequest } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

export interface PushSubscriptionData {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface SubscriptionRecord {
    id: string;
    userId: string;
    groupIds: string[];
    subscription: PushSubscriptionData;
    userAgent: string;
    createdAt: string;
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

const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

const VAPID_CONFIGURED = (
    VAPID_PUBLIC_KEY !== '' &&
    VAPID_PRIVATE_KEY !== '' &&
    VAPID_SUBJECT !== ''
);

if (VAPID_CONFIGURED) {
    webPush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
} else {
    console.warn('⚠️  WARNING: VAPID keys not configured. Push notifications disabled.');
    console.warn('   Generate keys with: npx web-push generate-vapid-keys');
}

// =============================================================================
// Storage Functions (Postgres)
// =============================================================================

function dbRowToRecord(row: typeof pushSubscriptions.$inferSelect): SubscriptionRecord {
    return {
        id: row.id,
        userId: row.userId,
        groupIds: row.groupIds,
        subscription: {
            endpoint: row.endpoint,
            expirationTime: null,
            keys: {
                p256dh: row.p256dh,
                auth: row.auth,
            },
        },
        userAgent: row.userAgent ?? '',
        createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
}

export async function saveSubscription(
    userId: string,
    groupIds: string[],
    subscription: PushSubscriptionData,
    userAgent = ''
): Promise<SubscriptionRecord> {
    // Remove existing subscription with same endpoint (upsert behavior)
    await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

    const record = {
        id: `push_${uuidv4().slice(0, 8)}`,
        userId,
        groupIds,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
    };

    await db.insert(pushSubscriptions).values(record);

    return {
        id: record.id,
        userId,
        groupIds,
        subscription,
        userAgent,
        createdAt: new Date().toISOString(),
    };
}

export async function getSubscriptionsForGroup(groupId: string): Promise<SubscriptionRecord[]> {
    const rows = await db.select().from(pushSubscriptions);
    // Filter by groupId (array contains)
    return rows
        .filter((row) => row.groupIds.includes(groupId))
        .map(dbRowToRecord);
}

export async function getSubscriptionsForUser(userId: string): Promise<SubscriptionRecord[]> {
    const rows = await db.select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    return rows.map(dbRowToRecord);
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
    const result = await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .returning({ id: pushSubscriptions.id });
    return result.length > 0;
}

export async function deleteSubscriptionById(id: string): Promise<boolean> {
    const result = await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, id))
        .returning({ id: pushSubscriptions.id });
    return result.length > 0;
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

    const subscriptions = await getSubscriptionsForGroup(request.groupId);

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
            groupId: request.groupId,
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

    for (const [i, result] of results.entries()) {
        if (result.status === 'fulfilled') {
            sent++;
        } else {
            failed++;
            const reason = result.reason as { statusCode?: number; message?: string } | undefined;
            if (reason?.statusCode === 410) {
                const sub = subscriptions[i];
                if (sub !== undefined) {
                    await deleteSubscriptionByEndpoint(sub.subscription.endpoint);
                    console.log(`Removed expired push subscription: ${sub.id}`);
                }
            } else {
                console.error('Push notification failed:', reason?.message);
            }
        }
    }

    console.log(`Push notifications sent: ${String(sent)}/${String(subscriptions.length)} for request ${request.id}`);
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
