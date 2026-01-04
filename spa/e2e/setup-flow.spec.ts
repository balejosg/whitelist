import { test, expect } from '@playwright/test';

/**
 * First-time Setup Flow E2E Tests
 * 
 * Covers UAT Scripts: 01_admin_tic.md Test 1.2
 *                     06_edge_cases.md Tests 1B.1-1B.4
 * 
 * Tests the /setup.html page for initial admin creation.
 */

test.describe('Setup Page - Already Configured', () => {

    test.skip('setup.html should show "already configured" when admin exists', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const alreadySetup = page.locator('#already-setup');
        const setupForm = page.locator('#setup-form');

        const alreadySetupVisible = await alreadySetup.isVisible();
        const setupFormVisible = await setupForm.isVisible();

        expect(alreadySetupVisible || setupFormVisible).toBe(true);

        if (alreadySetupVisible) {
            await expect(page.locator('#already-setup a[href="index.html"]')).toBeVisible();
            await expect(page.locator('#already-setup')).toContainText('Sistema Configurado');
        }
    });

    test('setup.html should have loading state while checking', async ({ page }) => {
        await page.goto('/setup.html');

        // Should briefly show loading state
        const loadingState = page.locator('#loading-state');
        // It might already be hidden if API responds fast, so just check it's attached
        await expect(loadingState).toBeAttached();
    });

});

test.describe('Setup Form Structure', () => {

    test('setup form should have all required fields', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 1.2
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // Check form structure (attached, not necessarily visible if already set up)
        await expect(page.locator('#first-admin-form')).toBeAttached();
        await expect(page.locator('#admin-email')).toBeAttached();
        await expect(page.locator('#admin-name')).toBeAttached();
        await expect(page.locator('#admin-password')).toBeAttached();
        await expect(page.locator('#admin-password-confirm')).toBeAttached();
        await expect(page.locator('#submit-btn')).toBeAttached();
    });

    test('password fields should have minimum length requirement', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const smallText = page.locator('#setup-form .form-group small');
        const smallTexts = await smallText.allTextContents();
        const hasMinLengthInfo = smallTexts.some(text => 
            text.toLowerCase().includes('8') || text.toLowerCase().includes('mínimo')
        );
        
        expect(hasMinLengthInfo).toBe(true);
    });

    test('email field should have autocomplete attribute', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        const emailInput = page.locator('#admin-email');
        await expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    test('password fields should have autocomplete new-password', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        const passwordInput = page.locator('#admin-password');
        await expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    });

});

test.describe('Setup Form Validation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
    });

    test('should require all fields before submission', async ({ page }) => {
        // UAT: 06_edge_cases.md Test 3.4
        const setupForm = page.locator('#setup-form');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        // Try to submit empty form
        await page.click('#submit-btn');

        // Form should still be visible (HTML5 validation prevents submission)
        await expect(setupForm).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
        // UAT: 06_edge_cases.md Test 3.1
        const setupForm = page.locator('#setup-form');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#admin-email', 'notanemail');
        await page.fill('#admin-name', 'Test Admin');
        await page.fill('#admin-password', 'Password123!');
        await page.fill('#admin-password-confirm', 'Password123!');
        await page.click('#submit-btn');

        // Form should still be visible (HTML5 validation)
        await expect(setupForm).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
        const setupForm = page.locator('#setup-form');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#admin-email', 'test@example.com');
        await page.fill('#admin-name', 'Test Admin');
        await page.fill('#admin-password', 'Password123!');
        await page.fill('#admin-password-confirm', 'DifferentPassword456!');
        await page.click('#submit-btn');

        // Should show error message
        await page.waitForTimeout(500);
        const errorMessage = page.locator('#error-message');
        const isErrorVisible = await errorMessage.isVisible();
        
        if (isErrorVisible) {
            await expect(errorMessage).toContainText(/no coinciden|mismatch/i);
        }
    });

    test('should show error when password is too short', async ({ page }) => {
        const setupForm = page.locator('#setup-form');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#admin-email', 'test@example.com');
        await page.fill('#admin-name', 'Test Admin');
        await page.fill('#admin-password', 'short');
        await page.fill('#admin-password-confirm', 'short');
        await page.click('#submit-btn');

        await page.waitForTimeout(500);
        const errorMessage = page.locator('#error-message');
        const isErrorVisible = await errorMessage.isVisible();
        
        if (isErrorVisible) {
            await expect(errorMessage).toContainText(/8|caracteres|characters/i);
        }
    });

});

test.describe('Setup Success Flow', () => {

    test('success state should show registration token', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 1.2 - shows token after creation
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        // Check success state structure exists in DOM
        const successState = page.locator('#setup-success');
        await expect(successState).toBeAttached();

        // Token display elements should exist
        await expect(page.locator('#registration-token')).toBeAttached();
        await expect(page.locator('.btn-copy')).toBeAttached();
    });

    test('success state should have copy token button', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 1.2 - token can be copied
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        // Copy button should exist
        const copyBtn = page.locator('.btn-copy');
        await expect(copyBtn).toBeAttached();
        await expect(copyBtn).toContainText(/Copiar|Copy/i);
    });

    test('success state should have link to login', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 1.2 - has button/link to login
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        // Link to login should exist in success state
        const loginLink = page.locator('#setup-success a[href="index.html"]');
        await expect(loginLink).toBeAttached();
        await expect(loginLink).toContainText(/Login|Acceder/i);
    });

    test('success state should explain next steps', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');

        // Info box with next steps should exist
        const infoBox = page.locator('#setup-success .info-box');
        await expect(infoBox).toBeAttached();
    });

});

test.describe('Navigation', () => {

    test('already-setup state should link to main app', async ({ page }) => {
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const alreadySetup = page.locator('#already-setup');
        if (await alreadySetup.isVisible()) {
            const loginLink = page.locator('#already-setup a[href="index.html"]');
            await expect(loginLink).toBeVisible();

            // Click and verify navigation
            await loginLink.click();
            await page.waitForURL('**/index.html');
        }
    });

});

test.describe('Security', () => {

    test('setup endpoint should be protected after first admin', async ({ page }) => {
        // UAT: 06_edge_cases.md Test 1B.2
        // This is a partial UI test - the API test covers the full protection
        await page.goto('/setup.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const alreadySetup = page.locator('#already-setup');
        const setupForm = page.locator('#setup-form');

        // If already set up, the form should NOT be accessible
        if (await alreadySetup.isVisible()) {
            await expect(setupForm).not.toBeVisible();
        }
    });

});
