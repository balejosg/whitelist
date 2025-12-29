/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Health Reports Module
 * Handles endpoint agent health status reporting
 * Storage: PostgreSQL via Drizzle ORM
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { healthReports, machines } from '../db/schema.js';

// =============================================================================
// Types
// =============================================================================

export interface HealthReport {
    timestamp: string;
    status: string;
    dnsmasq_running: boolean | null;
    dns_resolving: boolean | null;
    fail_count: number;
    actions: string;
    version: string;
}

export interface HostData {
    reports: HealthReport[];
    lastSeen: string | null;
    currentStatus: string | null;
    version?: string;
}

export interface ReportsData {
    hosts: Record<string, HostData>;
    lastUpdated: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_REPORTS_PER_HOST = 100;

// =============================================================================
// Storage Functions (Postgres)
// =============================================================================

export async function saveHealthReport(
    hostname: string,
    reportData: Omit<HealthReport, 'timestamp'>
): Promise<void> {
    const now = new Date();

    // Insert new health report
    await db.insert(healthReports).values({
        hostname,
        status: reportData.status,
        dnsmasqRunning: reportData.dnsmasq_running === null ? null : (reportData.dnsmasq_running ? 1 : 0),
        dnsResolving: reportData.dns_resolving === null ? null : (reportData.dns_resolving ? 1 : 0),
        failCount: reportData.fail_count,
        actions: reportData.actions,
        version: reportData.version,
        reportedAt: now,
    });

    // Update machine's last_seen if it exists
    await db.update(machines)
        .set({
            lastSeen: now,
            version: reportData.version || undefined,
            updatedAt: now,
        })
        .where(eq(machines.hostname, hostname));

    // Clean up old reports (keep only MAX_REPORTS_PER_HOST per host)
    // Get IDs of reports to keep
    const reportsToKeep = await db.select({ id: healthReports.id })
        .from(healthReports)
        .where(eq(healthReports.hostname, hostname))
        .orderBy(desc(healthReports.reportedAt))
        .limit(MAX_REPORTS_PER_HOST);

    const keepIds = reportsToKeep.map((r) => r.id);

    if (keepIds.length >= MAX_REPORTS_PER_HOST) {
        // Delete older reports for this host
        await db.delete(healthReports)
            .where(sql`${healthReports.hostname} = ${hostname} AND ${healthReports.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`);
    }
}

export async function getAllReports(): Promise<ReportsData> {
    const reports = await db.select()
        .from(healthReports)
        .orderBy(desc(healthReports.reportedAt));

    // Group reports by hostname
    const hosts: Record<string, HostData> = {};
    let latestTimestamp: Date | null = null;

    for (const report of reports) {
        hosts[report.hostname] ??= {
            reports: [],
            lastSeen: null,
            currentStatus: null,
        };

        const host = hosts[report.hostname];
        const timestamp = report.reportedAt?.toISOString() ?? new Date().toISOString();

        // First report for this host is the most recent (due to ordering)
        if (host.reports.length === 0) {
            host.lastSeen = timestamp;
            host.currentStatus = report.status;
            if (report.version) {
                host.version = report.version;
            }
        }

        host.reports.push({
            timestamp,
            status: report.status,
            dnsmasq_running: report.dnsmasqRunning === null ? null : report.dnsmasqRunning === 1,
            dns_resolving: report.dnsResolving === null ? null : report.dnsResolving === 1,
            fail_count: report.failCount ?? 0,
            actions: report.actions ?? '',
            version: report.version ?? '',
        });

        // Track overall latest timestamp
        if (report.reportedAt && (!latestTimestamp || report.reportedAt > latestTimestamp)) {
            latestTimestamp = report.reportedAt;
        }
    }

    return {
        hosts,
        lastUpdated: latestTimestamp?.toISOString() ?? null,
    };
}

export async function getHostReports(hostname: string): Promise<HostData | null> {
    const reports = await db.select()
        .from(healthReports)
        .where(eq(healthReports.hostname, hostname))
        .orderBy(desc(healthReports.reportedAt))
        .limit(MAX_REPORTS_PER_HOST);

    if (reports.length === 0) {
        return null;
    }

    const firstReport = reports[0];
    const hostData: HostData = {
        reports: reports.map((report) => ({
            timestamp: report.reportedAt?.toISOString() ?? new Date().toISOString(),
            status: report.status,
            dnsmasq_running: report.dnsmasqRunning === null ? null : report.dnsmasqRunning === 1,
            dns_resolving: report.dnsResolving === null ? null : report.dnsResolving === 1,
            fail_count: report.failCount ?? 0,
            actions: report.actions ?? '',
            version: report.version ?? '',
        })),
        lastSeen: firstReport?.reportedAt?.toISOString() ?? null,
        currentStatus: firstReport?.status ?? null,
    };

    if (firstReport?.version) {
        hostData.version = firstReport.version;
    }

    return hostData;
}
