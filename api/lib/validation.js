/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Input validation schemas using Joi
 * Centralized validation for all API endpoints
 */

const Joi = require('joi');

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

const schemas = {
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
};

// =============================================================================
// Request Schemas
// =============================================================================

const requestSchemas = {
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
};

// =============================================================================
// Auth Schemas
// =============================================================================

const authSchemas = {
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
};

// =============================================================================
// User Schemas
// =============================================================================

const userSchemas = {
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
};

// =============================================================================
// Classroom Schemas
// =============================================================================

const classroomSchemas = {
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
};

// =============================================================================
// Validation Middleware Factory
// =============================================================================

/**
 * Create validation middleware for a schema
 * @param {Joi.Schema} schema - Joi schema to validate against
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
function validate(schema, property = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const details = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message
            }));

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details
            });
        }

        // Replace with validated/sanitized values
        req[property] = value;
        next();
    };
}

/**
 * Validate domain format (standalone function)
 * @param {string} domain - Domain to validate
 * @returns {boolean} True if valid
 */
function isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    if (domain.length < 3 || domain.length > 253) return false;
    return domainPattern.test(domain);
}

/**
 * Sanitize text input (remove dangerous characters)
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized text
 */
function sanitize(text, maxLength = 500) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '')    // Remove remaining angle brackets
        .trim()
        .slice(0, maxLength);
}

module.exports = {
    schemas,
    requestSchemas,
    authSchemas,
    userSchemas,
    classroomSchemas,
    validate,
    isValidDomain,
    sanitize
};
