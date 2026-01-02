/**
 * Cookie utilities for Cloudflare Worker
 */

/**
 * Extract a cookie value from a request's Cookie header
 */
export function getCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader === null) return undefined;
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
        const [rawKey, ...rawValue] = cookie.trim().split('=');
        if (rawKey === undefined || rawKey === '') continue;
        const key = rawKey.trim();
        if (key !== name) continue;
        return decodeURIComponent(rawValue.join('='));
    }
    return undefined;
}

/**
 * Serialize a cookie value for Set-Cookie header
 */
export function serializeCookie(
    name: string,
    value: string,
    options: {
        path?: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: 'Lax' | 'Strict' | 'None';
        maxAge?: number;
    } = {}
): string {
    const parts: string[] = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined) parts.push(`Max-Age=${String(options.maxAge)}`);
    parts.push(`Path=${options.path ?? '/'}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    if (options.secure !== false) parts.push('Secure');
    parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
    return parts.join('; ');
}

/**
 * Generate CORS headers for a given origin
 */
export function corsHeaders(origin: string): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

/**
 * Redirect to frontend with parameters in hash fragment
 */
export function redirectToFrontend(
    frontendUrl: string,
    params: Record<string, string>,
    headers?: HeadersInit
): Response {
    const url = new URL(frontendUrl);
    url.hash = new URLSearchParams(params).toString();

    const responseHeaders = new Headers(headers);
    responseHeaders.set('Location', url.toString());

    return new Response(null, {
        status: 302,
        headers: responseHeaders
    });
}
