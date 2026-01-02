import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateScheduleDTOSchema, getErrorMessage } from '../../types/index.js';
import * as scheduleStorage from '../../lib/schedule-storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import * as auth from '../../lib/auth.js';
import { stripUndefined } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';

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
                    displayName: classroom.displayName
                },
                schedules: schedules.map(s => ({
                    ...s,
                    isMine: s.teacherId === userId,
                    canEdit: s.teacherId === userId || isAdmin,
                })),
            };
        }),

    getMine: protectedProcedure.query(async ({ ctx }) => {
        return await scheduleStorage.getSchedulesByTeacher(ctx.user.sub);
    }),

    create: protectedProcedure
        .input(CreateScheduleDTOSchema.omit({ teacherId: true }))
        .mutation(async ({ input, ctx }) => {
            const classroom = await classroomStorage.getClassroomById(input.classroomId);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

            const isAdmin = auth.isAdminToken(ctx.user);
            if (!isAdmin && !auth.canApproveGroup(ctx.user, input.groupId)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only create schedules for your assigned groups' });
            }

            try {
                const schedule = await scheduleStorage.createSchedule({
                    classroomId: input.classroomId,
                    teacherId: ctx.user.sub,
                    groupId: input.groupId,
                    dayOfWeek: input.dayOfWeek,
                    startTime: input.startTime,
                    endTime: input.endTime,
                });
                return schedule;
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                logger.error('schedules.create error', { error: message, input });
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
            dayOfWeek: z.number().min(0).max(6).optional(),
            startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            groupId: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const schedule = await scheduleStorage.getScheduleById(input.id);
            if (!schedule) throw new TRPCError({ code: 'NOT_FOUND' });

            const isAdmin = auth.isAdminToken(ctx.user);
            const isOwner = schedule.teacherId === ctx.user.sub;

            if (!isOwner && !isAdmin) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own schedules' });
            }

            if (input.groupId !== undefined && input.groupId !== '' && input.groupId !== schedule.groupId) {
                if (!isAdmin && !auth.canApproveGroup(ctx.user, input.groupId)) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only use your assigned groups' });
                }
            }

            try {
                const updateData = stripUndefined({
                    dayOfWeek: input.dayOfWeek,
                    startTime: input.startTime,
                    endTime: input.endTime,
                    groupId: input.groupId,
                });

                const updated = await scheduleStorage.updateSchedule(input.id, updateData);
                if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
                return updated;
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                logger.error('schedules.update error', { error: message, id: input.id });
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
            const isOwner = schedule.teacherId === ctx.user.sub;

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
                classroomId: input.classroomId,
                currentSchedule,
                activeGroupId: currentSchedule?.groupId ?? classroom.defaultGroupId ?? null,
            };
        }),
});
