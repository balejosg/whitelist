/**
 * Error Tracking Middleware
 * 
 * Provides structured error logging with request IDs,
 * error categorization, and consistent error responses.
 */

const { v4: uuidv4 } = require('uuid');

// Error categories for easier filtering/alerting
const ErrorCategory = {
    VALIDATION: 'VALIDATION',
    AUTH: 'AUTH',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMIT: 'RATE_LIMIT',
    EXTERNAL: 'EXTERNAL',
    INTERNAL: 'INTERNAL'
};

/**
 * Categorize error based on status code and type
 */
function categorizeError(err, statusCode) {
    if (statusCode === 401 || statusCode === 403) return ErrorCategory.AUTH;
    if (statusCode === 404) return ErrorCategory.NOT_FOUND;
    if (statusCode === 429) return ErrorCategory.RATE_LIMIT;
    if (statusCode === 400 || err.name === 'ValidationError') return ErrorCategory.VALIDATION;
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') return ErrorCategory.EXTERNAL;
    return ErrorCategory.INTERNAL;
}

/**
 * Middleware to add request ID to all requests
 */
function requestIdMiddleware(req, res, next) {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
}

/**
 * Structured logger for errors
 */
function logError(err, req, category) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown',
        category: category,
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection?.remoteAddress,
        error: {
            message: err.message,
            name: err.name,
            code: err.code,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    };

    // Add user context if available
    if (req.user) {
        logEntry.userId = req.user.id;
        logEntry.userEmail = req.user.email;
    }

    console.error(JSON.stringify(logEntry));
    return logEntry;
}

/**
 * Error tracking middleware - catches and logs all errors
 */
function errorTrackingMiddleware(err, req, res, next) {
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Categorize the error
    const category = categorizeError(err, statusCode);

    // Log the error with context
    const logEntry = logError(err, req, category);

    // Send response if not already sent
    if (!res.headersSent) {
        res.status(statusCode).json({
            success: false,
            error: statusCode === 500 ? 'Internal server error' : err.message,
            code: err.code || category,
            requestId: req.id
        });
    }
}

/**
 * Create a trackable error with status code
 */
function createError(message, statusCode = 500, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

/**
 * Async handler wrapper - catches async errors and passes to error middleware
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Standardized API response helpers
 */
const apiResponse = {
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
        if (details) response.details = details;
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
        if (details) response.details = details;
        res.status(400).json(response);
    }
};

module.exports = {
    ErrorCategory,
    requestIdMiddleware,
    errorTrackingMiddleware,
    logError,
    createError,
    asyncHandler,
    apiResponse
};
