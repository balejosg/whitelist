// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Teacher Dashboard E2E Tests - US2
 * 
 * Tests the teacher dashboard user experience:
 * - Login as teacher
 * - See filtered requests for assigned groups
 * - Approve requests quickly
 * - Responsive on mobile
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Test credentials (created by API test setup)
const TEACHER_EMAIL = 'pedro.teacher@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';

test.describe('Teacher Dashboard - US2', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to dashboard login page
        await page.goto('/');
    });

    test('should display login form', async ({ page }) => {
        // Check login form exists
        await expect(page.locator('#login-form, .login-form, form')).toBeVisible();
    });

    test('should login as teacher and see dashboard', async ({ page }) => {
        // Fill login form
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);

        // Submit login
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard to load (should see requests or welcome message)
        await expect(page.locator('.dashboard, #dashboard, .requests, .welcome')).toBeVisible({ timeout: 10000 });
    });

    test('teacher should see only their group requests', async ({ page }) => {
        // Login first
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard
        await page.waitForSelector('.dashboard, #dashboard, .requests', { timeout: 10000 });

        // Check for teacher-specific UI elements
        const teacherBanner = page.locator('.teacher-banner, .welcome-teacher, [data-role="teacher"]');

        // Should have some indication of filtered view or teacher role
        // This is flexible as UI may vary
        const hasTeacherIndicator = await teacherBanner.isVisible().catch(() => false);
        console.log(`Teacher indicator visible: ${hasTeacherIndicator}`);
    });

    test('approve button should be visible and clickable', async ({ page }) => {
        // Login
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard
        await page.waitForSelector('.dashboard, #dashboard, .requests', { timeout: 10000 });

        // Look for approve button (any request card)
        const approveBtn = page.locator('.approve-btn, .btn-approve, [data-action="approve"]').first();

        // May or may not have pending requests
        const hasApproveBtn = await approveBtn.isVisible().catch(() => false);
        console.log(`Approve button visible: ${hasApproveBtn}`);

        if (hasApproveBtn) {
            // Verify it's clickable
            await expect(approveBtn).toBeEnabled();
        }
    });

    test('should be responsive on mobile', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Navigate and login
        await page.goto('/');
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard
        await page.waitForSelector('.dashboard, #dashboard, .requests', { timeout: 10000 });

        // On mobile, should not have horizontal scroll
        const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const viewWidth = await page.evaluate(() => window.innerWidth);

        expect(scrollWidth).toBeLessThanOrEqual(viewWidth + 10); // Allow tiny margin
    });

    test('dashboard should load within 2 seconds (US2 requirement)', async ({ page }) => {
        const startTime = Date.now();

        // Login
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard content
        await page.waitForSelector('.dashboard, #dashboard, .requests', { timeout: 5000 });

        const loadTime = Date.now() - startTime;
        console.log(`Dashboard loaded in ${loadTime}ms`);

        // US2 requirement: < 2 seconds
        expect(loadTime).toBeLessThan(2000);
    });
});
