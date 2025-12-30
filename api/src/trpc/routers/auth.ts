import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as userStorage from '../../lib/user-storage.js';
import * as roleStorage from '../../lib/role-storage.js';
import * as auth from '../../lib/auth.js';
import {
    UserRole,
    LoginDTOSchema,
    CreateUserDTOSchema,
} from '../../types/index.js';

export const authRouter = router({
    register: publicProcedure
        .input(CreateUserDTOSchema)
        .mutation(async ({ input }) => {
            if (await userStorage.emailExists(input.email)) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
            }
            const user = await userStorage.createUser(input);
            return { user: { id: user.id, email: user.email, name: user.name } };
        }),

    login: publicProcedure
        .input(LoginDTOSchema)
        .mutation(async ({ input }) => {
            const user = await userStorage.verifyPasswordByEmail(input.email, input.password);
            if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
            if (!user.isActive) throw new TRPCError({ code: 'FORBIDDEN', message: 'Account inactive' });

            const roles = await roleStorage.getUserRoles(user.id);
            // Map roles to camelCase for frontend
            const mappedRoles = roles.map(r => ({
                id: r.id,
                userId: r.userId,
                role: r.role as UserRole,
                groupIds: r.groupIds ?? [],
                createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                createdBy: r.createdBy,
                revokedAt: null
            }));

            const tokens = auth.generateTokens(user, roles.map(r => ({ role: r.role as 'admin' | 'teacher' | 'student', groupIds: r.groupIds ?? [] })));
            return {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    roles: mappedRoles
                }
            };
        }),

    refresh: publicProcedure
        .input(z.object({ refreshToken: z.string() }))
        .mutation(async ({ input }) => {
            const decoded = await auth.verifyRefreshToken(input.refreshToken);
            if (!decoded) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });

            const user = await userStorage.getUserById(decoded.sub);
            if (user?.isActive !== true) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found' });

            await auth.blacklistToken(input.refreshToken);
            const roles = await roleStorage.getUserRoles(user.id);
            return auth.generateTokens(user, roles.map(r => ({ role: r.role as 'admin' | 'teacher' | 'student', groupIds: r.groupIds ?? [] })));
        }),

    logout: protectedProcedure
        .input(z.object({ refreshToken: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const accessToken = ctx.req.headers.authorization?.slice(7);
            if (accessToken !== undefined && accessToken !== '') await auth.blacklistToken(accessToken);
            if (input.refreshToken !== undefined && input.refreshToken !== '') await auth.blacklistToken(input.refreshToken);
            return { success: true };
        }),

    me: protectedProcedure.query(async ({ ctx }) => {
        const user = await userStorage.getUserById(ctx.user.sub);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        const roles = await roleStorage.getUserRoles(user.id);
        const mappedRoles = roles.map(r => ({
            id: r.id,
            userId: r.userId,
            role: r.role as UserRole,
            groupIds: r.groupIds ?? [],
            createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
            updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
            createdBy: r.createdBy,
            revokedAt: null
        }));
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                roles: mappedRoles
            }
        };
    }),
});
