/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedules API Routes
 * Manages classroom schedule reservations
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as scheduleStorage from '../lib/schedule-storage.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { stripUndefined } from '../lib/utils.js';
import * as auth from '../lib/auth.js';
import type { DecodedWithRoles } from '../lib/auth.js';

// =============================================================================
// Types
// =============================================================================

interface RequestWithUser extends Request {
    user?: DecodedWithRoles;
    schedule?: ReturnType<typeof scheduleStorage.getScheduleById>;
}

interface CreateScheduleBody {
    classroom_id: string;
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
}

interface UpdateScheduleBody {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    group_id?: string;
}

interface ScheduleConflictError extends Error {
    conflict?: {
        id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
    };
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
                error: 'Authentication required'
            });
            return;
        }

        const token = authHeader.substring(7);

        try {
            const decoded = await auth.verifyAccessToken(token);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (decoded === null) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid or expired token'
                });
                return;
            }
            req.user = decoded;
            next();
        } catch {
            res.status(401).json({
                success: false,
                error: 'Token verification failed'
            });
        }
    })().catch(next);
}

function canManageSchedule(req: RequestWithUser, res: Response, next: NextFunction): void {
    const id = req.params.id;
    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Schedule ID is required'
        });
        return;
    }

    const schedule = scheduleStorage.getScheduleById(id);

    if (schedule === null) {
        res.status(404).json({
            success: false,
            error: 'Schedule not found'
        });
        return;
    }

    const isOwner = schedule.teacher_id === req.user?.sub;
    const isAdmin = req.user !== undefined ? auth.isAdminToken(req.user) : false;

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
router.get('/classroom/:classroomId', requireAuth, (req: RequestWithUser, res: Response) => {
    const classroomId = req.params.classroomId;
    if (classroomId === undefined) {
        res.status(400).json({
            success: false,
            error: 'Classroom ID is required'
        });
        return;
    }

    const classroom = classroomStorage.getClassroomById(classroomId);
    if (classroom === null) {
        res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
        return;
    }

    const schedules = scheduleStorage.getSchedulesByClassroom(classroomId);

    const userId = req.user?.sub;
    const isAdmin = req.user !== undefined ? auth.isAdminToken(req.user) : false;

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
router.get('/my', requireAuth, (req: RequestWithUser, res: Response) => {
    if (req.user === undefined) {
        res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
        return;
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
router.post('/', requireAuth, (req: RequestWithUser, res: Response) => {
    const { classroom_id, group_id, day_of_week, start_time, end_time } = req.body as CreateScheduleBody;

    const classroom = classroomStorage.getClassroomById(classroom_id);
    if (classroom === null) {
        res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
        return;
    }

    const isAdmin = req.user !== undefined ? auth.isAdminToken(req.user) : false;
    if (!isAdmin && (req.user === undefined || !auth.canApproveGroup(req.user, group_id))) {
        res.status(403).json({
            success: false,
            error: 'You can only create schedules for your assigned groups'
        });
        return;
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
    } catch (error) {
        const schedError = error as ScheduleConflictError;
        if (schedError.message === 'Schedule conflict') {
            res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: schedError.conflict
            });
            return;
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
router.put('/:id', requireAuth, canManageSchedule, (req: RequestWithUser, res: Response) => {
    const { day_of_week, start_time, end_time, group_id } = req.body as UpdateScheduleBody;
    const id = req.params.id;

    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Schedule ID is required'
        });
        return;
    }

    if (group_id !== undefined && group_id !== '' && req.schedule !== undefined && req.schedule !== null && group_id !== req.schedule.group_id) {
        const isAdmin = req.user !== undefined ? auth.isAdminToken(req.user) : false;
        if (!isAdmin && (req.user === undefined || !auth.canApproveGroup(req.user, group_id))) {
            res.status(403).json({
                success: false,
                error: 'You can only use your assigned groups'
            });
            return;
        }
    }

    try {
        const updated = scheduleStorage.updateSchedule(id, stripUndefined({
            day_of_week,
            start_time,
            end_time,
            group_id
        }) as Parameters<typeof scheduleStorage.updateSchedule>[1]);

        res.json({
            success: true,
            message: 'Schedule updated',
            schedule: updated
        });
    } catch (error) {
        const schedError = error as ScheduleConflictError;
        if (schedError.message === 'Schedule conflict') {
            res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: schedError.conflict
            });
            return;
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
router.delete('/:id', requireAuth, canManageSchedule, (req: Request, res: Response) => {
    const id = req.params.id;
    if (id === undefined) {
        res.status(400).json({
            success: false,
            error: 'Schedule ID is required'
        });
        return;
    }

    scheduleStorage.deleteSchedule(id);

    res.json({
        success: true,
        message: 'Schedule deleted'
    });
});

/**
 * GET /api/schedules/classroom/:classroomId/current
 */
router.get('/classroom/:classroomId/current', requireAuth, (req: Request, res: Response) => {
    const classroomId = req.params.classroomId;
    if (classroomId === undefined) {
        res.status(400).json({
            success: false,
            error: 'Classroom ID is required'
        });
        return;
    }

    const classroom = classroomStorage.getClassroomById(classroomId);
    if (classroom === null) {
        res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
        return;
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
