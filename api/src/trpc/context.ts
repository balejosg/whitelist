import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import * as auth from '../lib/auth.js';
import type { DecodedWithRoles } from '../lib/auth.js';

export interface Context {
    user: DecodedWithRoles | null;
    req: CreateExpressContextOptions['req'];
    res: CreateExpressContextOptions['res'];
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
    const authHeader = req.headers.authorization;
    let user: DecodedWithRoles | null = null;

    if (authHeader?.startsWith('Bearer ') === true) {
        const token = authHeader.slice(7);
        user = await auth.verifyAccessToken(token);

        // Fallback to legacy admin token
        if (!user && process.env.ADMIN_TOKEN === token) {
            user = auth.createLegacyAdminPayload();
        }
    }

    return { user, req, res };
}
