/**
 * OpenPath API Load Tests
 * 
 * Run with: k6 run load-test.js
 * 
 * Options:
 *   K6_BASE_URL - API base URL (default: http://localhost:3000)
 *   K6_VUS - Number of virtual users (default: 10)
 *   K6_DURATION - Test duration (default: 30s)
 * 
 * Example:
 *   K6_BASE_URL=http://api.example.com k6 run load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency');
const requestsLatency = new Trend('requests_latency');

// Configuration
const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export const options = {
    vus: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS) : 10,
    duration: __ENV.K6_DURATION || '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
        errors: ['rate<0.1'],              // Error rate under 10%
        health_latency: ['p(99)<100'],     // Health endpoint under 100ms
    },
};

/**
 * Setup function - runs once before test
 */
export function setup() {
    // Verify API is reachable
    const healthRes = http.get(`${BASE_URL}/health`);
    if (healthRes.status !== 200) {
        throw new Error(`API not reachable at ${BASE_URL}`);
    }

    return {
        baseUrl: BASE_URL,
        timestamp: Date.now(),
    };
}

/**
 * Default test scenario
 */
export default function (data) {
    // Scenario 1: Health check (40% of traffic)
    if (Math.random() < 0.4) {
        testHealthEndpoint(data);
        return;
    }

    if (Math.random() < 0.5) {
        testConfigEndpoint(data);
        return;
    }

    testHealthEndpoint(data);
}

function testConfigEndpoint(data) {
    const start = Date.now();
    const res = http.get(`${data.baseUrl}/api/config`);
    requestsLatency.add(Date.now() - start);

    const success = check(res, {
        'config: status is 200': (r) => r.status === 200,
        'config: has googleClientId': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.googleClientId !== undefined;
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    sleep(0.2);
}

    // Scenario 3: Create request (30% of traffic)
    testCreateRequest(data);
}

/**
 * Test /health endpoint
 */
function testHealthEndpoint(data) {
    const start = Date.now();
    const res = http.get(`${data.baseUrl}/health`);
    healthLatency.add(Date.now() - start);

    const success = check(res, {
        'health: status is 200': (r) => r.status === 200,
        'health: has status field': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.status !== undefined;
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    sleep(0.1);
}

/**
 * Test GET /api/requests endpoint
 */
function testListRequests(data) {
    const start = Date.now();
    const res = http.get(`${data.baseUrl}/api/requests`, {
        headers: {
            'Content-Type': 'application/json',
        },
    });
    requestsLatency.add(Date.now() - start);

    const success = check(res, {
        'list: status is 200 or 401': (r) => r.status === 200 || r.status === 401,
        'list: response is JSON': (r) => {
            try {
                JSON.parse(r.body);
                return true;
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    sleep(0.2);
}

/**
 * Test POST /api/requests endpoint
 */
function testCreateRequest(data) {
    const domain = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.example.com`;

    const payload = JSON.stringify({
        domain: domain,
        reason: 'Load test request',
    });

    const start = Date.now();
    const res = http.post(`${data.baseUrl}/api/requests`, payload, {
        headers: {
            'Content-Type': 'application/json',
        },
    });
    requestsLatency.add(Date.now() - start);

    const success = check(res, {
        'create: status is 200, 201, or 401': (r) => [200, 201, 401].includes(r.status),
        'create: response time OK': (r) => r.timings.duration < 1000,
    });

    errorRate.add(!success);
    sleep(0.3);
}

/**
 * Rate limiting test scenario
 */
export function rateLimitTest(data) {
    // Burst of requests to test rate limiting
    for (let i = 0; i < 20; i++) {
        const res = http.get(`${data.baseUrl}/health`);
        check(res, {
            'rate limit: not server error': (r) => r.status < 500,
        });
    }
    sleep(1);
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
    console.log(`Test completed. Started at: ${new Date(data.timestamp).toISOString()}`);
}
