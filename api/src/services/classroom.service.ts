/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * ClassroomService - Business logic for classroom and machine management
 *
 * This service extracts the shared logic from REST endpoints and tRPC routers
 * to eliminate duplication and provide a single source of truth.
 */

import * as classroomStorage from '../lib/classroom-storage.js';
import type { WhitelistUrlResult as StorageWhitelistUrlResult } from '../lib/classroom-storage.js';

// =============================================================================
// Types
// =============================================================================

export interface RegisterMachineInput {
    hostname: string;
    classroomId?: string | undefined;
    classroomName?: string | undefined;
    version?: string | undefined;
}

// Re-export the storage type for consistency
export type WhitelistUrlResult = StorageWhitelistUrlResult;

export type ClassroomServiceError =
    | { code: 'HOSTNAME_REQUIRED'; message: string }
    | { code: 'CLASSROOM_NOT_FOUND'; message: string }
    | { code: 'MACHINE_NOT_FOUND'; message: string }
    | { code: 'NO_GROUP_CONFIGURED'; message: string };

export type ClassroomResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: ClassroomServiceError };

// =============================================================================
// Service Implementation
// =============================================================================

// The machine type returned by storage
type StorageMachine = Awaited<ReturnType<typeof classroomStorage.registerMachine>>;

/**
 * Register a machine to a classroom
 */
export async function registerMachine(
    input: RegisterMachineInput
): Promise<ClassroomResult<StorageMachine>> {
    // Validate hostname
    if (!input.hostname || input.hostname.trim() === '') {
        return {
            ok: false,
            error: { code: 'HOSTNAME_REQUIRED', message: 'Hostname required' }
        };
    }

    // Resolve classroom ID
    let classroomId = input.classroomId;

    if (!classroomId && input.classroomName) {
        const classroom = await classroomStorage.getClassroomByName(input.classroomName);
        if (classroom) {
            classroomId = classroom.id;
        }
    }

    if (!classroomId) {
        return {
            ok: false,
            error: { code: 'CLASSROOM_NOT_FOUND', message: 'Valid classroom_id or classroom_name is required' }
        };
    }

    // Register the machine
    const machine = await classroomStorage.registerMachine({
        hostname: input.hostname,
        classroomId,
        ...(input.version ? { version: input.version } : {}),
    });

    return {
        ok: true,
        data: machine
    };
}

/**
 * Get the whitelist URL for a machine
 */
export async function getWhitelistUrl(
    hostname: string
): Promise<ClassroomResult<WhitelistUrlResult>> {
    // Validate hostname
    if (!hostname || hostname.trim() === '') {
        return {
            ok: false,
            error: { code: 'HOSTNAME_REQUIRED', message: 'Hostname required' }
        };
    }

    // Update last seen timestamp
    await classroomStorage.updateMachineLastSeen(hostname);

    // Get the whitelist URL
    const result = await classroomStorage.getWhitelistUrlForMachine(hostname);

    if (!result) {
        return {
            ok: false,
            error: { code: 'MACHINE_NOT_FOUND', message: 'Machine not found or no group configured' }
        };
    }

    return {
        ok: true,
        data: result
    };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
    registerMachine,
    getWhitelistUrl,
};
