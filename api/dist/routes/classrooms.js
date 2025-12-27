/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom Routes - Classroom and Machine management endpoints
 */
import { Router } from 'express';
import * as classroomStorage from '../lib/classroom-storage.js';
import { stripUndefined } from '../lib/utils.js';
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
        if (adminToken !== undefined && adminToken.length > 0 && token === adminToken) {
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
function requireSharedSecret(req, res, next) {
    const secret = process.env.SHARED_SECRET;
    if (secret === undefined || secret === '') {
        next();
        return;
    }
    const authHeader = req.headers.authorization;
    if (authHeader === undefined || authHeader !== `Bearer ${secret}`) {
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
        return res.json({
            success: true,
            classrooms,
            count: classrooms.length
        });
    }
    catch (error) {
        console.error('Error listing classrooms:', error);
        return res.status(500).json({
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
    if (name.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Name is required'
        });
    }
    try {
        const classroom = classroomStorage.createClassroom(stripUndefined({
            name,
            displayName: display_name,
            defaultGroupId: default_group_id
        }));
        return res.status(201).json({
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
        return res.status(500).json({
            success: false,
            error: 'Failed to create classroom'
        });
    }
});
/**
 * GET /api/classrooms/:id
 */
router.get('/:id', requireAuth, requireAdmin, (req, res) => {
    const id = req.params.id ?? '';
    const classroom = classroomStorage.getClassroomById(id);
    if (classroom === null) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    const machines = classroomStorage.getMachinesByClassroom(id);
    const currentGroupId = classroomStorage.getCurrentGroupId(id);
    return res.json({
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
    const updated = classroomStorage.updateClassroom(req.params.id, stripUndefined({
        displayName: display_name,
        defaultGroupId: default_group_id
    }));
    if (updated === null) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    return res.json({
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
    if (updated === null) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    const currentGroupId = classroomStorage.getCurrentGroupId(req.params.id);
    return res.json({
        success: true,
        message: groupId !== null ? `Active group set to ${groupId}` : 'Reset to default group',
        classroom: updated,
        current_group_id: currentGroupId
    });
});
/**
 * DELETE /api/classrooms/:id
 */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
    const id = req.params.id ?? '';
    const deleted = classroomStorage.deleteClassroom(id);
    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    return res.json({
        success: true,
        message: 'Classroom deleted'
    });
});
/**
 * POST /api/classrooms/machines/register
 */
router.post('/machines/register', requireSharedSecret, (req, res) => {
    const { hostname, classroom_id, classroom_name, version } = req.body;
    if (hostname.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Hostname is required'
        });
    }
    let classroomId = classroom_id;
    if ((classroomId === undefined || classroomId.length === 0) && (classroom_name !== undefined && classroom_name.length > 0)) {
        const classroom = classroomStorage.getClassroomByName(classroom_name);
        if (classroom !== null) {
            classroomId = classroom.id;
        }
    }
    if (classroomId === undefined || classroomId.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Valid classroom_id or classroom_name is required'
        });
    }
    const classroom = classroomStorage.getClassroomById(classroomId);
    if (classroom === null) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    try {
        const machine = classroomStorage.registerMachine(stripUndefined({
            hostname,
            classroomId,
            version
        }));
        return res.status(201).json({
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
        return res.status(500).json({
            success: false,
            error: 'Failed to register machine'
        });
    }
});
/**
 * GET /api/classrooms/machines/:hostname/whitelist-url
 */
router.get('/machines/:hostname/whitelist-url', requireSharedSecret, (req, res) => {
    const hostname = req.params.hostname ?? '';
    classroomStorage.updateMachineLastSeen(hostname);
    const result = classroomStorage.getWhitelistUrlForMachine(hostname);
    if (result === null) {
        return res.status(404).json({
            success: false,
            error: 'Machine not found or no group configured',
            code: 'NO_WHITELIST'
        });
    }
    return res.json({
        success: true,
        ...result
    });
});
/**
 * DELETE /api/classrooms/machines/:hostname
 */
router.delete('/machines/:hostname', requireAuth, requireAdmin, (req, res) => {
    const hostname = req.params.hostname ?? '';
    const deleted = classroomStorage.deleteMachine(hostname);
    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: 'Machine not found'
        });
    }
    return res.json({
        success: true,
        message: 'Machine removed'
    });
});
/**
 * GET /api/classrooms/stats
 */
router.get('/stats', requireAuth, requireAdmin, (_req, res) => {
    const stats = classroomStorage.getStats();
    return res.json({
        success: true,
        stats
    });
});
export default router;
//# sourceMappingURL=classrooms.js.map