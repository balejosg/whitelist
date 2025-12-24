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
 * Classroom Routes - Classroom and Machine management endpoints
 */

const express = require('express');
const router = express.Router();
const classroomStorage = require('../lib/classroom-storage');
const auth = require('../lib/auth');

// =============================================================================
// Middleware
// =============================================================================

/**
 * Authenticate user (requires valid JWT or ADMIN_TOKEN)
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header required'
        });
    }

    const token = authHeader.slice(7);

    // Try JWT first (async for Redis blacklist support)
    const decoded = await auth.verifyAccessToken(token);
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

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
    if (!auth.isAdminToken(req.user)) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
    next();
}

/**
 * Authenticate machine with shared secret
 */
function requireSharedSecret(req, res, next) {
    const secret = process.env.SHARED_SECRET;
    if (!secret) {
        // If no secret configured, allow all (for dev)
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing shared secret'
        });
    }
    next();
}

// =============================================================================
// Classroom CRUD (Admin only)
// =============================================================================

/**
 * GET /api/classrooms
 * List all classrooms
 */
router.get('/', requireAuth, requireAdmin, (req, res) => {
    try {
        const classrooms = classroomStorage.getAllClassrooms();
        res.json({
            success: true,
            classrooms,
            count: classrooms.length
        });
    } catch (error) {
        console.error('Error listing classrooms:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list classrooms'
        });
    }
});

/**
 * POST /api/classrooms
 * Create a new classroom
 */
router.post('/', requireAuth, requireAdmin, (req, res) => {
    const { name, display_name, default_group_id } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'Name is required'
        });
    }

    try {
        const classroom = classroomStorage.createClassroom({
            name,
            displayName: display_name,
            defaultGroupId: default_group_id
        });

        res.status(201).json({
            success: true,
            message: 'Classroom created',
            classroom
        });
    } catch (error) {
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: error.message
            });
        }
        console.error('Error creating classroom:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create classroom'
        });
    }
});

/**
 * GET /api/classrooms/:id
 * Get classroom details with machines
 */
router.get('/:id', requireAuth, requireAdmin, (req, res) => {
    const classroom = classroomStorage.getClassroomById(req.params.id);

    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    const machines = classroomStorage.getMachinesByClassroom(req.params.id);
    const currentGroupId = classroomStorage.getCurrentGroupId(req.params.id);

    res.json({
        success: true,
        classroom: {
            ...classroom,
            current_group_id: currentGroupId,
            machines,
            machine_count: machines.length
        }
    });
});

/**
 * PUT /api/classrooms/:id
 * Update classroom
 */
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
    const { display_name, default_group_id } = req.body;

    const updated = classroomStorage.updateClassroom(req.params.id, {
        displayName: display_name,
        defaultGroupId: default_group_id
    });

    if (!updated) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    res.json({
        success: true,
        message: 'Classroom updated',
        classroom: updated
    });
});

/**
 * PUT /api/classrooms/:id/active-group
 * Set the active group for a classroom (manual override)
 */
router.put('/:id/active-group', requireAuth, requireAdmin, (req, res) => {
    const { group_id } = req.body;

    // Allow null to reset to default
    const groupId = group_id === null || group_id === '' ? null : group_id;

    const updated = classroomStorage.setActiveGroup(req.params.id, groupId);

    if (!updated) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    const currentGroupId = classroomStorage.getCurrentGroupId(req.params.id);

    res.json({
        success: true,
        message: groupId ? `Active group set to ${groupId}` : 'Reset to default group',
        classroom: updated,
        current_group_id: currentGroupId
    });
});

/**
 * DELETE /api/classrooms/:id
 * Delete classroom and all its machines
 */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
    const deleted = classroomStorage.deleteClassroom(req.params.id);

    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    res.json({
        success: true,
        message: 'Classroom deleted'
    });
});

// =============================================================================
// Machine Endpoints
// =============================================================================

/**
 * POST /api/classrooms/machines/register
 * Register a machine in a classroom (called by install.sh)
 * Uses shared secret authentication
 */
router.post('/machines/register', requireSharedSecret, (req, res) => {
    const { hostname, classroom_id, classroom_name, version } = req.body;

    if (!hostname) {
        return res.status(400).json({
            success: false,
            error: 'Hostname is required'
        });
    }

    // Allow registration by classroom_id or classroom_name
    let classroomId = classroom_id;
    if (!classroomId && classroom_name) {
        const classroom = classroomStorage.getClassroomByName(classroom_name);
        if (classroom) {
            classroomId = classroom.id;
        }
    }

    if (!classroomId) {
        return res.status(400).json({
            success: false,
            error: 'Valid classroom_id or classroom_name is required'
        });
    }

    // Verify classroom exists
    const classroom = classroomStorage.getClassroomById(classroomId);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    try {
        const machine = classroomStorage.registerMachine({
            hostname,
            classroomId,
            version
        });

        res.status(201).json({
            success: true,
            message: 'Machine registered',
            machine,
            classroom: {
                id: classroom.id,
                name: classroom.name,
                display_name: classroom.display_name
            }
        });
    } catch (error) {
        console.error('Error registering machine:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register machine'
        });
    }
});

/**
 * GET /api/classrooms/machines/:hostname/whitelist-url
 * Get the current whitelist URL for a machine
 * Uses shared secret authentication (called by agents)
 */
router.get('/machines/:hostname/whitelist-url', requireSharedSecret, (req, res) => {
    const { hostname } = req.params;

    // Update last seen
    classroomStorage.updateMachineLastSeen(hostname);

    const result = classroomStorage.getWhitelistUrlForMachine(hostname);

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'Machine not found or no group configured',
            code: 'NO_WHITELIST'
        });
    }

    res.json({
        success: true,
        ...result
    });
});

/**
 * DELETE /api/classrooms/machines/:hostname
 * Remove a machine (admin only)
 */
router.delete('/machines/:hostname', requireAuth, requireAdmin, (req, res) => {
    const deleted = classroomStorage.deleteMachine(req.params.hostname);

    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Machine not found'
        });
    }

    res.json({
        success: true,
        message: 'Machine removed'
    });
});

/**
 * GET /api/classrooms/stats
 * Get classroom and machine statistics
 */
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
    const stats = classroomStorage.getStats();
    res.json({
        success: true,
        stats
    });
});

module.exports = router;
