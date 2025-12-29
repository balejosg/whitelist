import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { UserRole } from '@openpath/shared';
import { TRPCError } from '@trpc/server';
import * as userStorage from '../../lib/user-storage.js';
import * as roleStorage from '../../lib/role-storage.js';

export const usersRouter = router({
    list: adminProcedure.query(async () => {
        const users = await userStorage.getAllUsers();
        return Promise.all(users.map(async (u) => {
            const roles = await roleStorage.getUserRoles(u.id);
            return { ...u, roles };
        }));
    }),

    get: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const user = await userStorage.getUserById(input.id);
            if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
            return { ...user, roles: await roleStorage.getUserRoles(user.id) };
        }),

    create: adminProcedure
        .input(z.object({
            email: z.string().email(),
            name: z.string(),
            password: z.string().min(8),
            role: UserRole.optional(),
            groupIds: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (await userStorage.emailExists(input.email)) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email exists' });
            }
            const user = await userStorage.createUser(input);
            if (input.role) {
                await roleStorage.assignRole({
                    userId: user.id,
                    role: input.role,
                    groupIds: input.groupIds ?? [],
                    createdBy: ctx.user.sub,
                });
            }
            return { ...user, roles: await roleStorage.getUserRoles(user.id) };
        }),

    update: adminProcedure
        .input(z.object({
            id: z.string(),
            name: z.string().optional(),
            email: z.string().email().optional(),
            active: z.boolean().optional(),
            password: z.string().min(8).optional(),
        }))
        .mutation(async ({ input }) => {
            const { id, ...updates } = input;
            const updated = await userStorage.updateUser(id, updates);
            if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
            return { ...updated, roles: await roleStorage.getUserRoles(id) };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (ctx.user.sub === input.id) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete yourself' });
            }
            await roleStorage.revokeAllUserRoles(input.id, ctx.user.sub);
            await userStorage.deleteUser(input.id);
            return { success: true };
        }),

    // Role management
    assignRole: adminProcedure
        .input(z.object({
            userId: z.string(),
            role: UserRole,
            groupIds: z.array(z.string()).default([]),
        }))
        .mutation(async ({ input, ctx }) => {
            return await roleStorage.assignRole({
                userId: input.userId,
                role: input.role,
                groupIds: input.groupIds,
                createdBy: ctx.user.sub,
            });
        }),

    revokeRole: adminProcedure
        .input(z.object({ userId: z.string(), roleId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            await roleStorage.revokeRole(input.roleId, ctx.user.sub);
            return { success: true };
        }),

    listTeachers: adminProcedure.query(async () => await roleStorage.getAllTeachers()),
});
