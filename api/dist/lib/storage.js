/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Simple JSON file storage for domain requests
 * Stores requests in data/requests.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
// =============================================================================
// Constants
// =============================================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
// =============================================================================
// Initialization
// =============================================================================
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// Initialize empty requests file if not exists
if (!fs.existsSync(REQUESTS_FILE)) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify({ requests: [] }, null, 2));
}
// =============================================================================
// Internal Functions
// =============================================================================
/**
 * Load all requests from file
 */
function loadData() {
    try {
        const data = fs.readFileSync(REQUESTS_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error loading requests:', error);
        return { requests: [] };
    }
}
/**
 * Save data to file
 */
function saveData(data) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
}
// =============================================================================
// Public API
// =============================================================================
/**
 * Get all requests, optionally filtered by status
 */
export function getAllRequests(status = null) {
    const data = loadData();
    if (status !== null) {
        return data.requests.filter((r) => r.status === status);
    }
    return data.requests;
}
/**
 * Get requests by group ID
 */
export function getRequestsByGroup(groupId) {
    const data = loadData();
    return data.requests.filter((r) => r.group_id === groupId);
}
/**
 * Get a single request by ID
 */
export function getRequestById(id) {
    const data = loadData();
    return data.requests.find((r) => r.id === id) ?? null;
}
/**
 * Check if domain already has a pending request
 */
export function hasPendingRequest(domain) {
    const data = loadData();
    return data.requests.some((r) => r.domain.toLowerCase() === domain.toLowerCase() && r.status === 'pending');
}
/**
 * Create a new domain request
 */
export function createRequest(requestData) {
    const data = loadData();
    const priority = requestData.priority ?? 'normal';
    const newRequest = {
        id: `req_${uuidv4().slice(0, 8)}`,
        domain: requestData.domain.toLowerCase().trim(),
        reason: requestData.reason ?? '',
        requester_email: requestData.requesterEmail ?? 'anonymous',
        group_id: requestData.groupId ?? process.env.DEFAULT_GROUP ?? 'default',
        priority,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_at: null,
        resolved_by: null
    };
    data.requests.push(newRequest);
    saveData(data);
    return newRequest;
}
/**
 * Update request status
 */
export function updateRequestStatus(id, status, resolvedBy = 'admin', note = null) {
    const data = loadData();
    const index = data.requests.findIndex((r) => r.id === id);
    if (index === -1) {
        return null;
    }
    const request = data.requests[index];
    if (!request) {
        return null;
    }
    request.status = status;
    request.updated_at = new Date().toISOString();
    request.resolved_at = new Date().toISOString();
    request.resolved_by = resolvedBy;
    if (note !== null) {
        request.resolution_note = note;
    }
    saveData(data);
    return request;
}
/**
 * Delete a request
 */
export function deleteRequest(id) {
    const data = loadData();
    const initialLength = data.requests.length;
    data.requests = data.requests.filter((r) => r.id !== id);
    if (data.requests.length < initialLength) {
        saveData(data);
        return true;
    }
    return false;
}
/**
 * Get statistics
 */
export function getStats() {
    const data = loadData();
    return {
        total: data.requests.length,
        pending: data.requests.filter((r) => r.status === 'pending').length,
        approved: data.requests.filter((r) => r.status === 'approved').length,
        rejected: data.requests.filter((r) => r.status === 'rejected').length
    };
}
// =============================================================================
// Storage Instance (implements interface)
// =============================================================================
export const storage = {
    getAllRequests,
    getRequestById,
    getRequestsByGroup,
    hasPendingRequest,
    createRequest,
    updateRequestStatus,
    deleteRequest,
    getStats
};
export default storage;
//# sourceMappingURL=storage.js.map