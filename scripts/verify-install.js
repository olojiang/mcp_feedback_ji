#!/usr/bin/env node
/**
 * Verify build/install WITHOUT Cursor Reload.
 * Usage:
 *   node scripts/verify-install.js           # verify repo build
 *   node scripts/verify-install.js --installed  # verify ~/.cursor/extensions copy
 *   node scripts/verify-install.js --full    # also run unit tests + live WS probe
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import http from 'node:http';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const INSTALLED = path.join(
    os.homedir(),
    '.cursor/extensions/mcp-feedback.mcp-feedback-enhanced-2.5.1-universal'
);

const args = new Set(process.argv.slice(2));
const target = args.has('--installed') ? INSTALLED : ROOT;
const full = args.has('--full');

const results = [];

function check(name, fn) {
    try {
        const detail = fn();
        results.push({ name, ok: true, detail: detail || '' });
        console.log(`  OK  ${name}${detail ? ` — ${detail}` : ''}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name, ok: false, detail: msg });
        console.error(`  FAIL ${name} — ${msg}`);
    }
}

function loadWebviewHtml(extensionPath, serverPort, version) {
    const candidates = [
        path.join(extensionPath, 'static', 'panel.html'),
        path.join(extensionPath, 'out', 'webview', 'panel.html'),
    ];
    let html = '';
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            html = fs.readFileSync(p, 'utf-8');
            break;
        }
    }
    if (!html) throw new Error('panel.html not found');
    return html
        .replace(/\{\{SERVER_URL\}\}/g, `ws://127.0.0.1:${serverPort}`)
        .replace(/\{\{PROJECT_PATH\}\}/g, '/test/project')
        .replace(/\{\{VERSION\}\}/g, version)
        .replace(/\{\{ERUDA_URI\}\}/g, 'https://test/eruda.js')
        .replace(/\{\{ERUDA_PANEL_URI\}\}/g, 'https://test/erudaPanel.js')
        .replace(/\{\{PANELSTATE_URI\}\}/g, 'https://test/panelState.js')
        .replace(/\{\{CSP_SOURCE\}\}/g, 'https://test');
}

function fetchHealth(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 800 }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function probeLiveExtension() {
    const { PanelState } = require(path.join(target, 'out/webview/panelState.js'));
    const range = PanelState.healthPortRange();
    for (let p = range.start; p <= range.end; p++) {
        const health = await fetchHealth(p);
        if (health?.ok && String(health.version || '').includes('ji.')) {
            return health;
        }
    }
    return null;
}

async function main() {
    console.log(`verify-install: target=${target}`);

    check('package.json exists', () => {
        if (!fs.existsSync(path.join(target, 'package.json'))) throw new Error('missing');
        return '';
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf-8'));
    check('version is ji fork', () => {
        if (!String(pkg.version).includes('ji.')) throw new Error(`got ${pkg.version}`);
        return pkg.version;
    });

    check('out/extension.js built', () => {
        const p = path.join(target, 'out/extension.js');
        if (!fs.existsSync(p)) throw new Error('missing — run npm run compile');
        const js = fs.readFileSync(p, 'utf-8');
        if (!js.includes('get-server-info')) throw new Error('missing get-server-info');
        if (!js.includes('request-debug')) throw new Error('missing request-debug handler');
        if (!js.includes('getDebugInfo')) throw new Error('missing getDebugInfo');
        return `${Math.round(fs.statSync(p).size / 1024)}kb`;
    });

    check('debug panel in static/panel.html', () => {
        const html = fs.readFileSync(path.join(target, 'static/panel.html'), 'utf-8');
        if (!html.includes('id="debugBtn"')) throw new Error('missing debugBtn');
        if (!html.includes('request-debug')) throw new Error('missing request-debug in panel');
        return 'DBG button + debug panel';
    });

    check('panel CSP allows localhost WS', () => {
        const html = fs.readFileSync(path.join(target, 'static/panel.html'), 'utf-8');
        if (!html.includes('connect-src ws://127.0.0.1:*')) {
            throw new Error('missing connect-src for ws://127.0.0.1');
        }
        return '';
    });

    check('eruda.js in static/vendor', () => {
        const p = path.join(target, 'static/vendor/eruda.js');
        if (!fs.existsSync(p)) throw new Error('missing static/vendor/eruda.js');
        return `${Math.round(fs.statSync(p).size / 1024)}kb`;
    });

    check('HTML placeholder injection', () => {
        const html = loadWebviewHtml(target, 48201, pkg.version);
        if (html.includes('{{SERVER_URL}}') || html.includes('{{VERSION}}')) {
            throw new Error('unreplaced placeholders in served HTML');
        }
        if (!html.includes('ws://127.0.0.1:48201')) throw new Error('SERVER_URL not injected');
        if (!html.includes(`v${pkg.version}`)) throw new Error('VERSION not injected');
        return 'ws://127.0.0.1:48201';
    });

    check('panelState helpers', () => {
        const { PanelState } = require(path.join(target, 'out/webview/panelState.js'));
        if (!PanelState.isValidWsUrl('ws://127.0.0.1:48201')) throw new Error('isValidWsUrl broken');
        if (PanelState.isValidWsUrl('{{SERVER_URL}}')) throw new Error('should reject placeholder');
        return 'isValidWsUrl OK';
    });

    check('mcp-server dist', () => {
        const p = path.join(target, 'mcp-server/dist/index.js');
        if (!fs.existsSync(p)) throw new Error('missing — run npm run compile');
        return '';
    });

    if (args.has('--installed')) {
        check('matches repo build (extension.js size)', () => {
            const a = fs.statSync(path.join(ROOT, 'out/extension.js')).size;
            const b = fs.statSync(path.join(target, 'out/extension.js')).size;
            if (a !== b) throw new Error(`repo=${a} installed=${b} — run ./install.sh`);
            return `${a} bytes`;
        });
    }

    if (full) {
        const test = spawnSync('node', ['--test', 'tests/panelState.test.js', 'tests/serverDiscovery.test.js'], {
            cwd: ROOT,
            encoding: 'utf-8',
        });
        check('unit tests', () => {
            if (test.status !== 0) throw new Error(test.stderr || test.stdout || 'tests failed');
            return 'panelState + serverDiscovery';
        });

        const live = await probeLiveExtension();
        check('live extension /health (optional)', () => {
            if (!live) return 'no ji extension running — OK before first Reload';
            return `port=${live.port} pid=${live.pid} v=${live.version}`;
        });

        if (live?.port) {
            const { default: WebSocket } = await import('ws');
            await new Promise((resolve, reject) => {
                const ws = new WebSocket(`ws://127.0.0.1:${live.port}`);
                const t = setTimeout(() => {
                    ws.close();
                    reject(new Error('WS timeout'));
                }, 3000);
                ws.on('open', () => {
                    ws.send(JSON.stringify({ type: 'register', clientType: 'verify-install' }));
                });
                ws.on('message', (raw) => {
                    const msg = JSON.parse(raw.toString());
                    if (msg.type === 'connection_established') {
                        clearTimeout(t);
                        ws.close();
                        resolve();
                    }
                });
                ws.on('error', reject);
            }).then(() => {
                check('live WebSocket register', () => `port=${live.port}`);
            }).catch((err) => {
                check('live WebSocket register', () => {
                    throw err;
                });
            });
        }
    }

    const failed = results.filter((r) => !r.ok);
    console.log('');
    if (failed.length) {
        console.error(`FAILED ${failed.length}/${results.length} checks`);
        process.exit(1);
    }
    console.log(`PASSED ${results.length}/${results.length} checks`);
    if (!args.has('--installed')) {
        console.log('\nNext: ./install.sh  then  node scripts/verify-install.js --installed --full');
    } else {
        console.log('\nInstall verified. Now: Developer → Reload Window in Cursor');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
