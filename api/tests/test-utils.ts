/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Shared Test Utilities
 * 
 * This module provides common helpers for all test files to ensure:
 * - Test isolation via unique identifiers per run
 * - Consistent tRPC request/response handling
 * - Type-safe response parsing
 */

// Unique identifier for this test run - used for email generation
export const TEST_RUN_ID = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Generate a unique email address for this test run
 * @param prefix - Descriptive prefix like 'admin', 'teacher', etc.
 */
export function uniqueEmail(prefix: string): string {
    return `${prefix}-${TEST_RUN_ID}@test.local`;
}

/**
 * Generate a unique domain for this test run
 * @param prefix - Descriptive prefix
 */
export function uniqueDomain(prefix: string): string {
    return `${prefix}-${TEST_RUN_ID}.example.com`;
}

// Common type interfaces
export interface TRPCResponse<T = unknown> {
    result?: { data: T };
    error?: { message: string; code: string; data?: { code: string } };
}

export interface UserResult {
    id: string;
    email: string;
    name: string;
    roles?: { id: string; role: string; groupIds: string[] }[];
}

export interface AuthResult {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
    user?: UserResult;
}

export interface RequestResult {
    id: string;
    domain?: string;
    status?: string;
    reason?: string;
}

export interface RoleResult {
    id: string;
    role: string;
    groupIds: string[];
}

/**
 * Helper to call tRPC mutations
 */
export async function trpcMutate(
    baseUrl: string,
    procedure: string,
    input: unknown,
    headers: Record<string, string> = {}
): Promise<Response> {
    const response = await fetch(`${baseUrl}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(input)
    });
    return response;
}

/**
 * Helper to call tRPC queries
 */
export async function trpcQuery(
    baseUrl: string,
    procedure: string,
    input?: unknown,
    headers: Record<string, string> = {}
): Promise<Response> {
    let url = `${baseUrl}/trpc/${procedure}`;
    if (input !== undefined) {
        url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const response = await fetch(url, { headers });
    return response;
}

/**
 * Parse tRPC response into typed data or error
 */
export async function parseTRPC(response: Response): Promise<{
    data?: unknown;
    error?: string;
    code?: string;
}> {
    const json = await response.json() as TRPCResponse;
    if (json.result) {
        return { data: json.result.data };
    }
    if (json.error) {
        return {
            error: json.error.message,
            code: json.error.data?.code ?? json.error.code
        };
    }
    return {};
}

/**
 * Create authorization header object for Bearer token
 */
export function bearerAuth(token: string | null): Record<string, string> {
    if (token === null || token === '') return {};
    return { 'Authorization': `Bearer ${token}` };
}

/**
 * Assert that a response has the expected status, with helpful error message
 */
export function assertStatus(response: Response, expected: number, message?: string): void {
    if (response.status !== expected) {
        const msg = message ?? `Expected status ${String(expected)}, got ${String(response.status)}`;
        throw new Error(msg);
    }
}
