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

const EXTENSIONS_DIR = path.join(require('os').homedir(), '.cursor', 'extensions');

function findExtensionDir() {
    if (!fs.existsSync(EXTENSIONS_DIR)) return null;
    const matches = fs.readdirSync(EXTENSIONS_DIR)
        .filter((n) => n.startsWith('mcp-feedback.mcp-feedback-enhanced-'));
    if (!matches.length) return null;
    matches.sort();
    return path.join(EXTENSIONS_DIR, matches[matches.length - 1]);
}

const EXTENSION_DIR = findExtensionDir();

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

function syncMcpConfig(version) {
    const mcpConfigPath = path.join(require('os').homedir(), '.cursor', 'mcp.json');
    if (!EXTENSION_DIR || !fs.existsSync(mcpConfigPath)) return;

    let config;
    try {
        config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    } catch {
        return;
    }

    const mcpServers = config.mcpServers || {};
    const entry = mcpServers['mcp-feedback-enhanced'];
    if (!entry || typeof entry !== 'object') return;

    const serverPath = path.join(EXTENSION_DIR, 'mcp-server', 'dist', 'index.js');
    entry.args = [serverPath];
    entry.env = { ...(entry.env || {}), MCP_FEEDBACK_VERSION: version };
    mcpServers['mcp-feedback-enhanced'] = entry;
    config.mcpServers = mcpServers;
    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log('[deploy] updated ~/.cursor/mcp.json MCP_FEEDBACK_VERSION=' + version);
}

function syncToExtDir(version) {
    if (!EXTENSION_DIR || !fs.existsSync(EXTENSION_DIR)) {
        console.error('[deploy] Extension dir not found under', EXTENSIONS_DIR);
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

    syncMcpConfig(version);

    console.log(`[deploy] v${version} deployed to ${EXTENSION_DIR}`);
    console.log('[deploy] Reload Window once — version is read from disk (not Cursor cache).');
    console.log('[deploy] MCP config updated; toggle MCP off/on if server still looks stale.');
}

const newVersion = bumpVersion();
console.log(`[deploy] version bumped to ${newVersion}`);
compile();
syncToExtDir(newVersion);
