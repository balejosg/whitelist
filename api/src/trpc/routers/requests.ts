import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, teacherProcedure, adminProcedure } from '../trpc.js';
import {
    RequestStatusSchema,
    CreateRequestDTOSchema,
} from '../../types/index.js';
import { TRPCError } from '@trpc/server';
import { CreateRequestData } from '../../types/storage.js';
import * as storage from '../../lib/storage.js';
import * as github from '../../lib/github.js';
import * as push from '../../lib/push.js';
import * as auth from '../../lib/auth.js';
import { stripUndefined } from '../../lib/utils.js';
import logger from '../../lib/logger.js';

export const requestsRouter = router({
    /**
     * Create a new domain access request.
     * Public endpoint, requires valid email.
     *
     * @param input.domain - Domain to request
     * @param input.reason - Reason for request
     * @param input.requesterEmail - Email of requester
     * @param input.groupId - Target group ID
     */
    create: publicProcedure
        .input(CreateRequestDTOSchema)
        .mutation(async ({ input }) => {
            if (await storage.hasPendingRequest(input.domain)) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Pending request exists' });
            }

            const createData = stripUndefined({
                domain: input.domain.toLowerCase(),
                reason: input.reason ?? 'No reason provided',
                requesterEmail: input.requesterEmail,
                groupId: input.groupId,
                priority: input.priority,
            }) as CreateRequestData;

            const request = await storage.createRequest(createData);
            // Notify teachers asynchronously (non-blocking)
            push.notifyTeachersOfNewRequest(request).catch((error: unknown) => {
                logger.error('Failed to notify teachers of new request', {
                    requestId: request.id,
                    domain: request.domain,
                    error: error instanceof Error ? error.message : String(error)
                });
            });
            return request;
        }),

    /**
     * Get request status by ID.
     * Public endpoint for polling status.
     *
     * @param input.id - Request ID
     */
    getStatus: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const request = await storage.getRequestById(input.id);
            if (!request) throw new TRPCError({ code: 'NOT_FOUND' });
            return { id: request.id, domain: request.domain, status: request.status };
        }),

    /**
     * List all requests.
     * Protected endpoint.
     * Teachers see only requests for their assigned groups.
     * Admins see all requests.
     *
     * @param input.status - Filter by status (pending, approved, rejected)
     */
    list: protectedProcedure
        .input(z.object({ status: RequestStatusSchema.optional() }))
        .query(async ({ input, ctx }) => {
            let requests = await storage.getAllRequests(input.status ?? null);
            const groups = auth.getApprovalGroups(ctx.user);
            if (groups !== 'all') {
                requests = requests.filter(r => groups.includes(r.groupId));
            }
            return requests;
        }),

    /**
     * Get full request details by ID.
     * Protected endpoint. Enforces group access control.
     *
     * @param input.id - Request ID
     */
    get: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const request = await storage.getRequestById(input.id);
            if (!request) throw new TRPCError({ code: 'NOT_FOUND' });

            const groups = auth.getApprovalGroups(ctx.user);
            if (groups !== 'all' && !groups.includes(request.groupId)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this request' });
            }

            return request;
        }),

    /**
     * Approve a request.
     * Teacher/Admin endpoint.
     * Adds domain to whitelist via GitHub API.
     *
     * @param input.id - Request ID
     * @param input.groupId - Optional group ID override
     */
    approve: teacherProcedure
        .input(z.object({ id: z.string(), groupId: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const request = await storage.getRequestById(input.id);
            if (!request) throw new TRPCError({ code: 'NOT_FOUND' });
            if (request.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: `Already ${request.status}` });
            }

            const targetGroup = input.groupId ?? request.groupId;
            if (!auth.canApproveGroup(ctx.user, targetGroup)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot approve for this group' });
            }

            // Check blocked domains for non-admins
            if (!auth.isAdminToken(ctx.user)) {
                const blocked = await github.isDomainBlocked(request.domain);
                if (blocked.blocked) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Domain is blocked' });
                }
            }

            await github.addDomainToWhitelist(request.domain, targetGroup);
            return await storage.updateRequestStatus(request.id, 'approved', ctx.user.name ?? ctx.user.email, `Added to ${targetGroup}`);
        }),

    // Teacher+: Reject
    reject: teacherProcedure
        .input(z.object({ id: z.string(), reason: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            const request = await storage.getRequestById(input.id);
            if (!request) throw new TRPCError({ code: 'NOT_FOUND' });
            if (request.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: `Already ${request.status}` });
            }
            return await storage.updateRequestStatus(request.id, 'rejected', ctx.user.name ?? ctx.user.email, input.reason);
        }),

    // Admin: Delete
    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            if (!(await storage.deleteRequest(input.id))) throw new TRPCError({ code: 'NOT_FOUND' });
            return { success: true };
        }),

    // Protected: List groups
    listGroups: protectedProcedure.query(async ({ ctx }) => {
        const allGroups = await github.listWhitelistFiles();
        const userGroups = auth.getApprovalGroups(ctx.user);
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
            // File not found is expected (no blocked domains configured)
            // Log other errors for debugging
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('Not Found')) {
                logger.warn('Failed to fetch blocked subdomains', { error: message });
            }
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
