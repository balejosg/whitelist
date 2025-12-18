/**
 * Custom API Error Classes
 * 
 * Provides structured error handling with status codes,
 * error codes, and detailed messages.
 */

class APIError extends Error {
    /**
     * Create an API error
     * @param {string} message - Human-readable error message
     * @param {string} code - Machine-readable error code (e.g., 'NOT_FOUND')
     * @param {number} statusCode - HTTP status code
     * @param {Object} [details] - Additional error details
     */
    constructor(message, code, statusCode = 500, details = null) {
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
    toJSON() {
        return {
            success: false,
            error: this.message,
            code: this.code,
            ...(this.details && { details: this.details })
        };
    }
}

// Pre-defined error types for common cases
class NotFoundError extends APIError {
    constructor(message = 'Resource not found', details = null) {
        super(message, 'NOT_FOUND', 404, details);
        this.name = 'NotFoundError';
    }
}

class ValidationError extends APIError {
    constructor(message = 'Validation failed', details = null) {
        super(message, 'VALIDATION_ERROR', 400, details);
        this.name = 'ValidationError';
    }
}

class UnauthorizedError extends APIError {
    constructor(message = 'Authentication required', details = null) {
        super(message, 'UNAUTHORIZED', 401, details);
        this.name = 'UnauthorizedError';
    }
}

class ForbiddenError extends APIError {
    constructor(message = 'Access denied', details = null) {
        super(message, 'FORBIDDEN', 403, details);
        this.name = 'ForbiddenError';
    }
}

class ConflictError extends APIError {
    constructor(message = 'Resource conflict', details = null) {
        super(message, 'CONFLICT', 409, details);
        this.name = 'ConflictError';
    }
}

class RateLimitError extends APIError {
    constructor(message = 'Too many requests', details = null) {
        super(message, 'RATE_LIMITED', 429, details);
        this.name = 'RateLimitError';
    }
}

class ServerError extends APIError {
    constructor(message = 'Internal server error', details = null) {
        super(message, 'SERVER_ERROR', 500, details);
        this.name = 'ServerError';
    }
}

/**
 * Express error handler middleware
 * Use: app.use(errorHandler)
 */
function errorHandler(err, req, res, next) {
    // Log error
    console.error(`[${new Date().toISOString()}] ${err.name}: ${err.message}`);
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    // Handle APIError instances
    if (err instanceof APIError) {
        return res.status(err.statusCode).json(err.toJSON());
    }

    // Handle unknown errors
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'SERVER_ERROR'
    });
}

module.exports = {
    APIError,
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    RateLimitError,
    ServerError,
    errorHandler
};
