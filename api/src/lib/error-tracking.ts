/**
 * Error Tracking Middleware
 *
 * Provides structured error logging with request IDs,
 * error categorization, and consistent error responses.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from './logger.js';

// =============================================================================
// Types
// =============================================================================

interface RequestWithId extends Request {
    id?: string;
    user?: {
        id: string;
        email: string;
    };
}

interface ErrorWithStatus extends Error {
    statusCode?: number;
    status?: number;
    code?: string;
}

interface LogEntry {
    timestamp: string;
    requestId: string;
    category: ErrorCategory;
    method: string;
    path: string;
    userAgent: string | undefined;
    ip: string | undefined;
    error: {
        message: string;
        name: string;
        code: string | undefined;
        stack: string | undefined;
    };
    userId?: string;
    userEmail?: string;
    [key: string]: unknown;
}

interface ErrorResponseBase {
    success: false;
    error: string;
    code: string;
    requestId?: string;
    details?: unknown;
}

// =============================================================================
// Error Categories
// =============================================================================

export enum ErrorCategory {
    VALIDATION = 'VALIDATION',
    AUTH = 'AUTH',
    NOT_FOUND = 'NOT_FOUND',
    RATE_LIMIT = 'RATE_LIMIT',
    EXTERNAL = 'EXTERNAL',
    INTERNAL = 'INTERNAL'
}

// =============================================================================
// Helper Functions
// =============================================================================

function categorizeError(err: ErrorWithStatus, statusCode: number): ErrorCategory {
    if (statusCode === 401 || statusCode === 403) return ErrorCategory.AUTH;
    if (statusCode === 404) return ErrorCategory.NOT_FOUND;
    if (statusCode === 429) return ErrorCategory.RATE_LIMIT;
    if (statusCode === 400 || err.name === 'ValidationError') return ErrorCategory.VALIDATION;
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') return ErrorCategory.EXTERNAL;
    return ErrorCategory.INTERNAL;
}

export function logError(
    err: ErrorWithStatus,
    req: RequestWithId,
    category: ErrorCategory
): LogEntry {
    const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        requestId: req.id ?? 'unknown',
        category: category,
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        error: {
            message: err.message,
            name: err.name,
            code: err.code,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    };

    if (req.user) {
        logEntry.userId = req.user.id;
        logEntry.userEmail = req.user.email;
    }

    logger.error('Request error', logEntry);
    return logEntry;
}

// =============================================================================
// Middleware
// =============================================================================

export const requestIdMiddleware: RequestHandler = (
    req: RequestWithId,
    res: Response,
    next: NextFunction
): void => {
    const headerRequestId = req.headers['x-request-id'];
    req.id = (typeof headerRequestId === 'string' ? headerRequestId : undefined) ?? uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
};

export function errorTrackingMiddleware(
    err: ErrorWithStatus,
    req: RequestWithId,
    res: Response,
    _next: NextFunction
): void {
    const statusCode = err.statusCode ?? err.status ?? 500;
    const category = categorizeError(err, statusCode);

    logError(err, req, category);

    if (!res.headersSent) {
        res.status(statusCode).json({
            success: false,
            error: statusCode === 500 ? 'Internal server error' : err.message,
            code: err.code ?? category,
            requestId: req.id
        });
    }
}

// =============================================================================
// Error Creation
// =============================================================================

export function createError(
    message: string,
    statusCode = 500,
    code: string | null = null
): ErrorWithStatus {
    const error: ErrorWithStatus = new Error(message);
    error.statusCode = statusCode;
    if (code !== null) {
        error.code = code;
    }
    return error;
}

// =============================================================================
// Async Handler
// =============================================================================

type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandlerFn): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// =============================================================================
// API Response Helpers
// =============================================================================

export const apiResponse = {
    success: (res: Response, data: Record<string, unknown>, statusCode = 200): void => {
        res.status(statusCode).json({
            success: true,
            ...data
        });
    },

    error: (
        res: Response,
        message: string,
        code: string,
        statusCode = 400,
        details: unknown = null
    ): void => {
        const response: ErrorResponseBase = {
            success: false,
            error: message,
            code: code
        };
        if (details !== null) response.details = details;
        res.status(statusCode).json(response);
    },

    notFound: (res: Response, message = 'Resource not found'): void => {
        res.status(404).json({
            success: false,
            error: message,
            code: 'NOT_FOUND'
        });
    },

    unauthorized: (res: Response, message = 'Authentication required'): void => {
        res.status(401).json({
            success: false,
            error: message,
            code: 'UNAUTHORIZED'
        });
    },

    forbidden: (res: Response, message = 'Access denied'): void => {
        res.status(403).json({
            success: false,
            error: message,
            code: 'FORBIDDEN'
        });
    },

    validationError: (res: Response, message = 'Validation failed', details: unknown = null): void => {
        const response: ErrorResponseBase = {
            success: false,
            error: message,
            code: 'VALIDATION_ERROR'
        };
        if (details !== null) response.details = details;
        res.status(400).json(response);
    }
};

export default {
    ErrorCategory,
    requestIdMiddleware,
    errorTrackingMiddleware,
    logError,
    createError,
    asyncHandler,
    apiResponse
};
