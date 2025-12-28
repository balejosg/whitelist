import { z } from 'zod';
import { router, adminProcedure, sharedSecretProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateClassroomData, UpdateClassroomData } from '../../types/storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import { stripUndefined } from '../../lib/utils.js';

export const classroomsRouter = router({
    list: adminProcedure.query(async () => {
        return await classroomStorage.getAllClassrooms();
    }),

    get: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const classroom = await classroomStorage.getClassroomById(input.id);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND' });

            const machines = await classroomStorage.getMachinesByClassroom(input.id);
            const currentGroupId = await classroomStorage.getCurrentGroupId(input.id);

            return {
                ...classroom,
                current_group_id: currentGroupId,
                machines,
                machine_count: machines.length,
            };
        }),

    create: adminProcedure
        .input(z.object({
            name: z.string().min(1),
            display_name: z.string().optional(),
            default_group_id: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            try {
                const createData = stripUndefined({
                    name: input.name,
                    displayName: input.display_name,
                    defaultGroupId: input.default_group_id,
                });
                return await classroomStorage.createClassroom(createData as CreateClassroomData & { defaultGroupId?: string });
            } catch (error) {
                if (error instanceof Error && error.message.includes('already exists')) {
                    throw new TRPCError({ code: 'CONFLICT', message: error.message });
                }
                throw error;
            }
        }),

    update: adminProcedure
        .input(z.object({
            id: z.string(),
            display_name: z.string().optional(),
            default_group_id: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const updateData = stripUndefined({
                displayName: input.display_name,
                defaultGroupId: input.default_group_id,
            });
            const updated = await classroomStorage.updateClassroom(input.id, updateData as UpdateClassroomData & { defaultGroupId?: string });
            if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
            return updated;
        }),

    setActiveGroup: adminProcedure
        .input(z.object({
            id: z.string(),
            group_id: z.string().nullable(),
        }))
        .mutation(async ({ input }) => {
            const updated = await classroomStorage.setActiveGroup(input.id, input.group_id);
            if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });

            const currentGroupId = await classroomStorage.getCurrentGroupId(input.id);
            return {
                classroom: updated,
                current_group_id: currentGroupId,
            };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            if (!(await classroomStorage.deleteClassroom(input.id))) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }
            return { success: true };
        }),

    stats: adminProcedure.query(async () => {
        return await classroomStorage.getStats();
    }),

    // Shared Secret endpoints
    registerMachine: sharedSecretProcedure
        .input(z.object({
            hostname: z.string().min(1),
            classroom_id: z.string().optional(),
            classroom_name: z.string().optional(),
            version: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            let classroomId = input.classroom_id;

            if ((classroomId === undefined || classroomId === '') && (input.classroom_name !== undefined && input.classroom_name !== '')) {
                const classroom = await classroomStorage.getClassroomByName(input.classroom_name);
                if (classroom) classroomId = classroom.id;
            }

            if (classroomId === undefined || classroomId === '') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valid classroom_id or classroom_name is required' });
            }

            const classroom = await classroomStorage.getClassroomById(classroomId);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

            const machine = await classroomStorage.registerMachine(stripUndefined({
                hostname: input.hostname,
                classroomId,
                version: input.version,
            }) as { hostname: string; classroomId: string; version?: string });

            return {
                machine,
                classroom: {
                    id: classroom.id,
                    name: classroom.name,
                    display_name: classroom.display_name,
                }
            };
        }),

    getWhitelistUrl: sharedSecretProcedure
        .input(z.object({ hostname: z.string() }))
        .query(async ({ input }) => {
            await classroomStorage.updateMachineLastSeen(input.hostname);
            const result = await classroomStorage.getWhitelistUrlForMachine(input.hostname);

            if (!result) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Machine not found or no group configured' });
            }
            return result;
        }),

    deleteMachine: adminProcedure
        .input(z.object({ hostname: z.string() }))
        .mutation(async ({ input }) => {
            if (!(await classroomStorage.deleteMachine(input.hostname))) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }
            return { success: true };
        }),
});
