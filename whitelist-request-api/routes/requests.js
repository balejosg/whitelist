/**
 * Request routes - Domain request endpoints
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const storage = require('../lib/storage');
const github = require('../lib/github');

// =============================================================================
// Rate Limiting
// =============================================================================

// Public endpoints: 10 requests per minute per IP
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

// Admin endpoints: 100 requests per minute per IP
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

// =============================================================================
// Security Utilities
// =============================================================================

// Timing-safe string comparison to prevent timing attacks
function secureCompare(a, b) {
    if (!a || !b) return false;
    const buf1 = Buffer.from(String(a));
    const buf2 = Buffer.from(String(b));
    if (buf1.length !== buf2.length) {
        // Compare against self to maintain constant time
        crypto.timingSafeEqual(buf1, buf1);
        return false;
    }
    return crypto.timingSafeEqual(buf1, buf2);
}

// Sanitize text input - strip HTML, limit length
function sanitize(str, maxLen = 500) {
    if (!str || typeof str !== 'string') return '';
    return str
        .slice(0, maxLen)
        .replace(/<[^>]*>/g, '')  // Strip HTML tags
        .replace(/[<>"'&]/g, '')  // Remove dangerous chars
        .trim();
}

// =============================================================================
// Middleware
// =============================================================================

// Middleware: Validate admin token with timing-safe comparison
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;

    // Check for auth header first (returns 401)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required'
        });
    }

    const adminToken = process.env.ADMIN_TOKEN;

    // Check if server is configured (returns 500)
    if (!adminToken) {
        return res.status(500).json({
            success: false,
            error: 'Server not configured: ADMIN_TOKEN missing'
        });
    }

    const token = authHeader.slice(7);

    // Use timing-safe comparison to prevent timing attacks
    if (!secureCompare(token, adminToken)) {
        return res.status(403).json({
            success: false,
            error: 'Invalid admin token'
        });
    }

    next();
}

// Validate domain format
function isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;

    // Basic domain validation
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain.trim());
}

// =============================================================================
// PUBLIC ENDPOINTS (no auth required)
// =============================================================================

// Rate limiter for auto-inclusion: 50 requests per hour per IP
const autoInclusionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 50,
    message: {
        success: false,
        error: 'Auto-inclusion rate limit exceeded',
        code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Generate token from hostname + shared secret
function generateToken(hostname, secret) {
    return crypto.createHash('sha256')
        .update(hostname + secret)
        .digest('base64');
}

// Validate domain for auto-inclusion (stricter rules)
function isValidAutoInclusionDomain(domain) {
    if (!isValidDomain(domain)) return false;

    // Block suspicious patterns
    const blocklist = [
        /^localhost$/i,
        /^\d+\.\d+\.\d+\.\d+$/,  // No IPs
        /\.local$/i,
        /\.onion$/i,
        /\.internal$/i,
        /\.test$/i,
        /\.example$/i
    ];

    return !blocklist.some(pattern => pattern.test(domain));
}

/**
 * POST /api/requests/auto
 * Auto-include domain in whitelist (no admin approval needed)
 * Requires valid token and origin page in whitelist
 */
router.post('/auto', autoInclusionLimiter, async (req, res) => {
    const { domain, origin_page, group_id, token, hostname } = req.body;

    // 1. Validate required fields
    if (!domain || !origin_page || !group_id || !token || !hostname) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: domain, origin_page, group_id, token, hostname',
            code: 'MISSING_FIELDS'
        });
    }

    // 2. Validate token (hostname + shared secret)
    const sharedSecret = process.env.SHARED_SECRET;
    if (!sharedSecret) {
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
        return res.status(403).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }

    // 3. Validate origin page is in whitelist
    const isOriginValid = await github.isDomainInWhitelist(origin_page, group_id);
    if (!isOriginValid) {
        console.warn(`Origin not whitelisted: ${origin_page} in ${group_id}`);
        return res.status(403).json({
            success: false,
            error: 'Origin page not in whitelist',
            code: 'ORIGIN_NOT_WHITELISTED'
        });
    }

    // 4. Validate domain format
    if (!isValidAutoInclusionDomain(domain)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid domain format',
            code: 'INVALID_DOMAIN'
        });
    }

    try {
        // 5. Add domain to whitelist automatically
        const result = await github.addDomainToWhitelist(domain, group_id);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.message,
                code: 'ADD_FAILED'
            });
        }

        // 6. Audit log
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
});

/**
 * POST /api/requests
 * Submit a new domain request
 */
router.post('/', publicLimiter, (req, res) => {
    const { domain, reason, requester_email, group_id, priority } = req.body;

    // Validate domain
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

    // Check if already has pending request
    if (storage.hasPendingRequest(domain)) {
        return res.status(409).json({
            success: false,
            error: 'A pending request for this domain already exists',
            code: 'DUPLICATE_REQUEST'
        });
    }

    // Create the request
    try {
        const request = storage.createRequest({
            domain: domain.trim().toLowerCase(),
            reason: sanitize(reason) || 'No reason provided',
            requesterEmail: sanitize(requester_email, 100),
            groupId: group_id,
            priority
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
 * Check status of a specific request (public, limited info)
 */
router.get('/status/:id', (req, res) => {
    const request = storage.getRequestById(req.params.id);

    if (!request) {
        return res.status(404).json({
            success: false,
            error: 'Request not found',
            code: 'NOT_FOUND'
        });
    }

    // Return limited info for public
    res.json({
        success: true,
        request_id: request.id,
        domain: request.domain,
        status: request.status,
        created_at: request.created_at,
        resolved_at: request.resolved_at
    });
});

// =============================================================================
// ADMIN ENDPOINTS (require auth)
// =============================================================================

/**
 * GET /api/requests/groups/list
 * List available whitelist groups (admin only)
 * NOTE: This route MUST be before /:id to avoid being matched as an ID
 */
router.get('/groups/list', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const groups = await github.listWhitelistFiles();

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
});

/**
 * GET /api/requests
 * List all requests (admin only)
 */
router.get('/', adminLimiter, requireAdmin, (req, res) => {
    const { status } = req.query;

    try {
        const requests = storage.getAllRequests(status || null);
        const stats = storage.getStats();

        res.json({
            success: true,
            stats,
            requests: requests.sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
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
 * Get single request details (admin only)
 */
router.get('/:id', adminLimiter, requireAdmin, (req, res) => {
    const request = storage.getRequestById(req.params.id);

    if (!request) {
        return res.status(404).json({
            success: false,
            error: 'Request not found'
        });
    }

    res.json({
        success: true,
        request
    });
});

/**
 * POST /api/requests/:id/approve
 * Approve a request and add domain to whitelist
 */
router.post('/:id/approve', adminLimiter, requireAdmin, async (req, res) => {
    const { group_id } = req.body;
    const request = storage.getRequestById(req.params.id);

    if (!request) {
        return res.status(404).json({
            success: false,
            error: 'Request not found'
        });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: `Request already ${request.status}`
        });
    }

    const targetGroup = group_id || request.group_id;

    try {
        // Add domain to GitHub whitelist
        const githubResult = await github.addDomainToWhitelist(
            request.domain,
            targetGroup
        );

        if (!githubResult.success) {
            return res.status(400).json({
                success: false,
                error: githubResult.message
            });
        }

        // Update request status
        const updated = storage.updateRequestStatus(
            request.id,
            'approved',
            'admin',
            `Added to ${targetGroup}`
        );

        res.json({
            success: true,
            message: `Domain ${request.domain} approved and added to ${targetGroup}`,
            domain: request.domain,
            group_id: targetGroup,
            status: 'approved',
            request: updated
        });

    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve request: ' + error.message
        });
    }
});

/**
 * POST /api/requests/:id/reject
 * Reject a request
 */
router.post('/:id/reject', adminLimiter, requireAdmin, (req, res) => {
    const { reason } = req.body;
    const request = storage.getRequestById(req.params.id);

    if (!request) {
        return res.status(404).json({
            success: false,
            error: 'Request not found'
        });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: `Request already ${request.status}`
        });
    }

    try {
        const updated = storage.updateRequestStatus(
            request.id,
            'rejected',
            'admin',
            sanitize(reason) || 'No reason provided'
        );

        res.json({
            success: true,
            message: `Request for ${request.domain} rejected`,
            domain: request.domain,
            status: 'rejected',
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
 * Delete a request (admin only)
 */
router.delete('/:id', adminLimiter, requireAdmin, (req, res) => {
    const deleted = storage.deleteRequest(req.params.id);

    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Request not found'
        });
    }

    res.json({
        success: true,
        message: 'Request deleted'
    });
});

module.exports = router;
