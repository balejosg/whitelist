/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notification Routes
 * Endpoints for managing push subscriptions
 */
import { Router } from 'express';
import * as push from '../lib/push.js';
import * as auth from '../lib/auth.js';
// =============================================================================
// Middleware
// =============================================================================
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            success: false,
            error: 'Authorization header required'
        });
        return;
    }
    const token = authHeader.slice(7);
    const decoded = await auth.verifyAccessToken(token);
    if (decoded) {
        req.user = decoded;
        next();
        return;
    }
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
        req.user = auth.createLegacyAdminPayload();
        next();
        return;
    }
    res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
    });
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * GET /api/push/vapid-key
 */
router.get('/vapid-key', (_req, res) => {
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
 */
router.get('/status', requireAuth, (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
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
 */
router.post('/subscribe', requireAuth, (req, res) => {
    const { subscription, groupIds } = req.body;
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
    let targetGroups = groupIds;
    if (!targetGroups || targetGroups.length === 0) {
        const userGroups = auth.getApprovalGroups(req.user);
        if (userGroups === 'all') {
            targetGroups = ['*'];
        }
        else if (userGroups.length > 0) {
            targetGroups = userGroups;
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'No groups to subscribe to',
                code: 'NO_GROUPS'
            });
        }
    }
    try {
        const userAgent = req.headers['user-agent'] ?? '';
        const record = push.saveSubscription(req.user?.sub ?? 'unknown', targetGroups, subscription, userAgent);
        res.status(201).json({
            success: true,
            message: 'Push subscription registered',
            subscriptionId: record.id,
            groupIds: record.groupIds
        });
    }
    catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save subscription'
        });
    }
});
/**
 * DELETE /api/push/subscribe
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
    }
    else if (subscriptionId) {
        deleted = push.deleteSubscriptionById(subscriptionId);
    }
    if (deleted) {
        res.json({
            success: true,
            message: 'Subscription removed'
        });
    }
    else {
        res.status(404).json({
            success: false,
            error: 'Subscription not found'
        });
    }
});
export default router;
//# sourceMappingURL=push.js.map