import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import {
    LoginDTOSchema,
    CreateUserDTOSchema,
} from '../../types/index.js';
import { AuthService } from '../../services/index.js';

export const authRouter = router({
    /**
     * Register a new user.
     * Public endpoint.
     */
    register: publicProcedure
        .input(CreateUserDTOSchema)
        .mutation(async ({ input }) => {
            const result = await AuthService.register(input);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Log in user and return JWT tokens.
     * Public endpoint.
     */
    login: publicProcedure
        .input(LoginDTOSchema)
        .mutation(async ({ input }) => {
            const result = await AuthService.login(input.email, input.password);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Refresh access token using refresh token.
     */
    refresh: publicProcedure
        .input(z.object({ refreshToken: z.string() }))
        .mutation(async ({ input }) => {
            const result = await AuthService.refresh(input.refreshToken);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Logout user.
     */
    logout: protectedProcedure
        .input(z.object({ refreshToken: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const accessToken = ctx.req.headers.authorization?.slice(7);
            const result = await AuthService.logout(accessToken, input.refreshToken);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Get current user profile.
     */
    me: protectedProcedure.query(async ({ ctx }) => {
        const result = await AuthService.getProfile(ctx.user.sub);
        if (!result.ok) {
            throw new TRPCError({ code: result.error.code, message: result.error.message });
        }
        return result.data;
    }),
});
