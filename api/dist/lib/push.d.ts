/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notification Module
 * Handles Web Push subscriptions and notification sending
 */
import type { DomainRequest } from '../types/index.js';
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
interface NotificationResult {
    sent: number;
    failed: number;
    disabled?: boolean;
    noSubscriptions?: boolean;
    total?: number;
}
export declare function saveSubscription(userId: string, groupIds: string[], subscription: PushSubscription, userAgent?: string): SubscriptionRecord;
export declare function getSubscriptionsForGroup(groupId: string): SubscriptionRecord[];
export declare function getSubscriptionsForUser(userId: string): SubscriptionRecord[];
export declare function deleteSubscriptionByEndpoint(endpoint: string): boolean;
export declare function deleteSubscriptionById(id: string): boolean;
export declare function notifyTeachersOfNewRequest(request: DomainRequest): Promise<NotificationResult>;
export declare function getVapidPublicKey(): string | null;
export declare function isPushEnabled(): boolean;
declare const _default: {
    saveSubscription: typeof saveSubscription;
    getSubscriptionsForGroup: typeof getSubscriptionsForGroup;
    getSubscriptionsForUser: typeof getSubscriptionsForUser;
    deleteSubscriptionByEndpoint: typeof deleteSubscriptionByEndpoint;
    deleteSubscriptionById: typeof deleteSubscriptionById;
    notifyTeachersOfNewRequest: typeof notifyTeachersOfNewRequest;
    getVapidPublicKey: typeof getVapidPublicKey;
    isPushEnabled: typeof isPushEnabled;
};
export default _default;
//# sourceMappingURL=push.d.ts.map