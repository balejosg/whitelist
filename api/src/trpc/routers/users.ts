import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { UserRole } from '@openpath/shared';
import { TRPCError } from '@trpc/server';
import * as userStorage from '../../lib/user-storage.js';
import * as roleStorage from '../../lib/role-storage.js';

export const usersRouter = router({
    list: adminProcedure.query(() => {
        const users = userStorage.getAllUsers();
        return users.map(u => ({ ...u, roles: roleStorage.getUserRoles(u.id) }));
    }),

    get: adminProcedure
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
            const user = userStorage.getUserById(input.id);
            if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
            return { ...user, roles: roleStorage.getUserRoles(user.id) };
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
            if (userStorage.emailExists(input.email)) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email exists' });
            }
            const user = await userStorage.createUser(input);
            if (input.role) {
                roleStorage.assignRole({
                    userId: user.id,
                    role: input.role,
                    groups: input.groupIds ?? [],
                    createdBy: ctx.user.sub,
                });
            }
            return { ...user, roles: roleStorage.getUserRoles(user.id) };
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
            return { ...updated, roles: roleStorage.getUserRoles(id) };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
            if (ctx.user.sub === input.id) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete yourself' });
            }
            roleStorage.revokeAllUserRoles(input.id, ctx.user.sub);
            userStorage.deleteUser(input.id);
            return { success: true };
        }),

    // Role management
    assignRole: adminProcedure
        .input(z.object({
            userId: z.string(),
            role: UserRole,
            groupIds: z.array(z.string()).default([]),
        }))
        .mutation(({ input, ctx }) => {
            return roleStorage.assignRole({
                userId: input.userId,
                role: input.role,
                groups: input.groupIds,
                createdBy: ctx.user.sub,
            });
        }),

    revokeRole: adminProcedure
        .input(z.object({ userId: z.string(), roleId: z.string() }))
        .mutation(({ input, ctx }) => {
            roleStorage.revokeRole(input.roleId, ctx.user.sub);
            return { success: true };
        }),

    listTeachers: adminProcedure.query(() => roleStorage.getAllTeachers()),
});
