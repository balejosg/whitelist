/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Simple JSON file storage for domain requests
 * Stores requests in data/requests.json
 */
import type { DomainRequest, RequestStatus } from '../types/index.js';
import type { IRequestStorage, CreateRequestData, RequestStats } from '../types/storage.js';
/**
 * Get all requests, optionally filtered by status
 */
export declare function getAllRequests(status?: RequestStatus | null): DomainRequest[];
/**
 * Get requests by group ID
 */
export declare function getRequestsByGroup(groupId: string): DomainRequest[];
/**
 * Get a single request by ID
 */
export declare function getRequestById(id: string): DomainRequest | null;
/**
 * Check if domain already has a pending request
 */
export declare function hasPendingRequest(domain: string): boolean;
/**
 * Create a new domain request
 */
export declare function createRequest(requestData: CreateRequestData): DomainRequest;
/**
 * Update request status
 */
export declare function updateRequestStatus(id: string, status: 'approved' | 'rejected', resolvedBy?: string, note?: string | null): DomainRequest | null;
/**
 * Delete a request
 */
export declare function deleteRequest(id: string): boolean;
/**
 * Get statistics
 */
export declare function getStats(): RequestStats;
export declare const storage: IRequestStorage;
export default storage;
//# sourceMappingURL=storage.d.ts.map