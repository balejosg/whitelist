
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'health-reports.json');
const MAX_REPORTS_PER_HOST = 100;
const MAX_HOSTS = 500;

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

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initReportsFile(): void {
    if (!fs.existsSync(REPORTS_FILE)) {
        fs.writeFileSync(REPORTS_FILE, JSON.stringify({ hosts: {}, lastUpdated: null }));
    }
}

function loadReports(): ReportsData {
    initReportsFile();
    try {
        return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')) as ReportsData;
    } catch {
        return { hosts: {}, lastUpdated: null };
    }
}

function saveReports(data: ReportsData): void {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));
}

export function saveHealthReport(hostname: string, reportData: Omit<HealthReport, 'timestamp'>): void {
    const data = loadReports();
    const now = new Date().toISOString();

    if (!data.hosts[hostname]) {
        const hostCount = Object.keys(data.hosts).length;
        if (hostCount >= MAX_HOSTS) {
            const entries = Object.entries(data.hosts);
            const sorted = entries.sort((a, b) =>
                new Date(a[1].lastSeen ?? 0).getTime() - new Date(b[1].lastSeen ?? 0).getTime()
            );
            const oldest = sorted[0];
            if (oldest) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete data.hosts[oldest[0]];
            }
        }
        data.hosts[hostname] = { reports: [], lastSeen: null, currentStatus: null };
    }

    const host = data.hosts[hostname];

    const report: HealthReport = {
        ...reportData,
        timestamp: now,
    };

    host.reports.push(report);
    host.lastSeen = now;
    host.currentStatus = report.status;
    if (report.version) {
        host.version = report.version;
    }

    if (host.reports.length > MAX_REPORTS_PER_HOST) {
        host.reports = host.reports.slice(-MAX_REPORTS_PER_HOST);
    }

    saveReports(data);
}

export function getAllReports(): ReportsData {
    return loadReports();
}

export function getHostReports(hostname: string): HostData | null {
    const data = loadReports();
    return data.hosts[hostname] ?? null;
}
