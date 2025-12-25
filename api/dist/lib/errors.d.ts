/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Custom API Error Classes
 * Provides structured error handling with status codes,
 * error codes, and detailed messages.
 */
import type { Request, Response, NextFunction } from 'express';
export interface ErrorDetails {
    field?: string;
    value?: unknown;
    [key: string]: unknown;
}
export interface ErrorJSON {
    success: false;
    error: string;
    code: string;
    details?: ErrorDetails;
}
/**
 * Base API Error class
 */
export declare class APIError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details: ErrorDetails | null;
    readonly timestamp: string;
    /**
     * Create an API error
     * @param message - Human-readable error message
     * @param code - Machine-readable error code (e.g., 'NOT_FOUND')
     * @param statusCode - HTTP status code
     * @param details - Additional error details
     */
    constructor(message: string, code: string, statusCode?: number, details?: ErrorDetails | null);
    /**
     * Convert error to JSON response format
     */
    toJSON(): ErrorJSON;
}
/**
 * 404 Not Found Error
 */
export declare class NotFoundError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 400 Validation Error
 */
export declare class ValidationError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 401 Unauthorized Error
 */
export declare class UnauthorizedError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 403 Forbidden Error
 */
export declare class ForbiddenError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 409 Conflict Error
 */
export declare class ConflictError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 429 Rate Limit Error
 */
export declare class RateLimitError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * 500 Server Error
 */
export declare class ServerError extends APIError {
    constructor(message?: string, details?: ErrorDetails | null);
}
/**
 * Express error handler middleware
 */
export declare function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=errors.d.ts.map