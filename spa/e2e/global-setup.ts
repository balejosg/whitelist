import { chromium, FullConfig } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use.baseURL;
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Capture ALL console output for debugging
    page.on('console', msg => {
        console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
    });
    
    page.on('response', response => {
        if (response.status() === 404) {
            console.log(`[BROWSER 404] ${response.url()}`);
        }
    });
    
    // Capture 404s with URLs
    page.on('response', response => {
        if (response.status() === 404) {
            console.log(`[BROWSER 404] ${response.url()}`);
        }
    });

    try {
        if (!baseURL) {
            throw new Error('baseURL is required for global setup');
        }
        await page.goto(baseURL);
        await page.waitForLoadState('domcontentloaded');

        const setupHeader = page.locator('#setup-header');
        if (await setupHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('🔧 Running first-time setup...');
            await page.fill('#setup-email', ADMIN_CREDENTIALS.email);
            await page.fill('#setup-name', ADMIN_CREDENTIALS.name);
            await page.fill('#setup-password', ADMIN_CREDENTIALS.password);
            await page.click('#setup-submit-btn');
            
            await page.waitForSelector('#setup-complete-container', { timeout: 10000 });
            console.log('✅ Setup complete');
        }

        console.log('🔐 Logging in as admin...');
        await page.goto(baseURL);
        await page.waitForLoadState('domcontentloaded');
        
        await page.fill('#login-email', ADMIN_CREDENTIALS.email);
        await page.fill('#login-password', ADMIN_CREDENTIALS.password);
        await page.click('#email-login-btn');
        
        console.log('⏳ Waiting for dashboard to appear...');
        const dashboardVisible = await page.waitForSelector('#dashboard-screen:not(.hidden)', { 
            timeout: 30000,
            state: 'visible'
        }).catch((e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            console.error('❌ Dashboard screen never appeared:', message);
            return null;
        });
        
        if (!dashboardVisible) {
            const currentScreen = await page.evaluate(() => {
                const screens = Array.from(document.querySelectorAll('.screen'));
                const visible = screens.find(s => !s.classList.contains('hidden'));
                return visible?.id ?? 'none';
            });
            console.error(`❌ Current visible screen: ${currentScreen}`);
            throw new Error(`Dashboard screen not visible. Current screen: ${currentScreen}`);
        }
        
        console.log('✅ Dashboard visible, waiting for logout button...');
        await page.waitForSelector('#logout-btn', { timeout: 10000, state: 'visible' });
        console.log('✅ Admin logged in successfully');

        await page.click('a[href="#users"]');
        await page.waitForSelector('#users-section', { timeout: 10000 });

        const teacherExists = await page.locator(`text=${TEACHER_CREDENTIALS.email}`).isVisible();
        if (!teacherExists) {
            console.log('👨‍🏫 Creating teacher user...');
            await page.click('#add-user-btn');
            await page.fill('#user-email', TEACHER_CREDENTIALS.email);
            await page.fill('#user-name', TEACHER_CREDENTIALS.name);
            await page.fill('#user-password', TEACHER_CREDENTIALS.password);
            await page.selectOption('#user-role', 'teacher');
            await page.click('#save-user-btn');
            await page.waitForTimeout(1000);
            console.log('✅ Teacher created');
        }

        const studentExists = await page.locator(`text=${STUDENT_CREDENTIALS.email}`).isVisible();
        if (!studentExists) {
            console.log('🎓 Creating student user...');
            await page.click('#add-user-btn');
            await page.fill('#user-email', STUDENT_CREDENTIALS.email);
            await page.fill('#user-name', STUDENT_CREDENTIALS.name);
            await page.fill('#user-password', STUDENT_CREDENTIALS.password);
            await page.selectOption('#user-role', 'student');
            await page.click('#save-user-btn');
            await page.waitForTimeout(1000);
            console.log('✅ Student created');
        }
        
        console.log('✅ Global setup complete');

    } catch (error) {
        console.error('❌ Global setup failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

export default globalSetup;
