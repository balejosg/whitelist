import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as push from '../../lib/push.js';
import * as auth from '../../lib/auth.js';

export const pushRouter = router({
    getVapidKey: publicProcedure.query(() => {
        const publicKey = push.getVapidPublicKey();
        if (publicKey === null || publicKey === '') {
            throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message: 'Push notifications not configured'
            });
        }
        return { publicKey, enabled: true };
    }),

    getStatus: protectedProcedure.query(({ ctx }) => {
        const enabled = push.isPushEnabled();
        const subscriptions = push.getSubscriptionsForUser(ctx.user.sub);

        return {
            pushEnabled: enabled,
            subscriptionCount: subscriptions.length,
            subscriptions: subscriptions.map(s => ({
                id: s.id,
                groupIds: s.groupIds,
                createdAt: s.createdAt,
                userAgent: s.userAgent,
            })),
        };
    }),

    subscribe: protectedProcedure
        .input(z.object({
            subscription: z.object({
                endpoint: z.string().min(1),
                keys: z.object({
                    p256dh: z.string().min(1),
                    auth: z.string().min(1),
                }),
                expirationTime: z.number().nullable().optional(),
            }),
            groupIds: z.array(z.string()).optional(),
        }))
        .mutation(({ input, ctx }) => {
            let targetGroups = input.groupIds;

            if (targetGroups === undefined || targetGroups.length === 0) {
                const userGroups = auth.getApprovalGroups(ctx.user);
                if (userGroups === 'all') {
                    targetGroups = ['*'];
                } else if (userGroups.length > 0) {
                    targetGroups = userGroups;
                } else {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No groups to subscribe to' });
                }
            }

            try {
                const userAgent = ctx.req.headers['user-agent'] ?? '';
                const record = push.saveSubscription(
                    ctx.user.sub,
                    targetGroups,
                    input.subscription as push.PushSubscription,
                    userAgent
                );

                return {
                    success: true,
                    subscriptionId: record.id,
                    groupIds: record.groupIds,
                };
            } catch (error) {
                console.error('Error saving subscription:', error);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save subscription' });
            }
        }),

    unsubscribe: protectedProcedure
        .input(z.object({
            endpoint: z.string().optional(),
            subscriptionId: z.string().optional(),
        }))
        .mutation(({ input }) => {
            if ((input.endpoint === undefined || input.endpoint === '') && (input.subscriptionId === undefined || input.subscriptionId === '')) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Either endpoint or subscriptionId required' });
            }

            let deleted = false;
            if (input.endpoint !== undefined && input.endpoint !== '') {
                deleted = push.deleteSubscriptionByEndpoint(input.endpoint);
            } else if (input.subscriptionId !== undefined && input.subscriptionId !== '') {
                deleted = push.deleteSubscriptionById(input.subscriptionId);
            }

            if (!deleted) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
            }

            return { success: true };
        }),
});
