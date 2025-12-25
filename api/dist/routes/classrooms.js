/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Routes - Classroom and Machine management endpoints
 */
import { Router } from 'express';
import * as classroomStorage from '../lib/classroom-storage.js';
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
function requireAdmin(req, res, next) {
    if (!req.user || !auth.isAdminToken(req.user)) {
        res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
        return;
    }
    next();
}
function requireSharedSecret(req, res, next) {
    const secret = process.env.SHARED_SECRET;
    if (!secret) {
        next();
        return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        res.status(401).json({
            success: false,
            error: 'Invalid or missing shared secret'
        });
        return;
    }
    next();
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * GET /api/classrooms
 */
router.get('/', requireAuth, requireAdmin, (_req, res) => {
    try {
        const classrooms = classroomStorage.getAllClassrooms();
        res.json({
            success: true,
            classrooms,
            count: classrooms.length
        });
    }
    catch (error) {
        console.error('Error listing classrooms:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list classrooms'
        });
    }
});
/**
 * POST /api/classrooms
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: message
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
 */
router.put('/:id/active-group', requireAuth, requireAdmin, (req, res) => {
    const { group_id } = req.body;
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
/**
 * POST /api/classrooms/machines/register
 */
router.post('/machines/register', requireSharedSecret, (req, res) => {
    const { hostname, classroom_id, classroom_name, version } = req.body;
    if (!hostname) {
        return res.status(400).json({
            success: false,
            error: 'Hostname is required'
        });
    }
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
    }
    catch (error) {
        console.error('Error registering machine:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register machine'
        });
    }
});
/**
 * GET /api/classrooms/machines/:hostname/whitelist-url
 */
router.get('/machines/:hostname/whitelist-url', requireSharedSecret, (req, res) => {
    const hostname = req.params.hostname;
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
 */
router.get('/stats', requireAuth, requireAdmin, (_req, res) => {
    const stats = classroomStorage.getStats();
    res.json({
        success: true,
        stats
    });
});
export default router;
//# sourceMappingURL=classrooms.js.map