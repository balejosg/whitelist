/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Push Notification Module
 * Handles Web Push subscriptions and notification sending
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const webPush = require('web-push');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

// =============================================================================
// Configuration
// =============================================================================

// Check if VAPID keys are configured
const VAPID_CONFIGURED = !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
);

if (VAPID_CONFIGURED) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('⚠️  WARNING: VAPID keys not configured. Push notifications disabled.');
    console.warn('   Generate keys with: npx web-push generate-vapid-keys');
}

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * Load subscriptions from file
 * @returns {Object} { subscriptions: Array }
 */
function loadSubscriptions() {
    try {
        if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
            return { subscriptions: [] };
        }
        const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading push subscriptions:', error);
        return { subscriptions: [] };
    }
}

/**
 * Save subscriptions to file
 * @param {Object} data
 */
function saveSubscriptions(data) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Save a push subscription
 * @param {string} userId - User ID
 * @param {Array<string>} groupIds - Groups to receive notifications for
 * @param {Object} subscription - PushSubscription object from browser
 * @param {string} userAgent - Browser user agent (for debugging)
 * @returns {Object} Created subscription record
 */
function saveSubscription(userId, groupIds, subscription, userAgent = '') {
    const data = loadSubscriptions();

    // Remove existing subscription for same endpoint (re-subscribe)
    data.subscriptions = data.subscriptions.filter(
        s => s.subscription.endpoint !== subscription.endpoint
    );

    const record = {
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

/**
 * Get subscriptions for a specific group
 * @param {string} groupId - Group ID
 * @returns {Array} Subscriptions for the group
 */
function getSubscriptionsForGroup(groupId) {
    const data = loadSubscriptions();
    return data.subscriptions.filter(s => s.groupIds.includes(groupId));
}

/**
 * Get subscriptions for a specific user
 * @param {string} userId - User ID
 * @returns {Array} User's subscriptions
 */
function getSubscriptionsForUser(userId) {
    const data = loadSubscriptions();
    return data.subscriptions.filter(s => s.userId === userId);
}

/**
 * Delete a subscription by endpoint
 * @param {string} endpoint - Subscription endpoint URL
 * @returns {boolean} True if deleted
 */
function deleteSubscriptionByEndpoint(endpoint) {
    const data = loadSubscriptions();
    const initialLength = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter(
        s => s.subscription.endpoint !== endpoint
    );

    if (data.subscriptions.length < initialLength) {
        saveSubscriptions(data);
        return true;
    }
    return false;
}

/**
 * Delete a subscription by ID
 * @param {string} id - Subscription ID
 * @returns {boolean} True if deleted
 */
function deleteSubscriptionById(id) {
    const data = loadSubscriptions();
    const initialLength = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter(s => s.id !== id);

    if (data.subscriptions.length < initialLength) {
        saveSubscriptions(data);
        return true;
    }
    return false;
}

// =============================================================================
// Notification Functions
// =============================================================================

/**
 * Send notification to all teachers of a group
 * @param {Object} request - Domain request object
 * @returns {Promise<Object>} Results summary
 */
async function notifyTeachersOfNewRequest(request) {
    if (!VAPID_CONFIGURED) {
        return { sent: 0, failed: 0, disabled: true };
    }

    const subscriptions = getSubscriptionsForGroup(request.group_id);

    if (subscriptions.length === 0) {
        return { sent: 0, failed: 0, noSubscriptions: true };
    }

    const payload = JSON.stringify({
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
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webPush.sendNotification(sub.subscription, payload)
        )
    );

    let sent = 0;
    let failed = 0;

    // Process results and cleanup invalid subscriptions
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            sent++;
        } else {
            failed++;
            // HTTP 410 Gone = subscription expired, remove it
            if (result.reason?.statusCode === 410) {
                deleteSubscriptionByEndpoint(subscriptions[i].subscription.endpoint);
                console.log(`Removed expired push subscription: ${subscriptions[i].id}`);
            } else {
                console.error('Push notification failed:', result.reason?.message);
            }
        }
    });

    console.log(`Push notifications sent: ${sent}/${subscriptions.length} for request ${request.id}`);
    return { sent, failed, total: subscriptions.length };
}

/**
 * Get the public VAPID key for clients
 * @returns {string|null} VAPID public key or null if not configured
 */
function getVapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Check if push notifications are enabled
 * @returns {boolean}
 */
function isPushEnabled() {
    return VAPID_CONFIGURED;
}

module.exports = {
    saveSubscription,
    getSubscriptionsForGroup,
    getSubscriptionsForUser,
    deleteSubscriptionByEndpoint,
    deleteSubscriptionById,
    notifyTeachersOfNewRequest,
    getVapidPublicKey,
    isPushEnabled
};
