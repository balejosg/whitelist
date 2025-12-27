/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Request routes - Domain request endpoints
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import * as storage from '../lib/storage.js';
import * as github from '../lib/github.js';
import * as push from '../lib/push.js';
import { stripUndefined } from '../lib/utils.js';
import * as auth from '../lib/auth.js';
import type { DecodedWithRoles } from '../lib/auth.js';
import type { DomainRequest } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

interface RequestWithUser extends Request {
    user?: DecodedWithRoles;
    request?: DomainRequest;
    approvalGroups?: string[] | 'all';
}

interface AutoRequestBody {
    domain: string;
    origin_page: string;
    group_id: string;
    token: string;
    hostname: string;
}

interface CreateRequestBody {
    domain: string;
    reason?: string;
    requester_email?: string;
    group_id?: string;
    priority?: string;
}

interface ApproveRequestBody {
    group_id?: string;
}

interface RejectRequestBody {
    reason?: string;
}

interface CheckDomainBody {
    domain: string;
}

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

function secureCompare(a: string, b: string): boolean {
    const buf1 = Buffer.from(a);
    const buf2 = Buffer.from(b);
    if (buf1.length !== buf2.length) {
        crypto.timingSafeEqual(buf1, buf1);
        return false;
    }
    return crypto.timingSafeEqual(buf1, buf2);
}

function sanitize(str: string | undefined, maxLen = 500): string {
    if (str === undefined || typeof str !== 'string') return '';
    return str
        .slice(0, maxLen)
        .replace(/<[^>]*>/g, '')
        .replace(/[<>"'&]/g, '')
        .trim();
}

function isValidDomain(domain: string): boolean {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain.trim());
}

function isValidAutoInclusionDomain(domain: string): boolean {
    if (!isValidDomain(domain)) return false;
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

function generateToken(hostname: string, secret: string): string {
    return crypto.createHash('sha256')
        .update(hostname + secret)
        .digest('base64');
}

// =============================================================================
// Middleware
// =============================================================================

function requireAuth(req: RequestWithUser, res: Response, next: NextFunction): void {
    void (async (): Promise<void> => {
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
        if (adminToken !== undefined && adminToken !== '' && secureCompare(token, adminToken)) {
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

function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction): void {
    if (req.user === undefined || !auth.isAdminToken(req.user)) {
        res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
        return;
    }
    next();
}

function canApproveRequest(req: RequestWithUser, res: Response, next: NextFunction): void {
    const id = req.params.id;
    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Request ID is required'
        });
        return;
    }

    const request = storage.getRequestById(id);

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

function filterByUserGroups(req: RequestWithUser, _res: Response, next: NextFunction): void {
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
router.post('/auto', autoInclusionLimiter, (req: Request<object, unknown, AutoRequestBody>, res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
        const body = req.body as Partial<AutoRequestBody>;
        const domain = body.domain;
        const origin_page = body.origin_page;
        const group_id = body.group_id;
        const token = body.token;
        const hostname = body.hostname;

        if (domain === undefined || domain === '' ||
            origin_page === undefined || origin_page === '' ||
            group_id === undefined || group_id === '' ||
            token === undefined || token === '' ||
            hostname === undefined || hostname === '') {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: domain, origin_page, group_id, token, hostname',
                code: 'MISSING_FIELDS'
            });
            return;
        }

        const sharedSecret = process.env.SHARED_SECRET;
        if (sharedSecret === undefined || sharedSecret === '') {
            console.error('SHARED_SECRET not configured');
            res.status(500).json({
                success: false,
                error: 'Server not configured',
                code: 'SERVER_ERROR'
            });
            return;
        }

        const expectedToken = generateToken(hostname, sharedSecret);
        if (!secureCompare(token, expectedToken)) {
            console.warn(`Invalid token attempt from hostname: ${hostname}`);
            res.status(401).json({
                success: false,
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
            return;
        }

        const isOriginValid = await github.isDomainInWhitelist(origin_page, group_id);
        if (!isOriginValid) {
            console.warn(`Origin not whitelisted: ${origin_page} in ${group_id}`);
            res.status(403).json({
                success: false,
                error: 'Origin page not in whitelist',
                code: 'ORIGIN_NOT_WHITELISTED'
            });
            return;
        }

        if (!isValidAutoInclusionDomain(domain)) {
            res.status(400).json({
                success: false,
                error: 'Invalid domain format',
                code: 'INVALID_DOMAIN'
            });
            return;
        }

        try {
            const result = await github.addDomainToWhitelist(domain, group_id);

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    error: result.message,
                    code: 'ADD_FAILED'
                });
                return;
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

            res.status(201).json({
                success: true,
                domain: domain.toLowerCase(),
                group_id,
                added_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error in auto-inclusion:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add domain',
                code: 'SERVER_ERROR'
            });
        }
    })().catch(next);
});

/**
 * POST /api/requests
 */
router.post('/', publicLimiter, (req: Request<object, unknown, CreateRequestBody>, res: Response) => {
    const body = req.body as Partial<CreateRequestBody>;
    const domain = body.domain;
    const reason = body.reason;
    const requester_email = body.requester_email;
    const group_id = body.group_id;
    const priority = body.priority;

    if (domain === undefined || domain === '') {
        res.status(400).json({
            success: false,
            error: 'Domain is required',
            code: 'MISSING_DOMAIN'
        });
        return;
    }

    if (!isValidDomain(domain)) {
        res.status(400).json({
            success: false,
            error: 'Invalid domain format',
            code: 'INVALID_DOMAIN'
        });
        return;
    }

    if (storage.hasPendingRequest(domain)) {
        res.status(409).json({
            success: false,
            error: 'A pending request for this domain already exists',
            code: 'DUPLICATE_REQUEST'
        });
        return;
    }

    try {
        const request = storage.createRequest(stripUndefined({
            domain: domain.trim().toLowerCase(),
            reason: sanitize(reason) !== '' ? sanitize(reason) : 'No reason provided',
            requesterEmail: sanitize(requester_email, 100),
            groupId: group_id,
            priority: priority as 'low' | 'normal' | 'high' | 'urgent' | undefined
        }) as Parameters<typeof storage.createRequest>[0]);

        push.notifyTeachersOfNewRequest(request).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('Push notification failed:', message);
        });

        res.status(201).json({
            success: true,
            request_id: request.id,
            status: request.status,
            domain: request.domain,
            message: 'Request created, waiting for admin approval',
            created_at: request.created_at
        });
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create request',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/requests/status/:id
 */
router.get('/status/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Request ID is required'
        });
        return;
    }

    const request = storage.getRequestById(id);

    if (request === null) {
        res.status(404).json({
            success: false,
            error: 'Request not found',
            code: 'NOT_FOUND'
        });
        return;
    }

    res.json({
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
router.get('/groups/list', adminLimiter, requireAuth, filterByUserGroups, (req: RequestWithUser, res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
        try {
            const allGroups = await github.listWhitelistFiles();

            let groups = allGroups;
            if (req.approvalGroups !== 'all' && Array.isArray(req.approvalGroups)) {
                const approvalGroups = req.approvalGroups;
                groups = allGroups.filter(g => approvalGroups.includes(g.name));
            }

            res.json({
                success: true,
                groups
            });
        } catch (error) {
            console.error('Error listing groups:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list groups'
            });
        }
    })().catch(next);
});

/**
 * GET /api/requests/domains/blocked
 */
router.get('/domains/blocked', adminLimiter, requireAuth, requireAdmin, (_req: Request, res: Response, _next: NextFunction): void => {
    void (async (): Promise<void> => {
        try {
            const file = await github.getFileContent('blocked-subdomains.txt');
            const lines = file.content.split('\n');

            const blockedDomains = lines
                .map(line => line.trim())
                .filter(line => line !== '' && !line.startsWith('#'));

            res.json({
                success: true,
                blocked_domains: blockedDomains,
                count: blockedDomains.length
            });
        } catch {
            res.json({
                success: true,
                blocked_domains: [],
                count: 0,
                note: 'No blocked-subdomains.txt file found'
            });
        }
    })().catch((err: unknown) => { _next(err); });
});

/**
 * POST /api/requests/domains/check
 */
router.post('/domains/check', adminLimiter, requireAuth, (req: Request<object, unknown, CheckDomainBody>, res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
        const { domain } = req.body;

        if (domain === '') {
            res.status(400).json({
                success: false,
                error: 'Domain is required'
            });
            return;
        }

        try {
            const result = await github.isDomainBlocked(domain);
            res.json({
                success: true,
                domain,
                blocked: result.blocked,
                matched_rule: result.matchedRule
            });
        } catch {
            res.status(500).json({
                success: false,
                error: 'Failed to check domain'
            });
        }
    })().catch(next);
});

/**
 * GET /api/requests
 */
router.get('/', adminLimiter, requireAuth, filterByUserGroups, (req: RequestWithUser, res: Response) => {
    const { status } = req.query;

    try {
        const requestStatus = typeof status === 'string' ? (status as import('../types/index.js').RequestStatus) : null;
        let requests = storage.getAllRequests(requestStatus);

        if (req.approvalGroups !== 'all' && Array.isArray(req.approvalGroups)) {
            const approvalGroups = req.approvalGroups;
            requests = requests.filter(r => approvalGroups.includes(r.group_id));
        }

        const stats = {
            total: requests.length,
            pending: requests.filter(r => r.status === 'pending').length,
            approved: requests.filter(r => r.status === 'approved').length,
            rejected: requests.filter(r => r.status === 'rejected').length
        };

        res.json({
            success: true,
            stats,
            requests: requests.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
        });
    } catch (error) {
        console.error('Error listing requests:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list requests'
        });
    }
});

/**
 * GET /api/requests/:id
 */
router.get('/:id', adminLimiter, requireAuth, canApproveRequest, (req: RequestWithUser, res: Response) => {
    return res.json({
        success: true,
        request: req.request
    });
});

/**
 * POST /api/requests/:id/approve
 */
router.post('/:id/approve', adminLimiter, requireAuth, canApproveRequest, (req: RequestWithUser, res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
        const { group_id } = req.body as ApproveRequestBody;
        const request = req.request;

        if (request === undefined) {
            res.status(404).json({
                success: false,
                error: 'Request not found'
            });
            return;
        }

        if (request.status !== 'pending') {
            res.status(400).json({
                success: false,
                error: `Request already ${request.status}`
            });
            return;
        }

        const targetGroup = (group_id !== undefined && group_id !== '') ? group_id : request.group_id;
        if (group_id !== undefined && group_id !== '' && group_id !== request.group_id) {
            if (req.user === undefined || !auth.canApproveGroup(req.user, group_id)) {
                res.status(403).json({
                    success: false,
                    error: 'No permission to approve for this group',
                    group_id
                });
                return;
            }
        }

        if (req.user === undefined || !auth.isAdminToken(req.user)) {
            const blockCheck = await github.isDomainBlocked(request.domain);
            if (blockCheck.blocked) {
                res.status(403).json({
                    success: false,
                    error: 'Este dominio está bloqueado por el administrador',
                    code: 'DOMAIN_BLOCKED',
                    domain: request.domain,
                    matched_rule: blockCheck.matchedRule,
                    hint: 'Contacta al administrador para revisar esta restricción'
                });
                return;
            }
        }

        try {
            const githubResult = await github.addDomainToWhitelist(request.domain, targetGroup);

            if (!githubResult.success) {
                res.status(400).json({
                    success: false,
                    error: githubResult.message
                });
                return;
            }

            const approverName = req.user?.name ?? req.user?.email ?? req.user?.sub ?? 'unknown';
            const updated = storage.updateRequestStatus(
                request.id,
                'approved',
                approverName,
                `Added to ${targetGroup}`
            );

            res.json({
                success: true,
                message: `Domain ${request.domain} approved and added to ${targetGroup}`,
                domain: request.domain,
                group_id: targetGroup,
                status: 'approved',
                approved_by: approverName,
                request: updated
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error approving request:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to approve request: ' + message
            });
        }
    })().catch(next);
});

/**
 * POST /api/requests/:id/reject
 */
router.post('/:id/reject', adminLimiter, requireAuth, canApproveRequest, (req: RequestWithUser, res: Response) => {
    const { reason } = req.body as RejectRequestBody;
    const request = req.request;

    if (request === undefined) {
        res.status(404).json({
            success: false,
            error: 'Request not found'
        });
        return;
    }

    if (request.status !== 'pending') {
        res.status(400).json({
            success: false,
            error: `Request already ${request.status}`
        });
        return;
    }

    try {
        const rejecterName = req.user?.name ?? req.user?.email ?? req.user?.sub ?? 'unknown';
        const updated = storage.updateRequestStatus(
            request.id,
            'rejected',
            rejecterName,
            sanitize(reason) !== '' ? sanitize(reason) : 'No reason provided'
        );

        res.json({
            success: true,
            message: `Request for ${request.domain} rejected`,
            domain: request.domain,
            status: 'rejected',
            rejected_by: rejecterName,
            request: updated
        });
    } catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject request'
        });
    }
});

/**
 * DELETE /api/requests/:id
 */
router.delete('/:id', adminLimiter, requireAuth, requireAdmin, (req: Request, res: Response) => {
    const id = req.params.id;
    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Request ID is required'
        });
        return;
    }

    const deleted = storage.deleteRequest(id);

    if (!deleted) {
        res.status(404).json({
            success: false,
            error: 'Request not found'
        });
        return;
    }

    res.json({
        success: true,
        message: 'Request deleted'
    });
});

export default router;
