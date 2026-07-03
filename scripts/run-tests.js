#!/usr/bin/env node
/**
 * Run unit tests with isolated config dir so integration hubs never pollute ~/.config.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-feedback-test-'));
const env = {
    ...process.env,
    MCP_FEEDBACK_CONFIG_DIR: tmpDir,
    MCP_FEEDBACK_TEST_HOOKS: '1',
};

const extraArgs = process.argv.slice(2);
const nodeArgs = ['--test', '--test-concurrency=1', ...extraArgs];
if (!extraArgs.length) {
    nodeArgs.push('tests/*.test.js');
}

const result = spawnSync('node', nodeArgs, {
    cwd: path.join(import.meta.dirname, '..'),
    env,
    stdio: 'inherit',
    shell: extraArgs.length === 0,
});

try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
    // ignore cleanup errors
}

process.exit(result.status ?? 1);
