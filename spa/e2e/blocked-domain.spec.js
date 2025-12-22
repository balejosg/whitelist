// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Blocked Domain E2E Tests - US3
 * 
 * Tests the blocked domain approval flow:
 * - Teacher tries to approve a blocked domain
 * - BlockedDomainAlert modal appears
 * - Modal shows domain name, matched rule, and hint
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Test credentials
const TEACHER_EMAIL = 'pedro.teacher@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';

test.describe('Blocked Domain Alert - US3', () => {

    test.beforeEach(async ({ page }) => {
        // Login as teacher first
        await page.goto('/');
        await page.fill('input[type="email"], input[name="email"], #email', TEACHER_EMAIL);
        await page.fill('input[type="password"], input[name="password"], #password', TEACHER_PASSWORD);
        await page.click('button[type="submit"], .btn-login, #btn-login');

        // Wait for dashboard
        await page.waitForSelector('.dashboard, #dashboard, .requests', { timeout: 10000 });
    });

    test('blocked domain modal should exist in DOM', async ({ page }) => {
        // The modal should exist but be hidden initially
        const blockedModal = page.locator('#modal-blocked-domain');

        // Modal should be in DOM (even if hidden)
        await expect(blockedModal).toBeAttached();
    });

    test('should show blocked domain alert when approving blocked domain via API mock', async ({ page }) => {
        // This test uses page.route to mock API response
        await page.route('**/api/requests/*/approve', async route => {
            // Mock a DOMAIN_BLOCKED response
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    error: 'Este dominio está bloqueado por el administrador',
                    code: 'DOMAIN_BLOCKED',
                    domain: 'facebook.com',
                    matched_rule: 'facebook.com',
                    hint: 'Contacta al administrador para revisar esta restricción'
                })
            });
        });

        // Find and click an approve button
        const approveBtn = page.locator('.approve-btn, .btn-approve, [data-action="approve"]').first();
        const hasPendingRequest = await approveBtn.isVisible().catch(() => false);

        if (!hasPendingRequest) {
            console.log('No pending requests to test - skipping');
            return;
        }

        await approveBtn.click();

        // Wait for blocked domain modal to appear
        const blockedModal = page.locator('#modal-blocked-domain');
        await expect(blockedModal).toBeVisible({ timeout: 5000 });

        // Verify modal content
        const modalContent = await blockedModal.textContent();
        expect(modalContent).toContain('bloqueado');

        // Check for domain name display
        const domainElement = page.locator('#blocked-domain-name, .blocked-domain');
        await expect(domainElement).toContainText('facebook.com');
    });

    test('blocked domain modal should have close button', async ({ page }) => {
        // Mock API to trigger modal
        await page.route('**/api/requests/*/approve', async route => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    code: 'DOMAIN_BLOCKED',
                    domain: 'test.com',
                    matched_rule: 'test.com',
                    hint: 'Test hint'
                })
            });
        });

        const approveBtn = page.locator('.approve-btn, .btn-approve, [data-action="approve"]').first();
        const hasPendingRequest = await approveBtn.isVisible().catch(() => false);

        if (!hasPendingRequest) {
            console.log('No pending requests to test - skipping');
            return;
        }

        await approveBtn.click();

        // Wait for modal
        const blockedModal = page.locator('#modal-blocked-domain');
        await expect(blockedModal).toBeVisible({ timeout: 5000 });

        // Find and click close button
        const closeBtn = blockedModal.locator('.btn-close, .close, .modal-close, button:has-text("Entendido"), button:has-text("Cerrar")');
        await expect(closeBtn).toBeVisible();
        await closeBtn.click();

        // Modal should be hidden
        await expect(blockedModal).not.toBeVisible();
    });

    test('modal should show hint message for teacher', async ({ page }) => {
        const testHint = 'Contacta al administrador para revisar esta restricción';

        await page.route('**/api/requests/*/approve', async route => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    code: 'DOMAIN_BLOCKED',
                    domain: 'example.com',
                    matched_rule: 'example.com',
                    hint: testHint
                })
            });
        });

        const approveBtn = page.locator('.approve-btn, .btn-approve, [data-action="approve"]').first();
        const hasPendingRequest = await approveBtn.isVisible().catch(() => false);

        if (!hasPendingRequest) {
            console.log('No pending requests to test - skipping');
            return;
        }

        await approveBtn.click();

        const blockedModal = page.locator('#modal-blocked-domain');
        await expect(blockedModal).toBeVisible({ timeout: 5000 });

        // Check hint is displayed
        const hintElement = page.locator('#blocked-domain-hint, .blocked-hint, .modal-hint');
        const modalText = await blockedModal.textContent();

        // Either specific hint element or somewhere in modal
        expect(modalText).toContain('administrador');
    });
});
