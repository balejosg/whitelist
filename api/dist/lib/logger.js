/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Structured logging with Winston
 * Provides consistent log format across the application
 */
import winston from 'winston';
// =============================================================================
// Configuration
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');
// Slow request threshold (configurable via env, default 1000ms)
const SLOW_REQUEST_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS ?? '1000', 10);
// =============================================================================
// Formats
// =============================================================================
// Custom format for development (colorized, readable)
const devFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.colorize(), winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqId = requestId !== undefined && requestId !== null ? `[${requestId}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${reqId} ${message}${metaStr}`;
}));
// Custom format for production (JSON for log aggregation)
const prodFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());
// =============================================================================
// Logger Instance
// =============================================================================
const baseLogger = winston.createLogger({
    level: logLevel,
    format: isProduction ? prodFormat : devFormat,
    defaultMeta: { service: 'openpath-api' },
    transports: [
        new winston.transports.Console({
            handleExceptions: true,
            handleRejections: true
        })
    ]
});
// Add file transport in production
if (isProduction) {
    baseLogger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    baseLogger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}
// =============================================================================
// Logger API
// =============================================================================
/**
 * Create a child logger with request context
 */
function createChildLogger(meta) {
    return {
        info: (msg, extra = {}) => {
            baseLogger.info(msg, { ...meta, ...extra });
        },
        warn: (msg, extra = {}) => {
            baseLogger.warn(msg, { ...meta, ...extra });
        },
        error: (msg, extra = {}) => {
            baseLogger.error(msg, { ...meta, ...extra });
        },
        debug: (msg, extra = {}) => {
            baseLogger.debug(msg, { ...meta, ...extra });
        }
    };
}
/**
 * Express middleware for request logging with slow request detection
 */
function requestMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const isSlow = duration > SLOW_REQUEST_THRESHOLD_MS;
        // Determine log level: error for 5xx, warn for 4xx or slow, info for success
        let level = 'info';
        if (res.statusCode >= 500) {
            level = 'error';
        }
        else if (res.statusCode >= 400 || isSlow) {
            level = 'warn';
        }
        const logData = {
            requestId: req.id,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            userAgent: req.get('user-agent'),
            ip: req.ip
        };
        // Add slow request flag for alerting
        if (isSlow) {
            logData.slow = true;
            logData.threshold = SLOW_REQUEST_THRESHOLD_MS;
        }
        const message = `${req.method} ${req.path} ${String(res.statusCode)} ${String(duration)}ms${isSlow ? ' [SLOW]' : ''}`;
        baseLogger[level](message, logData);
    });
    next();
}
// =============================================================================
// Logger Object (compatible with existing API)
// =============================================================================
export const logger = {
    info: (message, meta) => {
        baseLogger.info(message, meta);
    },
    warn: (message, meta) => {
        baseLogger.warn(message, meta);
    },
    error: (message, meta) => {
        baseLogger.error(message, meta);
    },
    debug: (message, meta) => {
        baseLogger.debug(message, meta);
    },
    child: createChildLogger,
    requestMiddleware
};
export default logger;
//# sourceMappingURL=logger.js.map