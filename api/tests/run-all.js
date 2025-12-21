/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
