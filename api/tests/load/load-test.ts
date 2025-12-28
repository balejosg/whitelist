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

// @ts-ignore - k6 typing
import http from 'k6/http';
// @ts-ignore - k6 typing
import { check, sleep } from 'k6';
// @ts-ignore - k6 typing
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency');
const requestsLatency = new Trend('requests_latency');

// Configuration
// @ts-ignore - k6 typing
const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export const options = {
    // @ts-ignore - k6 typing
    vus: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS) : 10,
    // @ts-ignore - k6 typing
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
export function setup(): { baseUrl: string; timestamp: number } {
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
export default function (data: { baseUrl: string }): void {
    // Scenario 1: Health check (40% of traffic)
    if (Math.random() < 0.4) {
        testHealthEndpoint(data);
        return;
    }

    // Scenario 2: List requests (30% of traffic)
    if (Math.random() < 0.5) {
        testListRequests(data);
        return;
    }

    // Scenario 3: Create request (30% of traffic)
    testCreateRequest(data);
}

/**
 * Test /health endpoint
 */
function testHealthEndpoint(data: { baseUrl: string }): void {
    const start = Date.now();
    const res = http.get(`${data.baseUrl}/health`);
    healthLatency.add(Date.now() - start);

    const success = check(res, {
        'health: status is 200': (r: any) => r.status === 200,
        'health: has status field': (r: any) => {
            try {
                const body = JSON.parse(r.body as string);
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
function testListRequests(data: { baseUrl: string }): void {
    const start = Date.now();
    const res = http.get(`${data.baseUrl}/api/requests`, {
        headers: {
            'Content-Type': 'application/json',
        },
    });
    requestsLatency.add(Date.now() - start);

    const success = check(res, {
        'list: status is 200 or 401': (r: any) => r.status === 200 || r.status === 401,
        'list: response is JSON': (r: any) => {
            try {
                JSON.parse(r.body as string);
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
function testCreateRequest(data: { baseUrl: string }): void {
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
        'create: status is 200, 201, or 401': (r: any) => [200, 201, 401].includes(r.status),
        'create: response time OK': (r: any) => r.timings.duration < 1000,
    });

    errorRate.add(!success);
    sleep(0.3);
}

/**
 * Rate limiting test scenario
 */
export function rateLimitTest(data: { baseUrl: string }): void {
    // Burst of requests to test rate limiting
    for (let i = 0; i < 20; i++) {
        const res = http.get(`${data.baseUrl}/health`);
        check(res, {
            'rate limit: not server error': (r: any) => r.status < 500,
        });
    }
    sleep(1);
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data: { timestamp: number }): void {
    console.log(`Test completed. Started at: ${new Date(data.timestamp).toISOString()}`);
}
