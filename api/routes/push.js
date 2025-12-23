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
 * Push Notification Routes
 * Endpoints for managing push subscriptions
 */

const express = require('express');
const router = express.Router();
const push = require('../lib/push');
const auth = require('../lib/auth');

// =============================================================================
// Middleware
// =============================================================================

/**
 * Middleware: Authenticate user (copy from requests.js pattern)
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required'
        });
    }

    const token = authHeader.slice(7);

    // Try JWT
    const decoded = auth.verifyAccessToken(token);
    if (decoded) {
        req.user = decoded;
        return next();
    }

    // Fall back to legacy ADMIN_TOKEN
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
        req.user = auth.createLegacyAdminPayload();
        return next();
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
    });
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/push/vapid-key
 * Get the public VAPID key for client-side subscription
 * Public endpoint (needed before user subscribes)
 */
router.get('/vapid-key', (req, res) => {
    const publicKey = push.getVapidPublicKey();

    if (!publicKey) {
        return res.status(503).json({
            success: false,
            error: 'Push notifications not configured',
            code: 'PUSH_DISABLED'
        });
    }

    res.json({
        success: true,
        publicKey,
        enabled: true
    });
});

/**
 * GET /api/push/status
 * Check push notification status for current user
 */
router.get('/status', requireAuth, (req, res) => {
    const enabled = push.isPushEnabled();
    const subscriptions = push.getSubscriptionsForUser(req.user.sub);

    res.json({
        success: true,
        pushEnabled: enabled,
        subscriptionCount: subscriptions.length,
        subscriptions: subscriptions.map(s => ({
            id: s.id,
            groupIds: s.groupIds,
            createdAt: s.createdAt,
            userAgent: s.userAgent
        }))
    });
});

/**
 * POST /api/push/subscribe
 * Register a push subscription for the current user
 */
router.post('/subscribe', requireAuth, (req, res) => {
    const { subscription, groupIds } = req.body;

    // Validate subscription object
    if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({
            success: false,
            error: 'Invalid subscription object',
            code: 'INVALID_SUBSCRIPTION'
        });
    }

    if (!subscription.keys.p256dh || !subscription.keys.auth) {
        return res.status(400).json({
            success: false,
            error: 'Subscription missing required keys',
            code: 'INVALID_SUBSCRIPTION'
        });
    }

    // Get groups to subscribe to
    let targetGroups = groupIds;

    if (!targetGroups || targetGroups.length === 0) {
        // Default to user's assigned groups
        const userGroups = auth.getApprovalGroups(req.user);
        if (userGroups === 'all') {
            // Admin: subscribe to all (will receive all notifications)
            targetGroups = ['*'];
        } else if (userGroups.length > 0) {
            targetGroups = userGroups;
        } else {
            return res.status(400).json({
                success: false,
                error: 'No groups to subscribe to',
                code: 'NO_GROUPS'
            });
        }
    }

    try {
        const userAgent = req.headers['user-agent'] || '';
        const record = push.saveSubscription(
            req.user.sub,
            targetGroups,
            subscription,
            userAgent
        );

        res.status(201).json({
            success: true,
            message: 'Push subscription registered',
            subscriptionId: record.id,
            groupIds: record.groupIds
        });

    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save subscription'
        });
    }
});

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription
 */
router.delete('/subscribe', requireAuth, (req, res) => {
    const { endpoint, subscriptionId } = req.body;

    if (!endpoint && !subscriptionId) {
        return res.status(400).json({
            success: false,
            error: 'Either endpoint or subscriptionId required'
        });
    }

    let deleted = false;

    if (endpoint) {
        deleted = push.deleteSubscriptionByEndpoint(endpoint);
    } else {
        deleted = push.deleteSubscriptionById(subscriptionId);
    }

    if (deleted) {
        res.json({
            success: true,
            message: 'Subscription removed'
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Subscription not found'
        });
    }
});

module.exports = router;
