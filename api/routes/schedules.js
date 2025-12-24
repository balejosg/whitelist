/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

/**
 * Schedules API Routes
 * Manages classroom schedule reservations
 */

const express = require('express');
const router = express.Router();
const scheduleStorage = require('../lib/schedule-storage');
const classroomStorage = require('../lib/classroom-storage');
const auth = require('../lib/auth');

// =============================================================================
// Middleware
// =============================================================================

// Authenticate user (requires valid JWT)
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const token = authHeader.substring(7);

    auth.verifyAccessToken(token)
        .then(decoded => {
            if (!decoded) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired token'
                });
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

// Require admin role
function requireAdmin(req, res, next) {
    if (!auth.isAdminToken(req.user)) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
    next();
}

// Check if user can manage this schedule (owner or admin)
function canManageSchedule(req, res, next) {
    const schedule = scheduleStorage.getScheduleById(req.params.id);

    if (!schedule) {
        return res.status(404).json({
            success: false,
            error: 'Schedule not found'
        });
    }

    const isOwner = schedule.teacher_id === req.user.sub;
    const isAdmin = auth.isAdminToken(req.user);

    if (!isOwner && !isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'You can only manage your own schedules'
        });
    }

    req.schedule = schedule;
    next();
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/schedules/classroom/:classroomId
 * Get all schedules for a classroom (for displaying the grid)
 */
router.get('/classroom/:classroomId', requireAuth, (req, res) => {
    const { classroomId } = req.params;

    // Verify classroom exists
    const classroom = classroomStorage.getClassroomById(classroomId);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    const schedules = scheduleStorage.getSchedulesByClassroom(classroomId);

    // For teachers, mark which schedules are theirs
    const userId = req.user.sub;
    const isAdmin = auth.isAdminToken(req.user);

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
 * Get all schedules for the current user (teacher's own reservations)
 */
router.get('/my', requireAuth, (req, res) => {
    const schedules = scheduleStorage.getSchedulesByTeacher(req.user.sub);

    res.json({
        success: true,
        schedules
    });
});

/**
 * POST /api/schedules
 * Create a new schedule (reservation)
 * Teachers can only create schedules for their assigned groups
 */
router.post('/', requireAuth, (req, res) => {
    const { classroom_id, group_id, day_of_week, start_time, end_time } = req.body;

    // Validate classroom exists
    const classroom = classroomStorage.getClassroomById(classroom_id);
    if (!classroom) {
        return res.status(404).json({
            success: false,
            error: 'Classroom not found'
        });
    }

    // Check if user can create schedule for this group
    const isAdmin = auth.isAdminToken(req.user);
    if (!isAdmin && !auth.canApproveGroup(req.user, group_id)) {
        return res.status(403).json({
            success: false,
            error: 'You can only create schedules for your assigned groups'
        });
    }

    try {
        const schedule = scheduleStorage.createSchedule({
            classroom_id,
            teacher_id: req.user.sub,
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
        if (error.message === 'Schedule conflict') {
            return res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: {
                    id: error.conflict.id,
                    day_of_week: error.conflict.day_of_week,
                    start_time: error.conflict.start_time,
                    end_time: error.conflict.end_time
                }
            });
        }

        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule (only owner or admin)
 */
router.put('/:id', requireAuth, canManageSchedule, (req, res) => {
    const { day_of_week, start_time, end_time, group_id } = req.body;

    // If changing group, verify permission
    if (group_id && group_id !== req.schedule.group_id) {
        const isAdmin = auth.isAdminToken(req.user);
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
    } catch (error) {
        if (error.message === 'Schedule conflict') {
            return res.status(409).json({
                success: false,
                error: 'This time slot is already reserved',
                conflict: error.conflict
            });
        }

        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule (only owner or admin)
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
 * Get the currently active schedule for a classroom
 */
router.get('/classroom/:classroomId/current', requireAuth, (req, res) => {
    const { classroomId } = req.params;

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
        active_group_id: currentSchedule?.group_id || classroom.default_group_id || null
    });
});

module.exports = router;
