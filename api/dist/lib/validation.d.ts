/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Input validation schemas using Joi
 * Centralized validation for all API endpoints
 */
import Joi from 'joi';
import type { Request, Response, NextFunction } from 'express';
type RequestProperty = 'body' | 'query' | 'params';
export declare const schemas: {
    readonly id: Joi.StringSchema<string>;
    readonly optionalId: Joi.StringSchema<string>;
    readonly domain: Joi.StringSchema<string>;
    readonly email: Joi.StringSchema<string>;
    readonly password: Joi.StringSchema<string>;
    readonly name: Joi.StringSchema<string>;
    readonly reason: Joi.StringSchema<string>;
    readonly role: Joi.StringSchema<string>;
    readonly groupIds: Joi.ArraySchema<any[]>;
};
export declare const requestSchemas: {
    readonly submitRequest: Joi.ObjectSchema<any>;
    readonly checkDomain: Joi.ObjectSchema<any>;
};
export declare const authSchemas: {
    readonly register: Joi.ObjectSchema<any>;
    readonly login: Joi.ObjectSchema<any>;
    readonly refresh: Joi.ObjectSchema<any>;
};
export declare const userSchemas: {
    readonly create: Joi.ObjectSchema<any>;
    readonly update: Joi.ObjectSchema<any>;
    readonly assignRole: Joi.ObjectSchema<any>;
};
export declare const classroomSchemas: {
    readonly create: Joi.ObjectSchema<any>;
    readonly update: Joi.ObjectSchema<any>;
    readonly registerMachine: Joi.ObjectSchema<any>;
};
/**
 * Create validation middleware for a schema
 */
export declare function validate(schema: Joi.ObjectSchema, property?: RequestProperty): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Validate domain format (standalone function)
 */
export declare function isValidDomain(domain: unknown): boolean;
/**
 * Sanitize text input (remove dangerous characters)
 */
export declare function sanitize(text: unknown, maxLength?: number): string;
export {};
//# sourceMappingURL=validation.d.ts.map