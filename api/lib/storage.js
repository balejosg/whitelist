/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Simple JSON file storage for domain requests
 * Stores requests in data/requests.json
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize empty requests file if not exists
if (!fs.existsSync(REQUESTS_FILE)) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify({ requests: [] }, null, 2));
}

/**
 * Load all requests from file
 * @returns {Object} { requests: Array }
 */
function loadData() {
    try {
        const data = fs.readFileSync(REQUESTS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading requests:', error);
        return { requests: [] };
    }
}

/**
 * Save data to file
 * @param {Object} data 
 */
function saveData(data) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get all requests, optionally filtered by status
 * @param {string|null} status - 'pending', 'approved', 'rejected', or null for all
 * @returns {Array}
 */
export function getAllRequests(status = null) {
    const data = loadData();
    if (status) {
        return data.requests.filter(r => r.status === status);
    }
    return data.requests;
}

/**
 * Get a single request by ID
 * @param {string} id 
 * @returns {Object|null}
 */
export function getRequestById(id) {
    const data = loadData();
    return data.requests.find(r => r.id === id) || null;
}

/**
 * Check if domain already has a pending request
 * @param {string} domain 
 * @returns {boolean}
 */
export function hasPendingRequest(domain) {
    const data = loadData();
    return data.requests.some(
        r => r.domain.toLowerCase() === domain.toLowerCase() && r.status === 'pending'
    );
}

/**
 * Create a new domain request
 * @param {Object} requestData - { domain, reason, requesterEmail, groupId, priority }
 * @returns {Object} - The created request
 */
export function createRequest(requestData) {
    const data = loadData();

    const newRequest = {
        id: `req_${uuidv4().slice(0, 8)}`,
        domain: requestData.domain.toLowerCase().trim(),
        reason: requestData.reason || '',
        requester_email: requestData.requesterEmail || 'anonymous',
        group_id: requestData.groupId || process.env.DEFAULT_GROUP || 'default',
        priority: requestData.priority || 'normal',
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
 * @param {string} id 
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} resolvedBy - Who resolved it
 * @param {string} note - Optional note
 * @returns {Object|null}
 */
export function updateRequestStatus(id, status, resolvedBy = 'admin', note = null) {
    const data = loadData();
    const index = data.requests.findIndex(r => r.id === id);

    if (index === -1) {
        return null;
    }

    data.requests[index].status = status;
    data.requests[index].updated_at = new Date().toISOString();
    data.requests[index].resolved_at = new Date().toISOString();
    data.requests[index].resolved_by = resolvedBy;

    if (note) {
        data.requests[index].resolution_note = note;
    }

    saveData(data);
    return data.requests[index];
}

/**
 * Delete a request
 * @param {string} id 
 * @returns {boolean}
 */
export function deleteRequest(id) {
    const data = loadData();
    const initialLength = data.requests.length;
    data.requests = data.requests.filter(r => r.id !== id);

    if (data.requests.length < initialLength) {
        saveData(data);
        return true;
    }
    return false;
}

/**
 * Get statistics
 * @returns {Object}
 */
export function getStats() {
    const data = loadData();
    return {
        total: data.requests.length,
        pending: data.requests.filter(r => r.status === 'pending').length,
        approved: data.requests.filter(r => r.status === 'approved').length,
        rejected: data.requests.filter(r => r.status === 'rejected').length
    };
}
