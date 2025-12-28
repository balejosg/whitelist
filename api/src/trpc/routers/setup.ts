import { z } from 'zod';
import { router, publicProcedure, adminProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as roleStorage from '../../lib/role-storage.js';
import * as userStorage from '../../lib/user-storage.js';
import * as setupStorage from '../../lib/setup-storage.js';

export const setupRouter = router({
    status: publicProcedure.query(async () => {
        const hasAdmins = await roleStorage.hasAnyAdmins();
        return {
            needsSetup: !hasAdmins,
            hasAdmin: hasAdmins,
        };
    }),

    createFirstAdmin: publicProcedure
        .input(z.object({
            email: z.string().email(),
            name: z.string().min(1),
            password: z.string().min(8),
        }))
        .mutation(async ({ input }) => {
            if (await roleStorage.hasAnyAdmins()) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Setup already completed' });
            }

            if (await userStorage.emailExists(input.email)) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
            }

            const user = await userStorage.createUser(input);

            await roleStorage.assignRole({
                userId: user.id,
                role: 'admin',
                groups: [],
                createdBy: user.id,
            });

            const registrationToken = await setupStorage.generateRegistrationToken();
            await setupStorage.saveSetupData({
                registrationToken,
                setupCompletedAt: new Date().toISOString(),
                setupByUserId: user.id,
            });

            return {
                success: true,
                registrationToken,
                user: { id: user.id, email: user.email, name: user.name },
            };
        }),

    validateToken: publicProcedure
        .input(z.object({ token: z.string() }))
        .mutation(async ({ input }) => {
            return { valid: await setupStorage.validateRegistrationToken(input.token) };
        }),

    getRegistrationToken: adminProcedure.query(async () => {
        const token = await setupStorage.getRegistrationToken();
        if (token === null || token === '') throw new TRPCError({ code: 'NOT_FOUND', message: 'Setup not completed' });
        return { registrationToken: token };
    }),

    regenerateToken: adminProcedure.mutation(async () => {
        const newToken = await setupStorage.regenerateRegistrationToken();
        if (newToken === null || newToken === '') throw new TRPCError({ code: 'NOT_FOUND', message: 'Setup not completed' });
        return { registrationToken: newToken };
    }),
});
