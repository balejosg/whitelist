/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Test Runner for running all test suites sequentially
 * 
 * This script runs each test file in a separate child process to avoid
 * module cache conflicts when multiple test files need to start servers.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
    'tests/api.test.ts',
    'tests/auth.test.ts',
    'tests/roles.test.ts',
    'tests/blocked-domains.test.ts',
    'tests/classrooms.test.ts',
    'tests/push.test.ts',
    'tests/integration.test.ts',
    'tests/e2e.test.ts'
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

    const child = spawn('node', ['--import', 'tsx', '--test', '--test-force-exit', testFile], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: { ...process.env, PORT: '3006' }
    });

    // Timeout to kill hanging tests after 30 seconds
    const timeout = setTimeout(() => {
        console.log(`\n⚠️  Test ${testFile} timed out after 30s, killing...`);
        child.kill('SIGKILL');
    }, 30000);

    child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
            hasFailures = true;
        }
        currentIndex++;
        // Small delay between test files to ensure port cleanup
        setTimeout(runNextTest, 500);
    });

    child.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`Failed to run ${testFile}:`, err);
        hasFailures = true;
        currentIndex++;
        setTimeout(runNextTest, 500);
    });
}


console.log('🧪 Running all test suites...\n');
runNextTest();
