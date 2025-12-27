/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Request routes - Domain request endpoints
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import * as storage from '../lib/storage.js';
import * as github from '../lib/github.js';
import * as push from '../lib/push.js';
import { stripUndefined } from '../lib/utils.js';
import * as auth from '../lib/auth.js';
// =============================================================================
// Rate Limiting
// =============================================================================
const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});
const autoInclusionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: {
        success: false,
        error: 'Auto-inclusion rate limit exceeded',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});
// =============================================================================
// Security Utilities
// =============================================================================
function secureCompare(a, b) {
    if (a === undefined || a === null || b === undefined || b === null)
        return false;
    const buf1 = Buffer.from(String(a));
    const buf2 = Buffer.from(String(b));
    if (buf1.length !== buf2.length) {
        crypto.timingSafeEqual(buf1, buf1);
        return false;
    }
    return crypto.timingSafeEqual(buf1, buf2);
}
function sanitize(str, maxLen = 500) {
    if (str === null || str === undefined || typeof str !== 'string')
        return '';
    return str
        .slice(0, maxLen)
        .replace(/<[^>]*>/g, '')
        .replace(/[<>"'&]/g, '')
        .trim();
}
function isValidDomain(domain) {
    if (domain === null || domain === undefined || typeof domain !== 'string')
        return false;
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain.trim());
}
function isValidAutoInclusionDomain(domain) {
    if (!isValidDomain(domain))
        return false;
    const blocklist = [
        /^localhost$/i,
        /^\d+\.\d+\.\d+\.\d+$/,
        /\.local$/i,
        /\.onion$/i,
        /\.internal$/i,
        /\.test$/i,
        /\.example$/i
    ];
    return !blocklist.some(pattern => pattern.test(domain));
}
function generateToken(hostname, secret) {
    return crypto.createHash('sha256')
        .update(hostname + secret)
        .digest('base64');
}
// =============================================================================
// Middleware
// =============================================================================
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            success: false,
            error: 'Authorization header required'
        });
        return;
    }
    const token = authHeader.slice(7);
    const decoded = await auth.verifyAccessToken(token);
    if (decoded !== null) {
        req.user = decoded;
        next();
        return;
    }
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken !== undefined && adminToken !== '' && secureCompare(token, adminToken)) {
        req.user = auth.createLegacyAdminPayload();
        next();
        return;
    }
    res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
    });
}
function requireAdmin(req, res, next) {
    if (req.user === undefined || !auth.isAdminToken(req.user)) {
        res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
        return;
    }
    next();
}
function canApproveRequest(req, res, next) {
    const request = storage.getRequestById(req.params.id);
    if (request === null) {
        res.status(404).json({
            success: false,
            error: 'Request not found'
        });
        return;
    }
    req.request = request;
    if (req.user === undefined || !auth.canApproveGroup(req.user, request.group_id)) {
        res.status(403).json({
            success: false,
            error: 'No permission to approve requests for this group',
            group_id: request.group_id
        });
        return;
    }
    next();
}
function filterByUserGroups(req, _res, next) {
    req.approvalGroups = auth.getApprovalGroups(req.user);
    next();
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * POST /api/requests/auto
 */
router.post('/auto', autoInclusionLimiter, async (req, res) => {
    const { domain, origin_page, group_id, token, hostname } = req.body;
    if (domain === undefined || domain === '' || origin_page === undefined || origin_page === '' || group_id === undefined || group_id === '' || token === undefined || token === '' || hostname === undefined || hostname === '') {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: domain, origin_page, group_id, token, hostname',
            code: 'MISSING_FIELDS'
        });
    }
    const sharedSecret = process.env.SHARED_SECRET;
    if (sharedSecret === undefined || sharedSecret === '') {
        console.error('SHARED_SECRET not configured');
        return res.status(500).json({
            success: false,
            error: 'Server not configured',
            code: 'SERVER_ERROR'
        });
    }
    const expectedToken = generateToken(hostname, sharedSecret);
    if (!secureCompare(token, expectedToken)) {
        console.warn(`Invalid token attempt from hostname: ${hostname}`);
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
    const isOriginValid = await github.isDomainInWhitelist(origin_page, group_id);
    if (!isOriginValid) {
        console.warn(`Origin not whitelisted: ${origin_page} in ${group_id}`);
        return res.status(403).json({
            success: false,
            error: 'Origin page not in whitelist',
            code: 'ORIGIN_NOT_WHITELISTED'
        });
    }
    if (!isValidAutoInclusionDomain(domain)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid domain format',
            code: 'INVALID_DOMAIN'
        });
    }
    try {
        const result = await github.addDomainToWhitelist(domain, group_id);
        if (result.success === false) {
            return res.status(400).json({
                success: false,
                error: result.message,
                code: 'ADD_FAILED'
            });
        }
        console.log(JSON.stringify({
            level: 'INFO',
            event: 'auto_include',
            domain: domain.toLowerCase(),
            origin_page,
            group_id,
            hostname,
            timestamp: new Date().toISOString()
        }));
        return res.status(201).json({
            success: true,
            domain: domain.toLowerCase(),
            group_id,
            added_at: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error in auto-inclusion:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add domain',
            code: 'SERVER_ERROR'
        });
    }
});
/**
 * POST /api/requests
 */
router.post('/', publicLimiter, (req, res) => {
    const { domain, reason, requester_email, group_id, priority } = req.body;
    if (!domain) {
        return res.status(400).json({
            success: false,
            error: 'Domain is required',
            code: 'MISSING_DOMAIN'
        });
    }
    if (!isValidDomain(domain)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid domain format',
            code: 'INVALID_DOMAIN'
        });
    }
    if (storage.hasPendingRequest(domain)) {
        return res.status(409).json({
            success: false,
            error: 'A pending request for this domain already exists',
            code: 'DUPLICATE_REQUEST'
        });
    }
    try {
        const request = storage.createRequest(stripUndefined({
            domain: domain.trim().toLowerCase(),
            reason: sanitize(reason) !== '' ? sanitize(reason) : 'No reason provided',
            requesterEmail: sanitize(requester_email, 100),
            groupId: group_id,
            priority: priority
        }));
        push.notifyTeachersOfNewRequest(request).catch(err => {
            console.error('Push notification failed:', err.message);
        });
        return res.status(201).json({
            success: true,
            request_id: request.id,
            status: request.status,
            domain: request.domain,
            message: 'Request created, waiting for admin approval',
            created_at: request.created_at
        });
    }
    catch (error) {
        console.error('Error creating request:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create request',
            code: 'SERVER_ERROR'
        });
    }
});
/**
 * GET /api/requests/status/:id
 */
router.get('/status/:id', (req, res) => {
    const request = storage.getRequestById(req.params.id);
    if (request === null) {
        return res.status(404).json({
            success: false,
            error: 'Request not found',
            code: 'NOT_FOUND'
        });
    }
    return res.json({
        success: true,
        request_id: request.id,
        domain: request.domain,
        status: request.status,
        created_at: request.created_at,
        resolved_at: request.resolved_at
    });
});
/**
 * GET /api/requests/groups/list
 */
router.get('/groups/list', adminLimiter, requireAuth, filterByUserGroups, async (req, res) => {
    try {
        const allGroups = await github.listWhitelistFiles();
        let groups = allGroups;
        if (req.approvalGroups !== 'all' && Array.isArray(req.approvalGroups)) {
            groups = allGroups.filter(g => req.approvalGroups.includes(g.name));
        }
        return res.json({
            success: true,
            groups
        });
    }
    catch (error) {
        console.error('Error listing groups:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to list groups'
        });
    }
});
/**
 * GET /api/requests/domains/blocked
 */
router.get('/domains/blocked', adminLimiter, requireAuth, requireAdmin, async (_req, res) => {
    try {
        const file = await github.getFileContent('blocked-subdomains.txt');
        const lines = file.content.split('\n');
        const blockedDomains = lines
            .map(line => line.trim())
            .filter(line => line !== '' && !line.startsWith('#'));
        return res.json({
            success: true,
            blocked_domains: blockedDomains,
            count: blockedDomains.length
        });
    }
    catch {
        return res.json({
            success: true,
            blocked_domains: [],
            count: 0,
            note: 'No blocked-subdomains.txt file found'
        });
    }
});
/**
 * POST /api/requests/domains/check
 */
router.post('/domains/check', adminLimiter, requireAuth, async (req, res) => {
    const { domain } = req.body;
    if (!domain) {
        return res.status(400).json({
            success: false,
            error: 'Domain is required'
        });
    }
    try {
        const result = await github.isDomainBlocked(domain);
        return res.json({
            success: true,
            domain,
            blocked: result.blocked,
            matched_rule: result.matchedRule
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            error: 'Failed to check domain'
        });
    }
});
/**
 * GET /api/requests
 */
router.get('/', adminLimiter, requireAuth, filterByUserGroups, (req, res) => {
    const { status } = req.query;
    try {
        let requests = storage.getAllRequests(status ?? null);
        if (req.approvalGroups !== 'all' && Array.isArray(req.approvalGroups)) {
            requests = requests.filter(r => req.approvalGroups.includes(r.group_id));
        }
        const stats = {
            total: requests.length,
            pending: requests.filter(r => r.status === 'pending').length,
            approved: requests.filter(r => r.status === 'approved').length,
            rejected: requests.filter(r => r.status === 'rejected').length
        };
        return res.json({
            success: true,
            stats,
            requests: requests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        });
    }
    catch (error) {
        console.error('Error listing requests:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to list requests'
        });
    }
});
/**
 * GET /api/requests/:id
 */
router.get('/:id', adminLimiter, requireAuth, canApproveRequest, (req, res) => {
    return res.json({
        success: true,
        request: req.request
    });
});
/**
 * POST /api/requests/:id/approve
 */
router.post('/:id/approve', adminLimiter, requireAuth, canApproveRequest, async (req, res) => {
    const { group_id } = req.body;
    const request = req.request;
    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: `Request already ${request.status}`
        });
    }
    const targetGroup = group_id ?? request.group_id;
    if (group_id !== undefined && group_id !== '' && group_id !== request.group_id) {
        if (auth.canApproveGroup(req.user, group_id) === false) {
            return res.status(403).json({
                success: false,
                error: 'No permission to approve for this group',
                group_id
            });
        }
    }
    if (auth.isAdminToken(req.user) === false) {
        const blockCheck = await github.isDomainBlocked(request.domain);
        if (blockCheck.blocked === true) {
            return res.status(403).json({
                success: false,
                error: 'Este dominio está bloqueado por el administrador',
                code: 'DOMAIN_BLOCKED',
                domain: request.domain,
                matched_rule: blockCheck.matchedRule,
                hint: 'Contacta al administrador para revisar esta restricción'
            });
        }
    }
    try {
        const githubResult = await github.addDomainToWhitelist(request.domain, targetGroup);
        if (githubResult.success === false) {
            return res.status(400).json({
                success: false,
                error: githubResult.message
            });
        }
        const approverName = req.user?.name ?? req.user?.email ?? req.user?.sub ?? 'unknown';
        const updated = storage.updateRequestStatus(request.id, 'approved', approverName, `Added to ${targetGroup}`);
        return res.json({
            success: true,
            message: `Domain ${request.domain} approved and added to ${targetGroup}`,
            domain: request.domain,
            group_id: targetGroup,
            status: 'approved',
            approved_by: approverName,
            request: updated
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error approving request:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to approve request: ' + message
        });
    }
});
/**
 * POST /api/requests/:id/reject
 */
router.post('/:id/reject', adminLimiter, requireAuth, canApproveRequest, (req, res) => {
    const { reason } = req.body;
    const request = req.request;
    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: `Request already ${request.status}`
        });
    }
    try {
        const rejecterName = req.user?.name ?? req.user?.email ?? req.user?.sub ?? 'unknown';
        const updated = storage.updateRequestStatus(request.id, 'rejected', rejecterName, sanitize(reason) !== '' ? sanitize(reason) : 'No reason provided');
        return res.json({
            success: true,
            message: `Request for ${request.domain} rejected`,
            domain: request.domain,
            status: 'rejected',
            rejected_by: rejecterName,
            request: updated
        });
    }
    catch (error) {
        console.error('Error rejecting request:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to reject request'
        });
    }
});
/**
 * DELETE /api/requests/:id
 */
router.delete('/:id', adminLimiter, requireAuth, requireAdmin, (req, res) => {
    const deleted = storage.deleteRequest(req.params.id);
    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Request not found'
        });
    }
    return res.json({
        success: true,
        message: 'Request deleted'
    });
});
export default router;
//# sourceMappingURL=requests.js.map