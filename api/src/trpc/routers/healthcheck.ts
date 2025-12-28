import { router, publicProcedure } from '../trpc.js';
import { getStats } from '../../lib/user-storage.js';

export const healthcheckRouter = router({
    live: publicProcedure.query(() => {
        return { status: 'alive', timestamp: new Date().toISOString() };
    }),

    ready: publicProcedure.query(async () => {
        const startTime = Date.now();
        const checks: Record<string, { status: string; totalRequests?: number; error?: string }> = {};
        let status = 'ok';

        // Storage check
        try {
            const stats = await getStats();
            checks.storage = { status: 'ok', totalRequests: stats.total };
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            checks.storage = { status: 'error', error: message };
            status = 'degraded';
        }

        // Config checks
        const githubConfigured = (process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN !== '') &&
            (process.env.GITHUB_OWNER !== undefined && process.env.GITHUB_OWNER !== '') &&
            (process.env.GITHUB_REPO !== undefined && process.env.GITHUB_REPO !== '');
        checks.github = { status: githubConfigured ? 'configured' : 'not_configured' };

        const authConfigured = (process.env.ADMIN_TOKEN !== undefined && process.env.ADMIN_TOKEN !== '') ||
            (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '');
        checks.auth = { status: authConfigured ? 'configured' : 'not_configured' };
        if (!authConfigured) status = 'degraded';

        return {
            status,
            service: 'openpath-api',
            uptime: process.uptime(),
            checks,
            responseTime: `${String(Date.now() - startTime)} ms`,
        };
    }),
});
