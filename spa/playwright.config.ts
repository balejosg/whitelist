import { defineConfig, devices } from '@playwright/test';

/**
 * OpenPath SPA - Playwright E2E Configuration
 *
 * Tests require:
 * - API server running on port 3001
 * - SPA served (can use simple http-server or the API serves static files)
 */
export default defineConfig({
    testDir: './e2e',

    // Run tests in parallel
    fullyParallel: true,

    // Fail on CI if you accidentally left test.only
    forbidOnly: !!process.env.CI,

    // Retry on CI only
    retries: process.env.CI ? 2 : 0,

    // Opt out of parallel tests on CI - they can be flaky
    workers: process.env.CI ? 1 : undefined,

    // Reporter
    reporter: process.env.CI ? 'github' : 'html',

    // Shared settings for all projects
    use: {
        // Base URL for navigation
        baseURL: process.env.BASE_URL ?? 'http://localhost:3001',

        // Collect trace on first retry
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure (for debugging)
        video: 'retain-on-failure',
    },

    // Configure projects for different browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Mobile viewport for responsive tests
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],

    // Run local server before tests (skip in CI where workflow starts it)
    webServer: process.env.CI ? undefined : {
        command: 'cd ../api && npm start',
        url: 'http://localhost:3001/api',
        reuseExistingServer: true,
        timeout: 120 * 1000,
    },
});
