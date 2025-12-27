/**
 * Cloudflare Worker - GitHub OAuth Proxy
 * Handles OAuth flow for whitelist SPA
 */

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

function corsHeaders(origin: string): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function redirectToFrontend(frontendUrl: string, params: Record<string, string>): Response {
    const url = new URL(frontendUrl);
    url.hash = new URLSearchParams(params).toString();
    return Response.redirect(url.toString(), 302);
}

/**
 * Redirect user to GitHub authorization page
 */
function handleLogin(env: Env): Response {
    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${env.WORKER_URL}/auth/callback`,
        scope: 'repo read:user',
        state: crypto.randomUUID()
    });

    return Response.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`, 302);
}

/**
 * Handle OAuth callback from GitHub
 * Exchange code for access token and redirect to frontend
 */
async function handleCallback(url: URL, env: Env): Promise<Response> {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        return redirectToFrontend(env.FRONTEND_URL, { error });
    }

    if (!code) {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'no_code' });
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
            return redirectToFrontend(env.FRONTEND_URL, { error: tokenData.error });
        }

        // Redirect to frontend with token
        if (tokenData.access_token && tokenData.token_type) {
            return redirectToFrontend(env.FRONTEND_URL, {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type
            });
        }

        return redirectToFrontend(env.FRONTEND_URL, { error: 'invalid_token_response' });

    } catch {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'token_exchange_failed' });
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
                return await handleCallback(url, env);
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
