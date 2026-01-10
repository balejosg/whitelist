import { chromium, FullConfig } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';
import { ApiClient } from './fixtures/api-fixtures';

async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0]?.use.baseURL;
    const apiURL = process.env.API_URL ?? 'http://localhost:3001';
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const apiClient = new ApiClient(apiURL);
    
    // Capture ALL console output for debugging
    page.on('console', msg => {
        console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
    });
    
    page.on('response', response => {
        const status = response.status();
        const url = response.url();
        if (status === 404) {
            console.log(`[BROWSER 404] ${url}`);
        }
        if (status >= 400) {
            console.log(`[BROWSER ${String(status)}] ${url}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`[BROWSER PAGE ERROR] ${error.message}`);
    });

    try {
        if (!baseURL) {
            throw new Error('baseURL is required for global setup');
        }
        
        await page.goto(baseURL);
        
        await page.evaluate((apiUrl) => {
            localStorage.setItem('requests_api_url', apiUrl);
        }, apiURL);
        
        console.log(`📝 Set API URL in localStorage: ${apiURL}`);
        console.log('🔄 Reloading page to apply API URL...');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        const setupHeader = page.locator('#setup-header');
        if (await setupHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('🔧 Running first-time setup...');
            await page.fill('#setup-email', ADMIN_CREDENTIALS.email);
            await page.fill('#setup-name', ADMIN_CREDENTIALS.name);
            await page.fill('#setup-password', ADMIN_CREDENTIALS.password);
            await page.fill('#setup-password-confirm', ADMIN_CREDENTIALS.password);
            console.log('📝 Filled setup form, clicking submit...');
            await page.click('#setup-submit-btn');
            
            console.log('⏳ Waiting for setup complete container to appear...');
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

        const token = await page.evaluate(() => localStorage.getItem('openpath_access_token'));
        if (!token) {
            throw new Error('No auth token found in localStorage after login');
        }
        apiClient.setAuthToken(token);

        console.log('👨‍🏫 Creating teacher user via API...');
        const teacherResult = await apiClient.createUser({
            email: TEACHER_CREDENTIALS.email,
            name: TEACHER_CREDENTIALS.name,
            password: TEACHER_CREDENTIALS.password,
            role: 'teacher'
        });
        if (teacherResult.ok) {
            console.log('✅ Teacher created');
        } else {
            console.log(`⚠️  Teacher creation: ${teacherResult.error ?? 'unknown error'}`);
        }

        console.log('🎓 Creating student user via API...');
        const studentResult = await apiClient.createUser({
            email: STUDENT_CREDENTIALS.email,
            name: STUDENT_CREDENTIALS.name,
            password: STUDENT_CREDENTIALS.password,
            role: 'student'
        });
        if (studentResult.ok) {
            console.log('✅ Student created');
        } else {
            console.log(`⚠️  Student creation: ${studentResult.error ?? 'unknown error'}`);
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
