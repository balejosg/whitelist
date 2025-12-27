import { z } from 'zod';

// Domain Types
export const RequestStatus = z.enum(['pending', 'approved', 'rejected']);
export const RequestPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export const UserRole = z.enum(['admin', 'teacher', 'student']);
export const MachineStatus = z.enum(['online', 'offline', 'unknown']);

// Entity Schemas
export const DomainRequest = z.object({
    id: z.string(),
    domain: z.string(),
    reason: z.string(),
    requester_email: z.string(),
    group_id: z.string(),
    priority: RequestPriority,
    status: RequestStatus,
    created_at: z.string(),
    updated_at: z.string(),
    resolved_at: z.string().nullable(),
    resolved_by: z.string().nullable(),
    resolution_note: z.string().optional(),
});

export const User = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    isActive: z.boolean().optional(),
    emailVerified: z.boolean().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});
