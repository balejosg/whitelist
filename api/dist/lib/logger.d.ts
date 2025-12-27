/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Structured logging with Winston
 * Provides consistent log format across the application
 */
import type { Request, Response, NextFunction } from 'express';
interface LogMeta {
    requestId?: string;
    [key: string]: unknown;
}
interface ChildLogger {
    info: (msg: string, extra?: Record<string, unknown>) => void;
    warn: (msg: string, extra?: Record<string, unknown>) => void;
    error: (msg: string, extra?: Record<string, unknown>) => void;
    debug: (msg: string, extra?: Record<string, unknown>) => void;
}
interface RequestWithId extends Request {
    id?: string;
}
/**
 * Create a child logger with request context
 */
declare function createChildLogger(meta: LogMeta): ChildLogger;
/**
 * Express middleware for request logging with slow request detection
 */
declare function requestMiddleware(req: RequestWithId, res: Response, next: NextFunction): void;
export declare const logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
    child: typeof createChildLogger;
    requestMiddleware: typeof requestMiddleware;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map