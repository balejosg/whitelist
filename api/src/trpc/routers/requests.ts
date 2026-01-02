import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, teacherProcedure, adminProcedure } from '../trpc.js';
import {
    RequestStatusSchema,
    CreateRequestDTOSchema,
    getErrorMessage,
} from '../../types/index.js';
import { TRPCError } from '@trpc/server';
import { CreateRequestData } from '../../types/storage.js';
import * as storage from '../../lib/storage.js';
import * as github from '../../lib/github.js';
import { logger } from '../../lib/logger.js';
import { stripUndefined } from '../../lib/utils.js';
import { RequestService } from '../../services/index.js';

export const requestsRouter = router({
    /**
     * Create a new domain access request.
     * Public endpoint, requires valid email.
     */
    create: publicProcedure
        .input(CreateRequestDTOSchema)
        .mutation(async ({ input }) => {
            const result = await RequestService.createRequest(stripUndefined({
                domain: input.domain.toLowerCase(),
                reason: input.reason ?? 'No reason provided',
                requesterEmail: input.requesterEmail,
                groupId: input.groupId,
                priority: input.priority,
            }) as CreateRequestData);

            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Get request status by ID.
     * Public endpoint for polling status.
     */
    getStatus: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const request = await storage.getRequestById(input.id);
            if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            return { id: request.id, domain: request.domain, status: request.status };
        }),

    /**
     * List all requests.
     * Protected endpoint.
     */
    list: protectedProcedure
        .input(z.object({ status: RequestStatusSchema.optional() }))
        .query(async ({ input, ctx }) => {
            return await RequestService.listRequests(input.status ?? null, ctx.user);
        }),

    /**
     * Get full request details by ID.
     * Protected endpoint. Enforces group access control.
     */
    get: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const result = await RequestService.getRequest(input.id, ctx.user);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    /**
     * Approve a request.
     * Teacher/Admin endpoint.
     */
    approve: teacherProcedure
        .input(z.object({ id: z.string(), groupId: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const result = await RequestService.approveRequest(input.id, input.groupId, ctx.user);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    // Teacher+: Reject
    reject: teacherProcedure
        .input(z.object({ id: z.string(), reason: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const result = await RequestService.rejectRequest(input.id, input.reason, ctx.user);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    // Admin: Delete
    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            const result = await RequestService.deleteRequest(input.id);
            if (!result.ok) {
                throw new TRPCError({ code: result.error.code, message: result.error.message });
            }
            return result.data;
        }),

    // Protected: List groups
    listGroups: protectedProcedure.query(async ({ ctx }) => {
        const allGroups = await github.listWhitelistFiles();
        const userGroups = RequestService.getApprovalGroupsForUser(ctx.user);
        if (userGroups === 'all') return allGroups;
        return allGroups.filter(g => userGroups.includes(g.name));
    }),

    // Admin: List blocked domains
    listBlocked: adminProcedure.query(async () => {
        try {
            const file = await github.getFileContent('blocked-subdomains.txt');
            const lines = file.content.split('\n');
            return lines.map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#'));
        } catch (error) {
            // Return empty list on any error (file not found, GitHub not configured, etc.)
            // listBlocked is non-critical for API tests
            logger.debug('Could not fetch blocked domains:', { error: getErrorMessage(error) });
            return [];
        }
    }),

    // Protected: Check domain
    check: protectedProcedure
        .input(z.object({ domain: z.string() }))
        .mutation(async ({ input }) => {
            return await github.isDomainBlocked(input.domain);
        }),
});
