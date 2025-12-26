/**
 * Error Tracking Middleware
 *
 * Provides structured error logging with request IDs,
 * error categorization, and consistent error responses.
 */
import { v4 as uuidv4 } from 'uuid';
// =============================================================================
// Error Categories
// =============================================================================
export var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION"] = "VALIDATION";
    ErrorCategory["AUTH"] = "AUTH";
    ErrorCategory["NOT_FOUND"] = "NOT_FOUND";
    ErrorCategory["RATE_LIMIT"] = "RATE_LIMIT";
    ErrorCategory["EXTERNAL"] = "EXTERNAL";
    ErrorCategory["INTERNAL"] = "INTERNAL";
})(ErrorCategory || (ErrorCategory = {}));
// =============================================================================
// Helper Functions
// =============================================================================
function categorizeError(err, statusCode) {
    if (statusCode === 401 || statusCode === 403)
        return ErrorCategory.AUTH;
    if (statusCode === 404)
        return ErrorCategory.NOT_FOUND;
    if (statusCode === 429)
        return ErrorCategory.RATE_LIMIT;
    if (statusCode === 400 || err.name === 'ValidationError')
        return ErrorCategory.VALIDATION;
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')
        return ErrorCategory.EXTERNAL;
    return ErrorCategory.INTERNAL;
}
export function logError(err, req, category) {
    const logEntry = {
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
    console.error(JSON.stringify(logEntry));
    return logEntry;
}
// =============================================================================
// Middleware
// =============================================================================
export const requestIdMiddleware = (req, res, next) => {
    const headerRequestId = req.headers['x-request-id'];
    req.id = (typeof headerRequestId === 'string' ? headerRequestId : undefined) ?? uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
};
export function errorTrackingMiddleware(err, req, res, _next) {
    const statusCode = err.statusCode ?? err.status ?? 500;
    const category = categorizeError(err, statusCode);
    logError(err, req, category);
    if (res.headersSent === false) {
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
export function createError(message, statusCode = 500, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code !== null) {
        error.code = code;
    }
    return error;
}
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
// =============================================================================
// API Response Helpers
// =============================================================================
export const apiResponse = {
    success: (res, data, statusCode = 200) => {
        res.status(statusCode).json({
            success: true,
            ...data
        });
    },
    error: (res, message, code, statusCode = 400, details = null) => {
        const response = {
            success: false,
            error: message,
            code: code
        };
        if (details !== null)
            response.details = details;
        res.status(statusCode).json(response);
    },
    notFound: (res, message = 'Resource not found') => {
        res.status(404).json({
            success: false,
            error: message,
            code: 'NOT_FOUND'
        });
    },
    unauthorized: (res, message = 'Authentication required') => {
        res.status(401).json({
            success: false,
            error: message,
            code: 'UNAUTHORIZED'
        });
    },
    forbidden: (res, message = 'Access denied') => {
        res.status(403).json({
            success: false,
            error: message,
            code: 'FORBIDDEN'
        });
    },
    validationError: (res, message = 'Validation failed', details = null) => {
        const response = {
            success: false,
            error: message,
            code: 'VALIDATION_ERROR'
        };
        if (details !== null)
            response.details = details;
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
//# sourceMappingURL=error-tracking.js.map