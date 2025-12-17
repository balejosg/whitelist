/**
 * Request routes - Domain request endpoints
 */

const express = require('express');
const router = express.Router();
const storage = require('../lib/storage');
const github = require('../lib/github');

// Middleware: Validate admin token
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const adminToken = process.env.ADMIN_TOKEN;
    
    if (!adminToken) {
        return res.status(500).json({ 
            success: false, 
            error: 'Server not configured: ADMIN_TOKEN missing' 
        });
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authorization header required' 
        });
    }
    
    const token = authHeader.slice(7);
    
    if (token !== adminToken) {
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

/**
 * POST /api/requests
 * Submit a new domain request
 */
router.post('/', (req, res) => {
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
            domain,
            reason: reason || 'No reason provided',
            requesterEmail: requester_email,
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
 * GET /api/requests
 * List all requests (admin only)
 */
router.get('/', requireAdmin, (req, res) => {
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
router.get('/:id', requireAdmin, (req, res) => {
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
router.post('/:id/approve', requireAdmin, async (req, res) => {
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
router.post('/:id/reject', requireAdmin, (req, res) => {
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
            reason || 'No reason provided'
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
router.delete('/:id', requireAdmin, (req, res) => {
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

/**
 * GET /api/requests/groups/list
 * List available whitelist groups (admin only)
 */
router.get('/groups/list', requireAdmin, async (req, res) => {
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

module.exports = router;
