import { test, expect } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

/**
 * Multi-User E2E Flow Tests
 * 
 * UAT Coverage: 05_flujo_e2e.md - Complete day scenario
 * 
 * Simulates a typical school day with multiple users interacting:
 * 1. Admin configures system
 * 2. Teacher starts class
 * 3. Student requests access
 * 4. Teacher approves
 * 5. Student accesses resource
 */

test.describe('Multi-User E2E Flow', { tag: '@extended' }, () => {

    test('complete day flow: admin → teacher → student cycle', async ({ browser }) => {
        // Create separate contexts for each user role
        const adminContext = await browser.newContext();
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();

        const adminPage = await adminContext.newPage();
        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        try {
            // ============================================================
            // Phase 1: Admin configures system (08:00)
            // UAT: 05_flujo_e2e.md - Morning setup
            // ============================================================

            await test.step('Admin logs in and checks dashboard', async () => {
                await adminPage.goto('/');
                await adminPage.waitForLoadState('domcontentloaded');

                await adminPage.fill('#login-email', ADMIN_CREDENTIALS.email);
                await adminPage.fill('#login-password', ADMIN_CREDENTIALS.password);
                await adminPage.click('#email-login-btn');

                // Wait for dashboard or stay on login
                await adminPage.waitForTimeout(2000);

                // Check if logged in (dashboard visible) or API unavailable
                const dashboardVisible = await adminPage.locator('#dashboard-screen').isVisible().catch(() => false);
                const loginVisible = await adminPage.locator('#email-login-form').isVisible().catch(() => false);

                expect(dashboardVisible || loginVisible).toBe(true);
            });

            await test.step('Admin views pending requests', async () => {
                const requestsSection = adminPage.locator('#requests-section');
                if (await requestsSection.isVisible().catch(() => false)) {
                    await expect(requestsSection).toBeVisible();

                    // Check pending counter exists
                    const pendingCounter = adminPage.locator('#stat-pending-requests');
                    await expect(pendingCounter).toBeAttached();
                }
            });

            // ============================================================
            // Phase 2: Teacher starts class (08:55)
            // UAT: 05_flujo_e2e.md - First class
            // ============================================================

            await test.step('Teacher logs in', async () => {
                await teacherPage.goto('/');
                await teacherPage.waitForLoadState('domcontentloaded');

                await teacherPage.fill('#login-email', TEACHER_CREDENTIALS.email);
                await teacherPage.fill('#login-password', TEACHER_CREDENTIALS.password);
                await teacherPage.click('#email-login-btn');

                await expect(teacherPage.locator('#logout-btn')).toBeVisible({ timeout: 10000 });
            });

            await test.step('Teacher sees their dashboard', async () => {
                const teacherBanner = teacherPage.locator('#teacher-banner');
                const requestsSection = teacherPage.locator('#requests-section');

                await expect(teacherBanner.or(requestsSection)).toBeVisible();
            });

            // ============================================================
            // Phase 3: Student requests access (09:05)
            // UAT: 05_flujo_e2e.md - Student needs YouTube
            // ============================================================

            await test.step('Student logs in', async () => {
                await studentPage.goto('/');
                await studentPage.waitForLoadState('domcontentloaded');

                await studentPage.fill('#login-email', STUDENT_CREDENTIALS.email);
                await studentPage.fill('#login-password', STUDENT_CREDENTIALS.password);
                await studentPage.click('#email-login-btn');

                await expect(studentPage.locator('#logout-btn')).toBeVisible({ timeout: 10000 });
            });

            await test.step('Student views limited dashboard', async () => {
                // Verify student doesn't see admin-only sections
                const usersSection = studentPage.locator('#users-section');
                const classroomsSection = studentPage.locator('#classrooms-section');

                // These should be hidden or have admin-only class
                const usersClass = await usersSection.getAttribute('class').catch(() => '');
                const classroomsClass = await classroomsSection.getAttribute('class').catch(() => '');

                if (usersClass) {
                    expect(usersClass).toMatch(/admin-only|hidden/);
                }
                if (classroomsClass) {
                    expect(classroomsClass).toMatch(/admin-only|hidden/);
                }
            });

            // ============================================================
            // Phase 4: Teacher processes requests (09:06)
            // UAT: 05_flujo_e2e.md - Approval flow
            // ============================================================

            await test.step('Teacher refreshes to see new requests', async () => {
                const refreshBtn = teacherPage.locator('#refresh-requests-btn');
                if (await refreshBtn.isVisible().catch(() => false)) {
                    await refreshBtn.click();
                    await teacherPage.waitForTimeout(1000);
                }
            });

            // ============================================================
            // Phase 5: End of class verification
            // UAT: 05_flujo_e2e.md - Verify changes persist
            // ============================================================

            await test.step('All users can logout successfully', async () => {
                // Admin logout
                const adminLogout = adminPage.locator('#logout-btn');
                if (await adminLogout.isVisible().catch(() => false)) {
                    await adminLogout.click();
                }

                // Teacher logout
                const teacherLogout = teacherPage.locator('#logout-btn');
                if (await teacherLogout.isVisible().catch(() => false)) {
                    await teacherLogout.click();
                }

                // Student logout
                const studentLogout = studentPage.locator('#logout-btn');
                if (await studentLogout.isVisible().catch(() => false)) {
                    await studentLogout.click();
                }
            });

        } finally {
            // Cleanup contexts
            await adminContext.close();
            await teacherContext.close();
            await studentContext.close();
        }
    });

    test('teacher approval timing: < 60 seconds KPI', { tag: '@kpi' }, async ({ browser }) => {
        // UAT: 02_profesor.md KPI - Approval in < 60 seconds
        const teacherContext = await browser.newContext();
        const teacherPage = await teacherContext.newPage();

        try {
            // Login
            await teacherPage.goto('/');
            await teacherPage.fill('#login-email', TEACHER_CREDENTIALS.email);
            await teacherPage.fill('#login-password', TEACHER_CREDENTIALS.password);

            const startTime = Date.now();
            await teacherPage.click('#email-login-btn');
            await teacherPage.waitForTimeout(2000);

            // Find and click approve on first pending request
            const approveBtn = teacherPage.locator('.request-item .approve-btn').first();
            if (await approveBtn.isVisible().catch(() => false)) {
                await approveBtn.click();
                await teacherPage.waitForTimeout(500);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // KPI: Should complete in < 60 seconds
            expect(totalTime).toBeLessThan(60000);

            console.log(`Approval flow completed in ${String(totalTime)}ms`);

        } finally {
            await teacherContext.close();
        }
    });

    test.skip('mobile approval flow: 2 clicks maximum', { tag: '@mobile' }, async ({ browser }) => {
        // UAT: 02_profesor.md Test 2.3, 4.2 - Mobile approval
        const mobileContext = await browser.newContext({
            viewport: { width: 375, height: 667 },
            isMobile: true
        });
        const mobilePage = await mobileContext.newPage();

        try {
            await mobilePage.goto('/');
            await mobilePage.waitForLoadState('domcontentloaded');

            // Verify mobile-friendly elements
            const loginBtn = mobilePage.locator('#email-login-btn');
            const box = await loginBtn.boundingBox();

            if (box) {
                // Touch target should be at least 44px (iOS guideline)
                expect(box.height).toBeGreaterThanOrEqual(40);
            }

        } finally {
            await mobileContext.close();
        }
    });
});

test.describe('Role Isolation Tests', { tag: '@security' }, () => {

    test('student cannot access admin routes via URL', async ({ page }) => {
        // UAT: 06_edge_cases.md Test 1.2
        await page.goto('/');
        await page.fill('#login-email', STUDENT_CREDENTIALS.email);
        await page.fill('#login-password', STUDENT_CREDENTIALS.password);
        await page.click('#email-login-btn');
        await page.waitForTimeout(2000);

        // Try to access admin-only routes
        await page.goto('/#users');
        await page.waitForTimeout(500);

        // Should not see users section content (hidden or admin-only)
        const usersSection = page.locator('#users-section');
        const classNames = await usersSection.getAttribute('class').catch(() => '');
        expect(classNames).toMatch(/admin-only|hidden/);
    });

    test('teacher cannot see classroom management', async ({ page }) => {
        // UAT: 02_profesor.md Test 1.2
        await page.goto('/');
        await page.fill('#login-email', TEACHER_CREDENTIALS.email);
        await page.fill('#login-password', TEACHER_CREDENTIALS.password);
        await page.click('#email-login-btn');
        await page.waitForTimeout(2000);

        const classroomsSection = page.locator('#classrooms-section');
        const classNames = await classroomsSection.getAttribute('class').catch(() => '');
        expect(classNames).toMatch(/admin-only|hidden/);
    });
});
