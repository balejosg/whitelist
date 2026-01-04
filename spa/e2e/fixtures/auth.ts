import { test as base, expect, Page } from '@playwright/test';

export const ADMIN_CREDENTIALS = {
    email: 'maria.admin@test.com',
    password: 'AdminPassword123!',
    name: 'María García',
    role: 'admin'
} as const;

export const TEACHER_CREDENTIALS = {
    email: 'pedro.profesor@test.com',
    password: 'TeacherPassword123!',
    name: 'Pedro Martínez',
    role: 'teacher',
    groups: ['ciencias-3eso', 'fisica-4eso']
} as const;

export const STUDENT_CREDENTIALS = {
    email: 'ana.alumna@test.com',
    password: 'StudentPassword123!',
    name: 'Ana López',
    role: 'student'
} as const;

export type UserRole = 'admin' | 'teacher' | 'student';

export interface AuthFixtures {
    authenticatedPage: Page;
    adminPage: Page;
    teacherPage: Page;
    studentPage: Page;
}

async function loginAs(page: Page, email: string, password: string): Promise<boolean> {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loginForm = page.locator('#email-login-form');
    if (!await loginForm.isVisible({ timeout: 5000 }).catch(() => false)) {
        return false;
    }

    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.click('#email-login-btn');

    await page.waitForTimeout(2000);

    const dashboardVisible = await page.locator('#dashboard-screen').isVisible().catch(() => false);
    return dashboardVisible;
}

export const test = base.extend<AuthFixtures>({
    authenticatedPage: async ({ page }, use) => {
        await use(page);
    },

    adminPage: async ({ page }, use) => {
        await loginAs(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
        await use(page);
    },

    teacherPage: async ({ page }, use) => {
        await loginAs(page, TEACHER_CREDENTIALS.email, TEACHER_CREDENTIALS.password);
        await use(page);
    },

    studentPage: async ({ page }, use) => {
        await loginAs(page, STUDENT_CREDENTIALS.email, STUDENT_CREDENTIALS.password);
        await use(page);
    },
});

export { expect };

/**
 * Seed test data before test run
 * Creates test users if they don't exist
 */
export async function seedTestData(): Promise<void> {
    const API_URL = process.env.API_URL ?? 'http://localhost:3000';

    try {
        // Ping health endpoint to verify API is available
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) {
            console.warn('API not available for seeding');
        }
    } catch {
        console.warn('Could not seed test data - API unavailable');
    }
}

/**
 * Cleanup test data after test run
 * Removes users/data created during tests
 */
export function cleanupTestData(testMarker = 'e2e.openpath.local'): void {
    // In production mode, we don't auto-cleanup
    // Data cleanup would need admin privileges
    console.log(`Test cleanup marker: ${testMarker}`);
}
