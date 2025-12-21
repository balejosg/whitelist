/**
 * Test Runner for running all test suites sequentially
 * 
 * This script runs each test file in a separate child process to avoid
 * module cache conflicts when multiple test files need to start servers.
 */

const { spawn } = require('child_process');
const path = require('path');

const testFiles = [
    'tests/api.test.js',
    'tests/auth.test.js',
    'tests/e2e.test.js'
];

let currentIndex = 0;
let hasFailures = false;

function runNextTest() {
    if (currentIndex >= testFiles.length) {
        console.log('\n' + '='.repeat(60));
        if (hasFailures) {
            console.log('❌ Some tests failed');
            process.exit(1);
        } else {
            console.log('✅ All test suites completed successfully');
            process.exit(0);
        }
        return;
    }

    const testFile = testFiles[currentIndex];
    console.log('\n' + '='.repeat(60));
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60) + '\n');

    const child = spawn('node', ['--test', testFile], {
        cwd: path.join(__dirname),
        stdio: 'inherit',
        env: { ...process.env }
    });

    child.on('close', (code) => {
        if (code !== 0) {
            hasFailures = true;
        }
        currentIndex++;
        // Small delay between test files to ensure port cleanup
        setTimeout(runNextTest, 500);
    });

    child.on('error', (err) => {
        console.error(`Failed to run ${testFile}:`, err);
        hasFailures = true;
        currentIndex++;
        setTimeout(runNextTest, 500);
    });
}

console.log('🧪 Running all test suites...\n');
runNextTest();
