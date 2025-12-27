/**
 * Error Tracking Middleware
 *
 * Provides structured error logging with request IDs,
 * error categorization, and consistent error responses.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
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
}
export declare enum ErrorCategory {
    VALIDATION = "VALIDATION",
    AUTH = "AUTH",
    NOT_FOUND = "NOT_FOUND",
    RATE_LIMIT = "RATE_LIMIT",
    EXTERNAL = "EXTERNAL",
    INTERNAL = "INTERNAL"
}
export declare function logError(err: ErrorWithStatus, req: RequestWithId, category: ErrorCategory): LogEntry;
export declare const requestIdMiddleware: RequestHandler;
export declare function errorTrackingMiddleware(err: ErrorWithStatus, req: RequestWithId, res: Response, _next: NextFunction): void;
export declare function createError(message: string, statusCode?: number, code?: string | null): ErrorWithStatus;
type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export declare function asyncHandler(fn: AsyncHandlerFn): RequestHandler;
export declare const apiResponse: {
    success: (res: Response, data: Record<string, unknown>, statusCode?: number) => void;
    error: (res: Response, message: string, code: string, statusCode?: number, details?: unknown) => void;
    notFound: (res: Response, message?: string) => void;
    unauthorized: (res: Response, message?: string) => void;
    forbidden: (res: Response, message?: string) => void;
    validationError: (res: Response, message?: string, details?: unknown) => void;
};
declare const _default: {
    ErrorCategory: typeof ErrorCategory;
    requestIdMiddleware: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
    errorTrackingMiddleware: typeof errorTrackingMiddleware;
    logError: typeof logError;
    createError: typeof createError;
    asyncHandler: typeof asyncHandler;
    apiResponse: {
        success: (res: Response, data: Record<string, unknown>, statusCode?: number) => void;
        error: (res: Response, message: string, code: string, statusCode?: number, details?: unknown) => void;
        notFound: (res: Response, message?: string) => void;
        unauthorized: (res: Response, message?: string) => void;
        forbidden: (res: Response, message?: string) => void;
        validationError: (res: Response, message?: string, details?: unknown) => void;
    };
};
export default _default;
//# sourceMappingURL=error-tracking.d.ts.map