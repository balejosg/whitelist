import { z } from 'zod';
import { router, adminProcedure, sharedSecretProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateClassroomDTOSchema } from '../../types/index.js';
import { CreateClassroomData, UpdateClassroomData } from '../../types/storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import { stripUndefined } from '../../lib/utils.js';

export const classroomsRouter = router({
    list: adminProcedure.query(async () => {
        const classrooms = await classroomStorage.getAllClassrooms();
        return Promise.all(classrooms.map(async (c) => {
            const rawMachines = await classroomStorage.getMachinesByClassroom(c.id);
            const machines = rawMachines.map(m => ({
                hostname: m.hostname,
                lastSeen: m.lastSeen?.toISOString() ?? null,
                status: 'unknown' as const
            }));
            const currentGroupId = await classroomStorage.getCurrentGroupId(c.id);
            return {
                ...c,
                currentGroupId,
                machines,
                machineCount: machines.length,
            };
        }));
    }),

    get: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const classroom = await classroomStorage.getClassroomById(input.id);
            if (!classroom) throw new TRPCError({ code: 'NOT_FOUND' });

            const rawMachines = await classroomStorage.getMachinesByClassroom(input.id);
            const machines = rawMachines.map(m => ({
                hostname: m.hostname,
                lastSeen: m.lastSeen?.toISOString() ?? null,
                status: 'unknown' as const
            }));
            const currentGroupId = await classroomStorage.getCurrentGroupId(input.id);

            return {
                id: classroom.id,
                name: classroom.name,
                displayName: classroom.displayName,
                defaultGroupId: classroom.defaultGroupId,
                activeGroupId: classroom.activeGroupId,
                createdAt: classroom.createdAt?.toISOString() ?? new Date().toISOString(),
                updatedAt: classroom.updatedAt?.toISOString() ?? new Date().toISOString(),
                currentGroupId,
                machines,
                machineCount: machines.length,
            };
        }),

    create: adminProcedure
        .input(CreateClassroomDTOSchema.extend({
            defaultGroupId: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            try {
                const createData = stripUndefined({
                    name: input.name,
                    displayName: input.displayName,
                    defaultGroupId: input.defaultGroupId,
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
            displayName: z.string().optional(),
            defaultGroupId: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const updateData = stripUndefined({
                displayName: input.displayName,
                defaultGroupId: input.defaultGroupId,
            });
            const updated = await classroomStorage.updateClassroom(input.id, updateData as UpdateClassroomData & { defaultGroupId?: string });
            if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
            return updated;
        }),

    setActiveGroup: adminProcedure
        .input(z.object({
            id: z.string(),
            groupId: z.string().nullable(),
        }))
        .mutation(async ({ input }) => {
            const updated = await classroomStorage.setActiveGroup(input.id, input.groupId);
            if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });

            const currentGroupId = await classroomStorage.getCurrentGroupId(input.id);
            return {
                classroom: {
                    id: updated.id,
                    name: updated.name,
                    displayName: updated.displayName,
                    defaultGroupId: updated.defaultGroupId,
                    activeGroupId: updated.activeGroupId,
                    createdAt: updated.createdAt?.toISOString() ?? new Date().toISOString(),
                    updatedAt: updated.updatedAt?.toISOString() ?? new Date().toISOString(),
                },
                currentGroupId,
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
            classroomId: z.string().optional(),
            classroomName: z.string().optional(),
            version: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            let classroomId = input.classroomId;

            if ((classroomId === undefined || classroomId === '') && (input.classroomName !== undefined && input.classroomName !== '')) {
                const classroom = await classroomStorage.getClassroomByName(input.classroomName);
                if (classroom) classroomId = classroom.id;
            }

            if (classroomId === undefined || classroomId === '') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valid classroomId or classroomName is required' });
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
                    displayName: classroom.displayName,
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
