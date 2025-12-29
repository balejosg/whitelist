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
    requesterEmail: z.string(),
    groupId: z.string(),
    priority: RequestPriority,
    status: RequestStatus,
    createdAt: z.string(),
    updatedAt: z.string(),
    resolvedAt: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    resolutionNote: z.string().optional(),
});

export const User = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    active: z.boolean().optional(),
    isActive: z.boolean().optional(),
    emailVerified: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const Classroom = z.object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
    defaultGroupId: z.string().nullable(),
    activeGroupId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const Machine = z.object({
    id: z.string(),
    hostname: z.string(),
    classroomId: z.string().nullable(),
    version: z.string().optional(),
    lastSeen: z.string().nullable(),
    status: MachineStatus,
});
