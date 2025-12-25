/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Health Reports Router
 * Receives health reports from whitelist watchdogs running on student machines.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// =============================================================================
// Constants
// =============================================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'health-reports.json');
const MAX_REPORTS_PER_HOST = 100;
const MAX_HOSTS = 500;
// =============================================================================
// Data Access
// =============================================================================
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
function initReportsFile() {
    if (!fs.existsSync(REPORTS_FILE)) {
        fs.writeFileSync(REPORTS_FILE, JSON.stringify({ hosts: {}, lastUpdated: null }));
    }
}
function loadReports() {
    initReportsFile();
    try {
        return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
    }
    catch {
        return { hosts: {}, lastUpdated: null };
    }
}
function saveReports(data) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));
}
// =============================================================================
// Middleware
// =============================================================================
function requireSharedSecret(req, res, next) {
    const secret = process.env.SHARED_SECRET;
    if (!secret) {
        next();
        return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        res.status(401).json({
            success: false,
            error: 'Invalid or missing shared secret'
        });
        return;
    }
    next();
}
function requireAdmin(req, res, next) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
        res.status(500).json({
            success: false,
            error: 'Admin token not configured'
        });
        return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
        res.status(401).json({
            success: false,
            error: 'Invalid or missing admin token'
        });
        return;
    }
    next();
}
// =============================================================================
// Router
// =============================================================================
const router = Router();
/**
 * POST /api/health-reports
 */
router.post('/', requireSharedSecret, (req, res) => {
    const { hostname, status, dnsmasq_running, dns_resolving, fail_count, actions, version } = req.body;
    if (!hostname || !status) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: hostname, status'
        });
    }
    const data = loadReports();
    const now = new Date().toISOString();
    if (!data.hosts[hostname]) {
        const hostCount = Object.keys(data.hosts).length;
        if (hostCount >= MAX_HOSTS) {
            const entries = Object.entries(data.hosts);
            const sorted = entries.sort((a, b) => new Date(a[1].lastSeen ?? 0).getTime() - new Date(b[1].lastSeen ?? 0).getTime());
            const oldest = sorted[0];
            if (oldest)
                delete data.hosts[oldest[0]];
        }
        data.hosts[hostname] = { reports: [], lastSeen: null, currentStatus: null };
    }
    const host = data.hosts[hostname];
    const report = {
        timestamp: now,
        status,
        dnsmasq_running: dnsmasq_running ?? null,
        dns_resolving: dns_resolving ?? null,
        fail_count: fail_count ?? 0,
        actions: actions ?? '',
        version: version ?? 'unknown'
    };
    host.reports.push(report);
    host.lastSeen = now;
    host.currentStatus = status;
    host.version = version ?? host.version;
    if (host.reports.length > MAX_REPORTS_PER_HOST) {
        host.reports = host.reports.slice(-MAX_REPORTS_PER_HOST);
    }
    saveReports(data);
    console.log(`[HEALTH] ${hostname}: ${status}${actions ? ` (actions: ${actions})` : ''}`);
    res.json({
        success: true,
        message: 'Health report received',
        hostname,
        status
    });
});
/**
 * GET /api/health-reports
 */
router.get('/', requireAdmin, (_req, res) => {
    const data = loadReports();
    const summary = {
        totalHosts: Object.keys(data.hosts).length,
        lastUpdated: data.lastUpdated,
        byStatus: {},
        hosts: []
    };
    for (const [hostname, host] of Object.entries(data.hosts)) {
        const status = host.currentStatus ?? 'UNKNOWN';
        summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;
        const lastReport = host.reports[host.reports.length - 1];
        summary.hosts.push({
            hostname,
            status: host.currentStatus,
            lastSeen: host.lastSeen,
            version: host.version,
            recentFailCount: lastReport?.fail_count ?? 0
        });
    }
    const statusPriority = {
        'FAIL_OPEN': 0,
        'CRITICAL': 1,
        'WARNING': 2,
        'RECOVERED': 3,
        'OK': 4
    };
    summary.hosts.sort((a, b) => (statusPriority[a.status ?? ''] ?? 5) - (statusPriority[b.status ?? ''] ?? 5));
    res.json({
        success: true,
        ...summary
    });
});
/**
 * GET /api/health-reports/alerts/active
 */
router.get('/alerts/active', requireAdmin, (req, res) => {
    const data = loadReports();
    const problemStatuses = ['FAIL_OPEN', 'CRITICAL', 'WARNING'];
    const staleThresholdMinutes = parseInt(req.query.stale_threshold) || 10;
    const now = new Date();
    const alerts = [];
    for (const [hostname, host] of Object.entries(data.hosts)) {
        const lastSeen = new Date(host.lastSeen ?? 0);
        const minutesSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000 / 60;
        if (host.currentStatus && problemStatuses.includes(host.currentStatus)) {
            alerts.push({
                hostname,
                type: 'status',
                status: host.currentStatus,
                lastSeen: host.lastSeen,
                message: `Host reporting ${host.currentStatus} status`
            });
        }
        if (minutesSinceLastSeen > staleThresholdMinutes) {
            alerts.push({
                hostname,
                type: 'stale',
                status: 'STALE',
                lastSeen: host.lastSeen,
                message: `Host hasn't reported in ${Math.round(minutesSinceLastSeen)} minutes`
            });
        }
    }
    res.json({
        success: true,
        alertCount: alerts.length,
        alerts
    });
});
/**
 * GET /api/health-reports/:hostname
 */
router.get('/:hostname', requireAdmin, (req, res) => {
    const hostname = req.params.hostname;
    if (!hostname) {
        return res.status(400).json({
            success: false,
            error: 'Hostname is required'
        });
    }
    const data = loadReports();
    if (!data.hosts[hostname]) {
        return res.status(404).json({
            success: false,
            error: 'Host not found'
        });
    }
    const host = data.hosts[hostname];
    res.json({
        success: true,
        hostname,
        currentStatus: host.currentStatus,
        lastSeen: host.lastSeen,
        version: host.version,
        reportCount: host.reports.length,
        reports: host.reports.slice(-20)
    });
});
export default router;
//# sourceMappingURL=health-reports.js.map