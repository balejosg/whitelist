import { chromium, FullConfig } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use.baseURL;
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        if (!baseURL) {
            throw new Error('baseURL is required for global setup');
        }
        await page.goto(baseURL);
        await page.waitForLoadState('domcontentloaded');

        const setupHeader = page.locator('#setup-header');
        if (await setupHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
            await page.fill('#setup-email', ADMIN_CREDENTIALS.email);
            await page.fill('#setup-name', ADMIN_CREDENTIALS.name);
            await page.fill('#setup-password', ADMIN_CREDENTIALS.password);
            await page.click('#setup-submit-btn');
            
            await page.waitForSelector('#setup-complete-container', { timeout: 10000 });
        }

        await page.goto(baseURL);
        await page.fill('#login-email', ADMIN_CREDENTIALS.email);
        await page.fill('#login-password', ADMIN_CREDENTIALS.password);
        await page.click('#email-login-btn');
        await page.waitForSelector('#logout-btn', { timeout: 10000 });

        await page.click('a[href="#users"]');
        await page.waitForSelector('#users-section', { timeout: 10000 });

        const teacherExists = await page.locator(`text=${TEACHER_CREDENTIALS.email}`).isVisible();
        if (!teacherExists) {
            await page.click('#add-user-btn');
            await page.fill('#user-email', TEACHER_CREDENTIALS.email);
            await page.fill('#user-name', TEACHER_CREDENTIALS.name);
            await page.fill('#user-password', TEACHER_CREDENTIALS.password);
            await page.selectOption('#user-role', 'teacher');
            await page.click('#save-user-btn');
            await page.waitForTimeout(1000);
        }

        const studentExists = await page.locator(`text=${STUDENT_CREDENTIALS.email}`).isVisible();
        if (!studentExists) {
            await page.click('#add-user-btn');
            await page.fill('#user-email', STUDENT_CREDENTIALS.email);
            await page.fill('#user-name', STUDENT_CREDENTIALS.name);
            await page.fill('#user-password', STUDENT_CREDENTIALS.password);
            await page.selectOption('#user-role', 'student');
            await page.click('#save-user-btn');
            await page.waitForTimeout(1000);
        }

    } catch (error) {
        console.error('❌ Global setup failed:', error);
    } finally {
        await browser.close();
    }
}

export default globalSetup;
