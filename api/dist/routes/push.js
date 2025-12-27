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
function requireAuth(req, res, next) {
    void (async () => {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ') !== true) {
            res.status(401).json({
                success: false,
                error: 'Authorization header required'
            });
            return;
        }
        const token = authHeader.slice(7);
        const decoded = await auth.verifyAccessToken(token);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (decoded !== null) {
            req.user = decoded;
            next();
            return;
        }
        const adminToken = process.env.ADMIN_TOKEN;
        if (adminToken !== undefined && adminToken !== '' && token === adminToken) {
            req.user = auth.createLegacyAdminPayload();
            next();
            return;
        }
        res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    })().catch(next);
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
    if (publicKey === null) {
        res.status(503).json({
            success: false,
            error: 'Push notifications not configured',
            code: 'PUSH_DISABLED'
        });
        return;
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
    if (req.user === undefined) {
        res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
        return;
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
    const body = req.body;
    const subscription = body.subscription;
    const groupIds = body.groupIds;
    const keys = subscription?.keys;
    if (subscription === undefined || subscription.endpoint === '' || keys === undefined) {
        res.status(400).json({
            success: false,
            error: 'Invalid subscription object',
            code: 'INVALID_SUBSCRIPTION'
        });
        return;
    }
    if (subscription.keys.p256dh === '' || subscription.keys.auth === '') {
        res.status(400).json({
            success: false,
            error: 'Subscription missing required keys',
            code: 'INVALID_SUBSCRIPTION'
        });
        return;
    }
    let targetGroups = groupIds;
    if (targetGroups === undefined || targetGroups.length === 0) {
        const userGroups = auth.getApprovalGroups(req.user);
        if (userGroups === 'all') {
            targetGroups = ['*'];
        }
        else if (userGroups.length > 0) {
            targetGroups = userGroups;
        }
        else {
            res.status(400).json({
                success: false,
                error: 'No groups to subscribe to',
                code: 'NO_GROUPS'
            });
            return;
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
    if ((endpoint === undefined || endpoint === '') && (subscriptionId === undefined || subscriptionId === '')) {
        res.status(400).json({
            success: false,
            error: 'Either endpoint or subscriptionId required'
        });
        return;
    }
    let deleted = false;
    if (endpoint !== undefined && endpoint !== '') {
        deleted = push.deleteSubscriptionByEndpoint(endpoint);
    }
    else if (subscriptionId !== undefined && subscriptionId !== '') {
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