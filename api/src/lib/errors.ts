/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Custom API Error Classes
 * Provides structured error handling with status codes,
 * error codes, and detailed messages.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from './logger.js';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Base API Error
// =============================================================================

/**
 * Base API Error class
 */
export class APIError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly details: ErrorDetails | null;
    public readonly timestamp: string;

    /**
     * Create an API error
     * @param message - Human-readable error message
     * @param code - Machine-readable error code (e.g., 'NOT_FOUND')
     * @param statusCode - HTTP status code
     * @param details - Additional error details
     */
    constructor(
        message: string,
        code: string,
        statusCode = 500,
        details: ErrorDetails | null = null
    ) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Convert error to JSON response format
     */
    toJSON(): ErrorJSON {
        const json: ErrorJSON = {
            success: false,
            error: this.message,
            code: this.code
        };

        if (this.details) {
            json.details = this.details;
        }

        return json;
    }
}

// =============================================================================
// Pre-defined Error Types
// =============================================================================

/**
 * 404 Not Found Error
 */
export class NotFoundError extends APIError {
    constructor(message = 'Resource not found', details: ErrorDetails | null = null) {
        super(message, 'NOT_FOUND', 404, details);
        this.name = 'NotFoundError';
    }
}

/**
 * 400 Validation Error
 */
export class ValidationError extends APIError {
    constructor(message = 'Validation failed', details: ErrorDetails | null = null) {
        super(message, 'VALIDATION_ERROR', 400, details);
        this.name = 'ValidationError';
    }
}

/**
 * 401 Unauthorized Error
 */
export class UnauthorizedError extends APIError {
    constructor(message = 'Authentication required', details: ErrorDetails | null = null) {
        super(message, 'UNAUTHORIZED', 401, details);
        this.name = 'UnauthorizedError';
    }
}

/**
 * 403 Forbidden Error
 */
export class ForbiddenError extends APIError {
    constructor(message = 'Access denied', details: ErrorDetails | null = null) {
        super(message, 'FORBIDDEN', 403, details);
        this.name = 'ForbiddenError';
    }
}

/**
 * 409 Conflict Error
 */
export class ConflictError extends APIError {
    constructor(message = 'Resource conflict', details: ErrorDetails | null = null) {
        super(message, 'CONFLICT', 409, details);
        this.name = 'ConflictError';
    }
}

/**
 * 429 Rate Limit Error
 */
export class RateLimitError extends APIError {
    constructor(message = 'Too many requests', details: ErrorDetails | null = null) {
        super(message, 'RATE_LIMITED', 429, details);
        this.name = 'RateLimitError';
    }
}

/**
 * 500 Server Error
 */
export class ServerError extends APIError {
    constructor(message = 'Internal server error', details: ErrorDetails | null = null) {
        super(message, 'SERVER_ERROR', 500, details);
        this.name = 'ServerError';
    }
}

// =============================================================================
// Error Handler Middleware
// =============================================================================

/**
 * Express error handler middleware
 */
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Log error using Winston
    logger.error(`${err.name}: ${err.message}`, {
        errorName: err.name,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle APIError instances
    if (err instanceof APIError) {
        res.status(err.statusCode).json(err.toJSON());
        return;
    }

    // Handle unknown errors
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'SERVER_ERROR'
    });
}
