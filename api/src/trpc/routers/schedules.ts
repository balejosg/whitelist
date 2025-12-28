import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as scheduleStorage from '../../lib/schedule-storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import * as auth from '../../lib/auth.js';
import { stripUndefined } from '../../lib/utils.js';

export const schedulesRouter = router({
    getByClassroom: protectedProcedure
        .input(z.object({ classroomId: z.string() }))
        .query(async ({ input, ctx }) => {
            const classroom = await classroomStorage.getClassroomById(input.classroomId);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

            const schedules = await scheduleStorage.getSchedulesByClassroom(input.classroomId);
            const userId = ctx.user.sub;
            const isAdmin = auth.isAdminToken(ctx.user);

            return {
                classroom: {
                    id: classroom.id,
                    name: classroom.name,
                    display_name: classroom.display_name
                },
                schedules: schedules.map(s => ({
                    ...s,
                    is_mine: s.teacher_id === userId,
                    can_edit: s.teacher_id === userId || isAdmin,
                })),
            };
        }),

    getMine: protectedProcedure.query(async ({ ctx }) => {
        return await scheduleStorage.getSchedulesByTeacher(ctx.user.sub);
    }),

    create: protectedProcedure
        .input(z.object({
            classroom_id: z.string(),
            group_id: z.string(),
            day_of_week: z.number().min(0).max(6), // 0-6
            start_time: z.string().regex(/^\d{2}:\d{2}$/),
            end_time: z.string().regex(/^\d{2}:\d{2}$/),
        }))
        .mutation(async ({ input, ctx }) => {
            const classroom = await classroomStorage.getClassroomById(input.classroom_id);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

            const isAdmin = auth.isAdminToken(ctx.user);
            if (!isAdmin && !auth.canApproveGroup(ctx.user, input.group_id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only create schedules for your assigned groups' });
            }

            try {
                const schedule = await scheduleStorage.createSchedule({
                    classroom_id: input.classroom_id,
                    teacher_id: ctx.user.sub,
                    group_id: input.group_id,
                    day_of_week: input.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                    start_time: input.start_time,
                    end_time: input.end_time,
                });
                return schedule;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message === 'Schedule conflict') {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'This time slot is already reserved',
                        cause: (error as { conflict?: unknown }).conflict
                    });
                }
                throw new TRPCError({ code: 'BAD_REQUEST', message });
            }
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            day_of_week: z.number().min(0).max(6).optional(),
            start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            group_id: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const schedule = await scheduleStorage.getScheduleById(input.id);
            if (!schedule) throw new TRPCError({ code: 'NOT_FOUND' });

            const isAdmin = auth.isAdminToken(ctx.user);
            const isOwner = schedule.teacher_id === ctx.user.sub;

            if (!isOwner && !isAdmin) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own schedules' });
            }

            if (input.group_id !== undefined && input.group_id !== '' && input.group_id !== schedule.group_id) {
                if (!isAdmin && !auth.canApproveGroup(ctx.user, input.group_id)) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only use your assigned groups' });
                }
            }

            try {
                const updateData = stripUndefined({
                    day_of_week: input.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined,
                    start_time: input.start_time,
                    end_time: input.end_time,
                    group_id: input.group_id,
                });

                const updated = await scheduleStorage.updateSchedule(input.id, updateData);
                if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
                return updated;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message === 'Schedule conflict') {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'This time slot is already reserved',
                        cause: (error as { conflict?: unknown }).conflict
                    });
                }
                throw new TRPCError({ code: 'BAD_REQUEST', message });
            }
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const schedule = await scheduleStorage.getScheduleById(input.id);
            if (!schedule) throw new TRPCError({ code: 'NOT_FOUND' });

            const isAdmin = auth.isAdminToken(ctx.user);
            const isOwner = schedule.teacher_id === ctx.user.sub;

            if (!isOwner && !isAdmin) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own schedules' });
            }

            await scheduleStorage.deleteSchedule(input.id);
            return { success: true };
        }),

    getCurrentForClassroom: protectedProcedure
        .input(z.object({ classroomId: z.string() }))
        .query(async ({ input }) => {
            const classroom = await classroomStorage.getClassroomById(input.classroomId);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

            const currentSchedule = await scheduleStorage.getCurrentSchedule(input.classroomId);

            return {
                classroom_id: input.classroomId,
                current_schedule: currentSchedule,
                active_group_id: currentSchedule?.group_id ?? classroom.default_group_id ?? null,
            };
        }),
});
