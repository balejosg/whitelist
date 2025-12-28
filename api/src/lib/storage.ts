/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Simple PostgreSQL storage for domain requests
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';
import type {
    DomainRequest,
    RequestStatus,
    RequestPriority
} from '../types/index.js';
import type {
    IRequestStorage,
    CreateRequestData,
    RequestStats
} from '../types/storage.js';

// =============================================================================
// Public API
// =============================================================================

export async function getAllRequests(status: RequestStatus | null = null): Promise<DomainRequest[]> {
    let sql = 'SELECT * FROM requests';
    const params: unknown[] = [];

    if (status !== null) {
        sql += ' WHERE status = $1';
        params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<DomainRequest>(sql, params);
    return result.rows;
}

export async function getRequestsByGroup(groupId: string): Promise<DomainRequest[]> {
    const result = await query<DomainRequest>(
        'SELECT * FROM requests WHERE group_id = $1 ORDER BY created_at DESC',
        [groupId]
    );
    return result.rows;
}

export async function getRequestById(id: string): Promise<DomainRequest | null> {
    const result = await query<DomainRequest>(
        'SELECT * FROM requests WHERE id = $1',
        [id]
    );
    return result.rows[0] ?? null;
}

export async function hasPendingRequest(domain: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
        `SELECT EXISTS(
            SELECT 1 FROM requests 
            WHERE LOWER(domain) = LOWER($1) 
            AND status = 'pending'
        ) as exists`,
        [domain]
    );
    return result.rows[0]?.exists ?? false;
}

export async function createRequest(requestData: CreateRequestData): Promise<DomainRequest> {
    const priority: RequestPriority = requestData.priority ?? 'normal';
    const id = `req_${uuidv4().slice(0, 8)}`;

    const result = await query<DomainRequest>(
        `INSERT INTO requests (
            id, domain, reason, requester_email, group_id, priority, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *`,
        [
            id,
            requestData.domain.toLowerCase().trim(),
            requestData.reason ?? '',
            requestData.requesterEmail ?? 'anonymous',
            requestData.groupId ?? process.env.DEFAULT_GROUP ?? 'default',
            priority
        ]
    );

    return result.rows[0]!;
}

export async function updateRequestStatus(
    id: string,
    status: 'approved' | 'rejected',
    resolvedBy = 'admin',
    note: string | null = null
): Promise<DomainRequest | null> {
    const params: unknown[] = [status, resolvedBy, id];
    let sql = `
        UPDATE requests 
        SET status = $1, 
            resolved_at = NOW(), 
            resolved_by = $2,
            updated_at = NOW()
    `;

    if (note !== null) {
        sql += ', resolution_note = $4';
        params.splice(3, 0, note);
    }

    sql += ' WHERE id = $3 RETURNING *';

    const result = await query<DomainRequest>(sql, params);
    return result.rows[0] ?? null;
}

export async function deleteRequest(id: string): Promise<boolean> {
    const result = await query(
        'DELETE FROM requests WHERE id = $1',
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function getStats(): Promise<RequestStats> {
    const result = await query<{ status: RequestStatus; count: string }>(
        'SELECT status, COUNT(*) as count FROM requests GROUP BY status'
    );

    const stats: RequestStats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0
    };

    result.rows.forEach((row) => {
        const count = parseInt(row.count, 10);
        stats.total += count;
        if (row.status === 'pending') stats.pending = count;
        if (row.status === 'approved') stats.approved = count;
        if (row.status === 'rejected') stats.rejected = count;
    });

    return stats;
}

// =============================================================================
// Storage Instance (implements interface)
// =============================================================================

export const storage: IRequestStorage = {
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
