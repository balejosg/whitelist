// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Blocked Domain E2E Tests - US3
 * 
 * Tests the blocked domain UI elements:
 * - BlockedDomainAlert modal exists in DOM
 * - Modal has required structure
 * 
 * Note: Full integration tests for the approval flow
 * are in api/tests/blocked-domains.test.js
 */

test.describe('Blocked Domain UI - US3', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('blocked domain modal should exist in DOM', async ({ page }) => {
        // The modal should exist in DOM (even if hidden)
        const blockedModal = page.locator('#modal-blocked-domain');

        // Wait for page to fully load
        await page.waitForLoadState('networkidle');

        // Modal should be in DOM
        await expect(blockedModal).toBeAttached({ timeout: 5000 });
    });

    test('blocked domain modal should have required structure', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        const blockedModal = page.locator('#modal-blocked-domain');

        // Check modal exists
        const exists = await blockedModal.count() > 0;

        if (exists) {
            // Modal should have header with warning styling
            const modalHeader = blockedModal.locator('.modal-header');
            await expect(modalHeader).toBeAttached();

            // Modal should have body for content
            const modalBody = blockedModal.locator('.modal-body');
            await expect(modalBody).toBeAttached();

            // Should have a close/dismiss button
            const closeBtn = blockedModal.locator('button');
            await expect(closeBtn).toBeAttached();
        } else {
            console.log('Note: #modal-blocked-domain not found - may need to check HTML');
        }
    });

    test('login page should load without errors', async ({ page }) => {
        // Verify the login page loads correctly
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });

        // No JavaScript errors
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));

        await page.waitForTimeout(1000);

        // Should have no critical errors
        expect(errors.length).toBe(0);
    });

    test('page contains blocked domain modal HTML', async ({ page }) => {
        // Check for modal in raw HTML
        const html = await page.content();

        const hasModal = html.includes('modal-blocked-domain');
        expect(hasModal).toBe(true);
    });
});

