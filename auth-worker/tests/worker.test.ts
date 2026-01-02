/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert';
import worker from '../src/worker.js';

const MOCK_ENV = {
    GITHUB_CLIENT_ID: 'mock_client_id',
    GITHUB_CLIENT_SECRET: 'mock_client_secret',
    FRONTEND_URL: 'https://frontend.example.com',
    WORKER_URL: 'https://worker.example.com'
};

const MOCK_CTX = {
    waitUntil: () => {},
    passThroughOnException: () => {}
} as any;

await describe('Worker OAuth Flow', () => {
    describe('handleLogin', () => {
        it('redirects to GitHub with correct params', async () => {
            const request = new Request('https://worker.example.com/auth/login');
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);

            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.startsWith('https://github.com/login/oauth/authorize'));
            assert.ok(location.includes('client_id=mock_client_id'));
            assert.ok(location.includes('redirect_uri=https%3A%2F%2Fworker.example.com%2Fauth%2Fcallback'));
            assert.ok(location.includes('state='));

            const setCookie = response.headers.get('Set-Cookie');
            assert.ok(setCookie !== null);
            assert.ok(setCookie.includes('openpath_oauth_state='));
            assert.ok(setCookie.includes('HttpOnly'));
        });
    });

    describe('handleCallback', () => {
        const originalFetch = globalThis.fetch;

        after(() => {
            globalThis.fetch = originalFetch;
        });

        it('redirects with error if error param present', async () => {
            const request = new Request('https://worker.example.com/auth/callback?error=access_denied&state=123');
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('error=access_denied'));
        });

        it('redirects with error if code is missing', async () => {
            const request = new Request('https://worker.example.com/auth/callback?state=123');
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('error=no_code'));
        });

        it('redirects with error if state mismatch', async () => {
            const request = new Request('https://worker.example.com/auth/callback?code=abc&state=invalid');
            // Mock cookie
            request.headers.set('Cookie', 'openpath_oauth_state=valid_state');

            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('error=invalid_state'));
        });

        it('exchanges code for token and redirects success', async () => {
            const state = 'valid_state';
            const code = 'valid_code';
            const request = new Request(`https://worker.example.com/auth/callback?code=${code}&state=${state}`);
            request.headers.set('Cookie', `openpath_oauth_state=${state}`);

            // Mock fetch for this test
            globalThis.fetch = mock.fn(async () => {
                return new Response(JSON.stringify({
                    access_token: 'gh_token_123',
                    token_type: 'bearer'
                }));
            });

            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('access_token=gh_token_123'));
            assert.ok(location.includes('token_type=bearer'));
        });

        it('handles token exchange error', async () => {
            const state = 'valid_state';
            const code = 'bad_code';
            const request = new Request(`https://worker.example.com/auth/callback?code=${code}&state=${state}`);
            request.headers.set('Cookie', `openpath_oauth_state=${state}`);

            // Mock fetch error
            globalThis.fetch = mock.fn(async () => {
                return new Response(JSON.stringify({
                    error: 'bad_verification_code'
                }));
            });

            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('error=bad_verification_code'));
        });
        
        it('handles fetch exception', async () => {
            const state = 'valid_state';
            const code = 'crash_code';
            const request = new Request(`https://worker.example.com/auth/callback?code=${code}&state=${state}`);
            request.headers.set('Cookie', `openpath_oauth_state=${state}`);

            // Mock fetch exception
            globalThis.fetch = mock.fn(async () => {
                throw new Error('Network error');
            });

            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 302);
            const location = response.headers.get('Location');
            assert.ok(location !== null);
            assert.ok(location.includes('error=token_exchange_failed'));
        });
    });

    describe('Other Routes', () => {
        it('handles health check', async () => {
            const request = new Request('https://worker.example.com/health');
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 200);
            const data = await response.json();
            assert.deepStrictEqual(data, { status: 'ok' });
        });

        it('handles 404', async () => {
            const request = new Request('https://worker.example.com/unknown');
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.status, 404);
        });

        it('handles OPTIONS preflight', async () => {
            const request = new Request('https://worker.example.com/auth/login', {
                method: 'OPTIONS'
            });
            const response = await worker.fetch(request, MOCK_ENV, MOCK_CTX);
            
            assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), MOCK_ENV.FRONTEND_URL);
        });
    });
});
