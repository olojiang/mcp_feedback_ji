#!/usr/bin/env node
/**
 * Deploy script: bump patch version, compile, sync to Cursor extension dir.
 * Usage: node scripts/deploy.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

const EXTENSION_DIR = path.join(
    require('os').homedir(),
    '.cursor', 'extensions',
    'mcp-feedback.mcp-feedback-enhanced-2.5.1-universal'
);

function bumpVersion() {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const parts = pkg.version.split('.');
    const last = parts[parts.length - 1];
    const num = parseInt(last, 10);
    if (isFinite(num)) {
        parts[parts.length - 1] = String(num + 1);
    } else {
        parts.push('1');
    }
    pkg.version = parts.join('.');
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, '\t') + '\n', 'utf8');
    return pkg.version;
}

function compile() {
    console.log('[deploy] compiling...');
    execSync('npm run compile', { cwd: ROOT, stdio: 'inherit' });
}

function syncToExtDir(version) {
    if (!fs.existsSync(EXTENSION_DIR)) {
        console.error('[deploy] Extension dir not found:', EXTENSION_DIR);
        process.exit(1);
    }

    const syncDirs = ['out', 'static', 'scripts', 'mcp-server'];
    const syncFiles = ['package.json'];

    for (const dir of syncDirs) {
        const src = path.join(ROOT, dir);
        const dest = path.join(EXTENSION_DIR, dir);
        if (!fs.existsSync(src)) continue;
        console.log('[deploy] sync', dir, '->');
        execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: 'inherit' });
    }

    for (const file of syncFiles) {
        const src = path.join(ROOT, file);
        const dest = path.join(EXTENSION_DIR, file);
        if (!fs.existsSync(src)) continue;
        fs.copyFileSync(src, dest);
        console.log('[deploy] copy', file);
    }

    console.log(`[deploy] v${version} deployed to ${EXTENSION_DIR}`);
    console.log('[deploy] Please Reload Window in Cursor to activate.');
}

const newVersion = bumpVersion();
console.log(`[deploy] version bumped to ${newVersion}`);
compile();
syncToExtDir(newVersion);
