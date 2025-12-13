/**
 * Cloudflare Worker - GitHub OAuth Proxy
 * Handles OAuth flow for whitelist SPA
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// These will come from environment variables (secrets)
// GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, FRONTEND_URL

export default {
    async fetch(request, env) {
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
                return handleCallback(url, env);
            }

            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not Found', { status: 404 });
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

/**
 * Redirect user to GitHub authorization page
 */
function handleLogin(env) {
    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${env.WORKER_URL}/auth/callback`,
        scope: 'repo read:user',
        state: crypto.randomUUID()
    });

    return Response.redirect(`${GITHUB_AUTHORIZE_URL}?${params}`, 302);
}

/**
 * Handle OAuth callback from GitHub
 * Exchange code for access token and redirect to frontend
 */
async function handleCallback(url, env) {
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

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return redirectToFrontend(env.FRONTEND_URL, { error: tokenData.error });
        }

        // Redirect to frontend with token
        return redirectToFrontend(env.FRONTEND_URL, {
            access_token: tokenData.access_token,
            token_type: tokenData.token_type
        });

    } catch (err) {
        return redirectToFrontend(env.FRONTEND_URL, { error: 'token_exchange_failed' });
    }
}

function redirectToFrontend(frontendUrl, params) {
    const url = new URL(frontendUrl);
    url.hash = new URLSearchParams(params).toString();
    return Response.redirect(url.toString(), 302);
}
