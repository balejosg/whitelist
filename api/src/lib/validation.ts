/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Input validation schemas using Joi
 * Centralized validation for all API endpoints
 */

import Joi from 'joi';
import type { Request, Response, NextFunction } from 'express';

// =============================================================================
// Types
// =============================================================================

interface ValidationDetail {
    field: string;
    message: string;
}

type RequestProperty = 'body' | 'query' | 'params';

// =============================================================================
// Common Patterns
// =============================================================================

// Domain name validation (RFC 1035 compliant)
const domainPattern = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*$/;

// Email validation (more strict than default)
const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// =============================================================================
// Reusable Schema Components
// =============================================================================

export const schemas = {
    // ID fields
    id: Joi.string().uuid().required(),
    optionalId: Joi.string().uuid(),

    // Domain validation
    domain: Joi.string()
        .min(3)
        .max(253)
        .pattern(domainPattern)
        .lowercase()
        .trim()
        .messages({
            'string.pattern.base': 'Invalid domain format',
            'string.min': 'Domain must be at least 3 characters',
            'string.max': 'Domain cannot exceed 253 characters'
        }),

    // Email validation
    email: Joi.string()
        .email()
        .pattern(emailPattern)
        .max(254)
        .lowercase()
        .trim()
        .messages({
            'string.email': 'Invalid email format',
            'string.pattern.base': 'Invalid email format'
        }),

    // Password validation
    password: Joi.string()
        .min(8)
        .max(128)
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.max': 'Password cannot exceed 128 characters'
        }),

    // Name/text fields
    name: Joi.string()
        .min(1)
        .max(100)
        .trim()
        .messages({
            'string.min': 'Name cannot be empty',
            'string.max': 'Name cannot exceed 100 characters'
        }),

    // Reason/description fields
    reason: Joi.string()
        .max(500)
        .trim()
        .allow('')
        .messages({
            'string.max': 'Reason cannot exceed 500 characters'
        }),

    // Role validation
    role: Joi.string()
        .valid('admin', 'teacher', 'student')
        .messages({
            'any.only': 'Role must be admin, teacher, or student'
        }),

    // Group IDs array
    groupIds: Joi.array()
        .items(Joi.string().trim())
        .default([])
} as const;

// =============================================================================
// Request Schemas
// =============================================================================

export const requestSchemas = {
    // Domain request submission
    submitRequest: Joi.object({
        domain: schemas.domain.required(),
        reason: schemas.reason,
        submitter_name: schemas.name,
        submitter_email: schemas.email
    }),

    // Domain check
    checkDomain: Joi.object({
        domain: schemas.domain.required()
    })
} as const;

// =============================================================================
// Auth Schemas
// =============================================================================

export const authSchemas = {
    // User registration
    register: Joi.object({
        email: schemas.email.required(),
        password: schemas.password.required(),
        name: schemas.name.required()
    }),

    // User login
    login: Joi.object({
        email: schemas.email.required(),
        password: Joi.string().required()
    }),

    // Token refresh
    refresh: Joi.object({
        refreshToken: Joi.string().required()
    })
} as const;

// =============================================================================
// User Schemas
// =============================================================================

export const userSchemas = {
    // Create user
    create: Joi.object({
        email: schemas.email.required(),
        password: schemas.password.required(),
        name: schemas.name.required(),
        role: schemas.role,
        groupIds: schemas.groupIds
    }),

    // Update user
    update: Joi.object({
        email: schemas.email,
        password: schemas.password,
        name: schemas.name,
        isActive: Joi.boolean(),
        emailVerified: Joi.boolean()
    }).min(1),

    // Assign role
    assignRole: Joi.object({
        role: schemas.role.required(),
        groupIds: schemas.groupIds
    })
} as const;

// =============================================================================
// Classroom Schemas
// =============================================================================

export const classroomSchemas = {
    create: Joi.object({
        name: schemas.name.required(),
        description: Joi.string().max(500).allow(''),
        groupId: Joi.string().trim()
    }),

    update: Joi.object({
        name: schemas.name,
        description: Joi.string().max(500).allow(''),
        groupId: Joi.string().trim().allow(null)
    }).min(1),

    registerMachine: Joi.object({
        hostname: Joi.string().min(1).max(253).required(),
        classroom_id: schemas.optionalId
    })
} as const;

// =============================================================================
// Validation Middleware Factory
// =============================================================================

/**
 * Create validation middleware for a schema
 */
export function validate(
    schema: Joi.ObjectSchema,
    property: RequestProperty = 'body'
): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
        const dataToValidate = req[property] as unknown;
        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error !== undefined) {
            const details: ValidationDetail[] = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message
            }));

            res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details
            });
            return;
        }

        // Replace with validated/sanitized values
        (req as unknown as Record<string, unknown>)[property] = value;
        next();
    };
}

/**
 * Validate domain format (standalone function)
 */
export function isValidDomain(domain: unknown): boolean {
    if (domain === null || domain === undefined || typeof domain !== 'string') return false;
    if (domain.length < 3 || domain.length > 253) return false;
    return domainPattern.test(domain);
}

/**
 * Sanitize text input (remove dangerous characters)
 */
export function sanitize(text: unknown, maxLength = 500): string {
    if (text === null || text === undefined || typeof text !== 'string') return '';
    return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '')    // Remove remaining angle brackets
        .trim()
        .slice(0, maxLength);
}
