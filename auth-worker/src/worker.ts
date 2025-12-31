/**
 * Cloudflare Worker - GitHub OAuth Proxy
 * Handles OAuth flow for whitelist SPA
 */

import { getCookie, serializeCookie, corsHeaders, redirectToFrontend } from './utils.js';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    FRONTEND_URL: string;
    WORKER_URL: string;
}

interface GitHubTokenResponse {
    access_token?: string;
    token_type?: string;
    error?: string;
}

/**
 * Redirect user to GitHub authorization page
 */
function handleLogin(env: Env): Response {
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${env.WORKER_URL}/auth/callback`,
        scope: 'repo read:user',
        state
    });

    const setCookie = serializeCookie('openpath_oauth_state', state, {
        path: '/auth',
        maxAge: 10 * 60,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
    });

    return new Response(null, {
        status: 302,
        headers: {
            Location: `${GITHUB_AUTHORIZE_URL}?${params.toString()}`,
            'Set-Cookie': setCookie
        }
    });
}

/**
 * Handle OAuth callback from GitHub
 * Exchange code for access token and redirect to frontend
 */
async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    const returnedState = url.searchParams.get('state');
    const expectedState = getCookie(request, 'openpath_oauth_state');
    const clearStateCookie = serializeCookie('openpath_oauth_state', '', {
        path: '/auth',
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
    });

    if (error) {
        return redirectToFrontend(env.FRONTEND_URL, { error }, { 'Set-Cookie': clearStateCookie });
    }

    if (!code) {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'no_code' }, { 'Set-Cookie': clearStateCookie });
    }

    if (!returnedState || !expectedState || returnedState !== expectedState) {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'invalid_state' }, { 'Set-Cookie': clearStateCookie });
    }

    try {
        // Exchange code for access token
        const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                code: code
            })
        });

        const tokenData: GitHubTokenResponse = await tokenResponse.json();

        if (tokenData.error) {
            return redirectToFrontend(env.FRONTEND_URL, { error: tokenData.error }, { 'Set-Cookie': clearStateCookie });
        }

        // Redirect to frontend with token
        if (tokenData.access_token && tokenData.token_type) {
            return redirectToFrontend(env.FRONTEND_URL, {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type
            }, { 'Set-Cookie': clearStateCookie });
        }

        return redirectToFrontend(env.FRONTEND_URL, { error: 'invalid_token_response' }, { 'Set-Cookie': clearStateCookie });

    } catch {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'token_exchange_failed' }, { 'Set-Cookie': clearStateCookie });
    }
}

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // CORS headers for preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders(env.FRONTEND_URL)
            });
        }

        try {
            if (url.pathname === '/auth/login') {
                return handleLogin(env);
            }

            if (url.pathname === '/auth/callback') {
                return await handleCallback(request, url, env);
            }

            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not Found', { status: 404 });
        } catch (error) {
            console.error('Worker error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return new Response(JSON.stringify({ error: errorMessage }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
