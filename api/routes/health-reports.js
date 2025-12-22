/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Health Reports Router
 * 
 * Receives health reports from whitelist watchdogs running on student machines.
 * Stores reports for monitoring and alerting.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'health-reports.json');
const MAX_REPORTS_PER_HOST = 100;  // Keep last 100 reports per host
const MAX_HOSTS = 500;  // Maximum number of hosts to track

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize reports file
function initReportsFile() {
    if (!fs.existsSync(REPORTS_FILE)) {
        fs.writeFileSync(REPORTS_FILE, JSON.stringify({ hosts: {}, lastUpdated: null }));
    }
}

// Load reports
function loadReports() {
    initReportsFile();
    try {
        return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
    } catch {
        return { hosts: {}, lastUpdated: null };
    }
}

// Save reports
function saveReports(data) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));
}

// Authenticate with shared secret
function requireSharedSecret(req, res, next) {
    const secret = process.env.SHARED_SECRET;
    if (!secret) {
        // If no secret configured, allow all (for dev)
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing shared secret'
        });
    }
    next();
}

// Require admin token
function requireAdmin(req, res, next) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
        return res.status(500).json({
            success: false,
            error: 'Admin token not configured'
        });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing admin token'
        });
    }
    next();
}

/**
 * POST /api/health-reports
 * Submit a health report from a student machine
 * 
 * Body: {
 *   hostname: string,
 *   status: "OK" | "WARNING" | "CRITICAL" | "FAIL_OPEN" | "RECOVERED",
 *   dnsmasq_running: boolean,
 *   dns_resolving: boolean,
 *   fail_count: number,
 *   actions: string,
 *   version: string
 * }
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

    // Initialize host if new
    if (!data.hosts[hostname]) {
        // Check max hosts limit
        const hostCount = Object.keys(data.hosts).length;
        if (hostCount >= MAX_HOSTS) {
            // Remove oldest host
            const oldest = Object.entries(data.hosts)
                .sort((a, b) => new Date(a[1].lastSeen) - new Date(b[1].lastSeen))[0];
            if (oldest) delete data.hosts[oldest[0]];
        }
        data.hosts[hostname] = { reports: [], lastSeen: null, currentStatus: null };
    }

    const host = data.hosts[hostname];

    // Add report
    const report = {
        timestamp: now,
        status,
        dnsmasq_running: dnsmasq_running ?? null,
        dns_resolving: dns_resolving ?? null,
        fail_count: fail_count ?? 0,
        actions: actions || '',
        version: version || 'unknown'
    };

    host.reports.push(report);
    host.lastSeen = now;
    host.currentStatus = status;
    host.version = version || host.version;

    // Trim old reports
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
 * List all hosts and their current status (admin only)
 */
router.get('/', requireAdmin, (req, res) => {
    const data = loadReports();

    const summary = {
        totalHosts: Object.keys(data.hosts).length,
        lastUpdated: data.lastUpdated,
        byStatus: {},
        hosts: []
    };

    for (const [hostname, host] of Object.entries(data.hosts)) {
        const status = host.currentStatus || 'UNKNOWN';
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

        summary.hosts.push({
            hostname,
            status: host.currentStatus,
            lastSeen: host.lastSeen,
            version: host.version,
            recentFailCount: host.reports.length > 0
                ? host.reports[host.reports.length - 1].fail_count
                : 0
        });
    }

    // Sort by status priority (problems first)
    const statusPriority = { 'FAIL_OPEN': 0, 'CRITICAL': 1, 'WARNING': 2, 'RECOVERED': 3, 'OK': 4 };
    summary.hosts.sort((a, b) =>
        (statusPriority[a.status] ?? 5) - (statusPriority[b.status] ?? 5)
    );

    res.json({
        success: true,
        ...summary
    });
});

/**
 * GET /api/health-reports/:hostname
 * Get detailed history for a specific host (admin only)
 */
router.get('/:hostname', requireAdmin, (req, res) => {
    const { hostname } = req.params;
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
        reports: host.reports.slice(-20)  // Last 20 reports
    });
});

/**
 * GET /api/health-reports/alerts/active
 * Get hosts with problems (admin only)
 */
router.get('/alerts/active', requireAdmin, (req, res) => {
    const data = loadReports();
    const problemStatuses = ['FAIL_OPEN', 'CRITICAL', 'WARNING'];
    const staleThresholdMinutes = parseInt(req.query.stale_threshold) || 10;
    const now = new Date();

    const alerts = [];

    for (const [hostname, host] of Object.entries(data.hosts)) {
        const lastSeen = new Date(host.lastSeen);
        const minutesSinceLastSeen = (now - lastSeen) / 1000 / 60;

        // Check for problem status
        if (problemStatuses.includes(host.currentStatus)) {
            alerts.push({
                hostname,
                type: 'status',
                status: host.currentStatus,
                lastSeen: host.lastSeen,
                message: `Host reporting ${host.currentStatus} status`
            });
        }

        // Check for stale hosts (haven't reported in X minutes)
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

module.exports = router;
