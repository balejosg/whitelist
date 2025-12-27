import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../api/src/trpc/routers/index.js';

function getApiUrl(): string {
    return localStorage.getItem('requests_api_url') ?? '';
}

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${getApiUrl()}/trpc`,
            headers: getAuthHeaders,
        }),
    ],
});
