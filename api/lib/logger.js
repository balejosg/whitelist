/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Structured logging with Winston
 * Provides consistent log format across the application
 */

const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Custom format for development (colorized, readable)
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
        const reqId = requestId ? `[${requestId}]` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${reqId} ${message}${metaStr}`;
    })
);

// Custom format for production (JSON for log aggregation)
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
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
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
}

// Helper to create child logger with request context
logger.child = (meta) => {
    return {
        info: (msg, extra = {}) => logger.info(msg, { ...meta, ...extra }),
        warn: (msg, extra = {}) => logger.warn(msg, { ...meta, ...extra }),
        error: (msg, extra = {}) => logger.error(msg, { ...meta, ...extra }),
        debug: (msg, extra = {}) => logger.debug(msg, { ...meta, ...extra })
    };
};

// Express middleware for request logging
logger.requestMiddleware = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'info';

        logger[level](`${req.method} ${req.path}`, {
            requestId: req.id,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('user-agent'),
            ip: req.ip
        });
    });

    next();
};

module.exports = logger;
