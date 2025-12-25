/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedules API Routes
 * Manages classroom schedule reservations
 */
import { Router } from 'express';
import * as scheduleStorage from '../lib/schedule-storage.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as auth from '../lib/auth.js';
// =============================================================================
// Middleware
// =============================================================================
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
        return;
    }
    const token = authHeader.substring(7);
    auth.verifyAccessToken(token)
        .then(decoded => {
        if (!decoded) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
            return;
        }
        req.user = decoded;
        next();
    })
        .catch(() => {
        res.status(401).json({
            success: false,
            error: 'Token verification failed'
        });
    });
}
function canManageSchedule(req, res, next) {
    const schedule = scheduleStorage.getScheduleById(req.params.id);
    if (!schedule) {
        res.status(404).json({
            success: false,
            error: 'Schedule not found'
        });
        return;
    }
    const isOwner = schedule.teacher_id === req.user?.sub;
    const isAdmin = req.user ? auth.isAdminToken(req.user) : false;
    if (!isOwner && !isAdmin) {
        res.status(403).json({
            success: false,
            error: 'You can only manage your own schedules'
        });
        return;
    }
    req.schedule = schedule;
    next();
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * GET /api/schedules/classroom/:classroomId
 */
router.get('/classroom/:classroomId', requireAuth, (req, res) => {
    const classroomId = req.params.classroomId;
    const classroom = classroomStorage.getClassroomById(classroomId);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    const schedules = scheduleStorage.getSchedulesByClassroom(classroomId);
    const userId = req.user?.sub;
    const isAdmin = req.user ? auth.isAdminToken(req.user) : false;
    const schedulesWithOwnership = schedules.map(s => ({
        ...s,
        is_mine: s.teacher_id === userId,
        can_edit: s.teacher_id === userId || isAdmin
    }));
    res.json({
        success: true,
        classroom: {
            id: classroom.id,
            name: classroom.name,
            display_name: classroom.display_name
        },
        schedules: schedulesWithOwnership
    });
});
/**
 * GET /api/schedules/my
 */
router.get('/my', requireAuth, (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    const schedules = scheduleStorage.getSchedulesByTeacher(req.user.sub);
    res.json({
        success: true,
        schedules
    });
});
/**
 * POST /api/schedules
 */
router.post('/', requireAuth, (req, res) => {
    const { classroom_id, group_id, day_of_week, start_time, end_time } = req.body;
    const classroom = classroomStorage.getClassroomById(classroom_id);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    const isAdmin = req.user ? auth.isAdminToken(req.user) : false;
    if (!isAdmin && !auth.canApproveGroup(req.user, group_id)) {
        return res.status(403).json({
            success: false,
            error: 'You can only create schedules for your assigned groups'
        });
    }
    try {
        const schedule = scheduleStorage.createSchedule({
            classroom_id,
            teacher_id: req.user?.sub ?? 'unknown',
            group_id,
            day_of_week,
            start_time,
            end_time
        });
        res.status(201).json({
            success: true,
            message: 'Schedule created',
            schedule
        });
    }
    catch (error) {
        const schedError = error;
        if (schedError.message === 'Schedule conflict') {
            return res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: schedError.conflict
            });
        }
        res.status(400).json({
            success: false,
            error: schedError.message
        });
    }
});
/**
 * PUT /api/schedules/:id
 */
router.put('/:id', requireAuth, canManageSchedule, (req, res) => {
    const { day_of_week, start_time, end_time, group_id } = req.body;
    if (group_id && req.schedule && group_id !== req.schedule.group_id) {
        const isAdmin = req.user ? auth.isAdminToken(req.user) : false;
        if (!isAdmin && !auth.canApproveGroup(req.user, group_id)) {
            return res.status(403).json({
                success: false,
                error: 'You can only use your assigned groups'
            });
        }
    }
    try {
        const updated = scheduleStorage.updateSchedule(req.params.id, {
            day_of_week,
            start_time,
            end_time,
            group_id
        });
        res.json({
            success: true,
            message: 'Schedule updated',
            schedule: updated
        });
    }
    catch (error) {
        const schedError = error;
        if (schedError.message === 'Schedule conflict') {
            return res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: schedError.conflict
            });
        }
        res.status(400).json({
            success: false,
            error: schedError.message
        });
    }
});
/**
 * DELETE /api/schedules/:id
 */
router.delete('/:id', requireAuth, canManageSchedule, (req, res) => {
    scheduleStorage.deleteSchedule(req.params.id);
    res.json({
        success: true,
        message: 'Schedule deleted'
    });
});
/**
 * GET /api/schedules/classroom/:classroomId/current
 */
router.get('/classroom/:classroomId/current', requireAuth, (req, res) => {
    const classroomId = req.params.classroomId;
    const classroom = classroomStorage.getClassroomById(classroomId);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }
    const currentSchedule = scheduleStorage.getCurrentSchedule(classroomId);
    res.json({
        success: true,
        classroom_id: classroomId,
        current_schedule: currentSchedule,
        active_group_id: currentSchedule?.group_id ?? classroom.default_group_id ?? null
    });
});
export default router;
//# sourceMappingURL=schedules.js.map