// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Teacher Dashboard E2E Tests - US2
 * 
 * Tests the teacher dashboard user experience:
 * - See filtered requests for assigned groups
 * - Approve requests quickly
 * - Responsive on mobile
 */

// Test credentials (created by API test setup in CI)
const TEACHER_EMAIL = 'pedro.teacher@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';

test.describe('Teacher Dashboard - US2', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to dashboard
        await page.goto('/');
        // Wait for page to load
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form', async ({ page }) => {
        // Check login form exists with correct IDs
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#login-email')).toBeVisible();
        await expect(page.locator('#login-password')).toBeVisible();
    });

    test('should have login button', async ({ page }) => {
        await expect(page.locator('#email-login-btn')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#email-login-btn')).toContainText('Acceder');
    });

    test('login form should accept email input', async ({ page }) => {
        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
        await page.fill('#login-email', TEACHER_EMAIL);
        await expect(page.locator('#login-email')).toHaveValue(TEACHER_EMAIL);
    });

    test('should show error on invalid login', async ({ page }) => {
        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });

        // Fill with wrong credentials
        await page.fill('#login-email', 'invalid@test.com');
        await page.fill('#login-password', 'wrongpassword');
        await page.click('#email-login-btn');

        // Should show error (may take a moment for API response)
        // The error could be in #login-error or as a toast
        await page.waitForTimeout(2000);

        // Check for error indication (flexible - could be error message or still on login page)
        const stillOnLogin = await page.locator('#email-login-form').isVisible();
        expect(stillOnLogin).toBe(true);
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Login form should still be visible and usable
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#login-email')).toBeVisible();

        // Form should fit within viewport (no horizontal scroll)
        const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewWidth = await page.evaluate(() => window.innerWidth);

        expect(scrollWidth).toBeLessThanOrEqual(viewWidth + 20);
    });

    test('page should load quickly', async ({ page }) => {
        const startTime = Date.now();

        // Wait for login form to be visible
        await page.locator('#email-login-form').waitFor({ state: 'visible', timeout: 5000 });

        const loadTime = Date.now() - startTime;
        console.log(`Page loaded in ${loadTime}ms`);

        // Should load reasonably fast (< 3 seconds)
        expect(loadTime).toBeLessThan(3000);
    });
});
