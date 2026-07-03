#!/usr/bin/env node
/**
 * Simulate webview runtime to catch errors BEFORE Cursor Reload.
 * Runs the compiled panel.html JS in a mock DOM environment.
 *
 * Usage: node scripts/validate-webview-runtime.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const target = path.join(__dirname, '..', 'out', 'webview', 'panel.html');
if (!fs.existsSync(target)) {
    console.error('FAIL: out/webview/panel.html not found — run npm run compile first');
    process.exit(1);
}

const html = fs.readFileSync(target, 'utf-8')
    .replace(/\{\{SERVER_URL\}\}/g, 'ws://127.0.0.1:48201')
    .replace(/\{\{PROJECT_PATH\}\}/g, '/test/project')
    .replace(/\{\{VERSION\}\}/g, '2.5.1-test')
    .replace(/\{\{ERUDA_URI\}\}/g, 'https://mock/eruda.js')
    .replace(/\{\{ERUDA_PANEL_URI\}\}/g, 'https://mock/erudaPanel.js')
    .replace(/\{\{PANELSTATE_MARKDOWN_URI\}\}/g, 'https://mock/panelStateMarkdown.js')
    .replace(/\{\{PANELSTATE_UX_URI\}\}/g, 'https://mock/panelStateUx.js')
    .replace(/\{\{PANELSTATE_TRANSPORT_URI\}\}/g, 'https://mock/panelStateTransport.js')
    .replace(/\{\{PANELSTATE_URI\}\}/g, 'https://mock/panelState.js')
    .replace(/\{\{PANELCONNECTION_URI\}\}/g, 'https://mock/panelConnection.js')
    .replace(/\{\{PANELAPP_URI\}\}/g, 'https://mock/panelApp.js')
    .replace(/\{\{THEMECONTRAST_URI\}\}/g, 'https://mock/themeContrast.js')
    .replace(/\{\{CSP_SOURCE\}\}/g, 'https://mock');

const panelStateMarkdownFile = path.join(__dirname, '..', 'out', 'webview', 'panelStateMarkdown.js');
const panelStateUxFile = path.join(__dirname, '..', 'out', 'webview', 'panelStateUx.js');
const panelStateTransportFile = path.join(__dirname, '..', 'out', 'webview', 'panelStateTransport.js');
const panelStateFile = path.join(__dirname, '..', 'out', 'webview', 'panelState.js');
const erudaPanelFile = path.join(__dirname, '..', 'out', 'webview', 'erudaPanel.js');
const themeContrastFile = path.join(__dirname, '..', 'out', 'webview', 'themeContrast.js');
const panelConnectionFile = path.join(__dirname, '..', 'out', 'webview', 'panelConnection.js');
const panelAppFile = path.join(__dirname, '..', 'out', 'webview', 'panelApp.js');
const panelStateMarkdownCode = fs.existsSync(panelStateMarkdownFile)
    ? fs.readFileSync(panelStateMarkdownFile, 'utf-8')
    : null;
const panelStateUxCode = fs.existsSync(panelStateUxFile)
    ? fs.readFileSync(panelStateUxFile, 'utf-8')
    : null;
const panelStateTransportCode = fs.existsSync(panelStateTransportFile)
    ? fs.readFileSync(panelStateTransportFile, 'utf-8')
    : null;
const panelStateCode = fs.existsSync(panelStateFile)
    ? fs.readFileSync(panelStateFile, 'utf-8')
    : null;
const erudaPanelCode = fs.existsSync(erudaPanelFile)
    ? fs.readFileSync(erudaPanelFile, 'utf-8')
    : null;
const themeContrastCode = fs.existsSync(themeContrastFile)
    ? fs.readFileSync(themeContrastFile, 'utf-8')
    : null;
const panelConnectionCode = fs.existsSync(panelConnectionFile)
    ? fs.readFileSync(panelConnectionFile, 'utf-8')
    : null;
const panelAppCode = fs.existsSync(panelAppFile)
    ? fs.readFileSync(panelAppFile, 'utf-8')
    : null;

const scripts = [];
const re = /<script(?:\s[^>]*)?>([^]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (tag.includes(' src=')) continue;
    const body = m[1].trim();
    if (body && (!body.startsWith('/*') || body.length > 100)) {
        scripts.push(body);
    }
}

console.log(`Found ${scripts.length} script block(s)`);

const elements = {};
const listeners = {};
const classList = () => ({
    _c: new Set(),
    add(c) { this._c.add(c); },
    remove(c) { this._c.delete(c); },
    toggle(c) { this._c.has(c) ? this._c.delete(c) : this._c.add(c); },
    contains(c) { return this._c.has(c); },
});

function makeEl(id) {
    const el = {
        id,
        style: {},
        dataset: {},
        textContent: '',
        value: '',
        innerHTML: '',
        tagName: 'DIV',
        src: '',
        checked: false,
        disabled: false,
        selectionStart: 0,
        selectionEnd: 0,
        classList: classList(),
        focus() {},
        blur() {},
        closest() { return null; },
        querySelector() { return makeEl('_qs_'); },
        querySelectorAll() { return []; },
        appendChild() {},
        removeChild() {},
        insertBefore() {},
        replaceChild() {},
        addEventListener(evt, fn) {
            if (!listeners[id]) listeners[id] = {};
            listeners[id][evt] = fn;
        },
        removeEventListener() {},
        scrollTo() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20 }; },
        offsetHeight: 20,
        scrollHeight: 200,
        nodeType: 1,
        childNodes: [],
        children: [],
        firstChild: null,
        rows: 4,
    };
    Object.defineProperty(el, 'parentElement', {
        get() { return makeEl('_parent_of_' + id); },
    });
    return el;
}

const doc = {
    getElementById(id) {
        if (!elements[id]) elements[id] = makeEl(id);
        return elements[id];
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return makeEl('_created_' + tag + '_' + Math.random().toString(36).slice(2, 6)); },
    body: makeEl('body'),
    title: '',
    addEventListener() {},
};

const mockWindow = {
    addEventListener() {},
    removeEventListener() {},
    PanelStateModule: null,
    __mcpBootstrapped: false,
    __mcpPanelError: null,
    onerror: null,
    matchMedia() { return { matches: false, addEventListener() {} }; },
    getComputedStyle() { return {}; },
    innerHeight: 600,
    innerWidth: 400,
    scrollTo() {},
    requestAnimationFrame(fn) { fn(); return 1; },
};

mockWindow.eruda = {
    init(opts) {
        mockWindow._erudaInitOpts = opts || {};
        mockWindow._erudaInited = true;
    },
    show() { mockWindow._erudaShown = true; },
    hide() { mockWindow._erudaShown = false; },
    destroy() {},
};

const ctx = vm.createContext({
    document: doc,
    window: mockWindow,
    eruda: mockWindow.eruda,
    navigator: { clipboard: null, userAgent: 'validate-webview-runtime', platform: 'test' },
    localStorage: { getItem() { return null; }, setItem() {} },
    console: {
        log() {},
        warn() {},
        error(...args) { console.error('  [webview console.error]', ...args); },
    },
    acquireVsCodeApi() {
        return { postMessage(msg) { mockWindow._lastPostMessage = msg; } };
    },
    setInterval() { return 0; },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout() {},
    clearInterval() {},
    WebSocket: function MockWebSocket() { this.readyState = 3; },
    alert(msg) { console.log('  [alert]', msg); },
    Blob: function MockBlob() {},
    FileReader: function MockFileReader() { this.readAsDataURL = function() {}; this.onload = null; },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Image: function MockImage() { this.onload = null; this.src = ''; },
    DragEvent: function() {},
    Event: function() {},
    fetch() { return Promise.resolve({ ok: true, json() { return Promise.resolve({}); } }); },
    Promise,
    Array,
    Object,
    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Map,
    Set,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    btoa(s) { return Buffer.from(s).toString('base64'); },
    atob(s) { return Buffer.from(s, 'base64').toString(); },
});

ctx.WebSocket.OPEN = 1;
ctx.WebSocket.CLOSED = 3;
ctx.window.document = doc;
ctx.self = ctx.window;
ctx.globalThis = ctx.window;

let hadError = false;
const results = [];

const unreplaced = html.match(/\{\{[A-Z_]+\}\}/g);
if (unreplaced) {
    console.error(`  FAIL Unreplaced placeholders in HTML: ${unreplaced.join(', ')}`);
    hadError = true;
} else {
    console.log('  OK  All placeholders replaced');
}

for (const [label, code] of [
    ['panelStateMarkdown', panelStateMarkdownCode],
    ['panelStateUx', panelStateUxCode],
    ['panelStateTransport', panelStateTransportCode],
]) {
    if (code) {
        try {
            vm.runInContext(code, ctx, { filename: label + '.js', timeout: 5000 });
            console.log(`  OK  External ${label}.js loaded`);
        } catch (err) {
            console.error(`  FAIL External ${label}.js: ${err.message}`);
            hadError = true;
        }
    } else {
        console.error(`  FAIL External ${label}.js not found`);
        hadError = true;
    }
}

if (panelStateCode) {
    try {
        vm.runInContext(panelStateCode, ctx, { filename: 'panelState.js', timeout: 5000 });
        console.log('  OK  External panelState.js loaded');
        if (ctx.window.PanelStateModule && ctx.window.PanelStateModule.PanelState) {
            console.log('  OK  PanelStateModule.PanelState is available');
        } else {
            console.error('  FAIL PanelStateModule.PanelState not set after loading');
            hadError = true;
        }
    } catch (err) {
        console.error(`  FAIL External panelState.js: ${err.message}`);
        hadError = true;
    }
} else {
    console.error('  FAIL External panelState.js not found');
    hadError = true;
}

if (erudaPanelCode) {
    try {
        vm.runInContext(erudaPanelCode, ctx, { filename: 'erudaPanel.js', timeout: 5000 });
        console.log('  OK  External erudaPanel.js loaded');
        if (ctx.window.ErudaPanelModule && ctx.window.ErudaPanelModule.loadHeight) {
            console.log('  OK  ErudaPanelModule.loadHeight is available');
        } else {
            console.error('  FAIL ErudaPanelModule.loadHeight not set after loading');
            hadError = true;
        }
    } catch (err) {
        console.error(`  FAIL External erudaPanel.js: ${err.message}`);
        hadError = true;
    }
} else {
    console.error('  FAIL External erudaPanel.js not found');
    hadError = true;
}

if (themeContrastCode) {
    try {
        vm.runInContext(themeContrastCode, ctx, { filename: 'themeContrast.js', timeout: 5000 });
        console.log('  OK  External themeContrast.js loaded');
        if (ctx.window.McpThemeContrast && ctx.window.McpThemeContrast.applyMcpTheme) {
            console.log('  OK  McpThemeContrast.applyMcpTheme is available');
        } else {
            console.error('  FAIL McpThemeContrast not set after loading');
            hadError = true;
        }
    } catch (err) {
        console.error(`  FAIL External themeContrast.js: ${err.message}`);
        hadError = true;
    }
} else {
    console.error('  FAIL External themeContrast.js not found');
    hadError = true;
}

if (panelConnectionCode) {
    try {
        vm.runInContext(panelConnectionCode, ctx, { filename: 'panelConnection.js', timeout: 5000 });
        console.log('  OK  External panelConnection.js loaded');
    } catch (err) {
        console.error(`  FAIL External panelConnection.js: ${err.message}`);
        hadError = true;
    }
} else {
    console.error('  FAIL External panelConnection.js not found');
    hadError = true;
}

for (let i = 0; i < scripts.length; i++) {
    const label = `Script block ${i + 1} (${scripts[i].length} chars)`;
    try {
        vm.runInContext(scripts[i], ctx, { filename: `panel-block-${i}.js`, timeout: 5000 });
        results.push({ block: i + 1, ok: true });
        console.log(`  OK  ${label}`);
    } catch (err) {
        hadError = true;
        results.push({ block: i + 1, ok: false, error: err.message, stack: err.stack });
        console.error(`  FAIL ${label}`);
        console.error(`       ${err.message}`);
        const stackLines = (err.stack || '').split('\n').slice(1, 4);
        for (const line of stackLines) {
            console.error(`       ${line.trim()}`);
        }
    }
}

if (panelAppCode) {
    try {
        vm.runInContext(panelAppCode, ctx, { filename: 'panelApp.js', timeout: 10000 });
        console.log('  OK  External panelApp.js loaded');
    } catch (err) {
        console.error(`  FAIL External panelApp.js: ${err.message}`);
        hadError = true;
    }
} else {
    console.error('  FAIL External panelApp.js not found');
    hadError = true;
}

const criticalIds = [
    'wsStatus', 'wsStatusLabel', 'wsPort', 'wsReconnectBtn',
    'debugBtn', 'debugPanel', 'debugJson',
    'settingsBtn', 'settingsPanel',
    'sendBtn', 'input', 'messages',
];

console.log('\nElement → event listener bindings:');
for (const id of criticalIds) {
    const evts = listeners[id] ? Object.keys(listeners[id]).join(', ') : '(none)';
    const ok = listeners[id] && Object.keys(listeners[id]).length > 0;
    console.log(`  ${ok ? 'OK' : 'MISS'}  #${id}: ${evts}`);
    if (!ok && ['debugBtn', 'wsReconnectBtn', 'settingsBtn'].includes(id)) {
        hadError = true;
    }
}

if (mockWindow._erudaInited) {
    console.log('  OK  eruda initialized at page load');
    if (mockWindow._erudaInitOpts && !mockWindow._erudaInitOpts.inline) {
        console.log('  OK  eruda.init uses floating entry button (no inline)');
    } else if (mockWindow._erudaInitOpts && mockWindow._erudaInitOpts.inline === true) {
        console.error('  FAIL eruda.init should not use inline mode');
        hadError = true;
    }
} else {
    console.error('  FAIL eruda was not initialized at page load');
    hadError = true;
}
if (mockWindow._erudaShown) {
    console.error('  FAIL eruda should not be shown until user clicks entry button');
    hadError = true;
} else {
    console.log('  OK  eruda not auto-shown after page load');
}

if (listeners.debugBtn && listeners.debugBtn.click) {
    try {
        listeners.debugBtn.click();
        console.log('  OK  debugBtn click simulated');
    } catch (err) {
        console.error('  FAIL debugBtn click:', err.message);
        hadError = true;
    }
} else {
    console.error('  FAIL debugBtn click handler missing');
    hadError = true;
}

const lastMsg = mockWindow._lastPostMessage;
console.log('\nLast postMessage:', lastMsg ? JSON.stringify(lastMsg) : '(none)');
if (lastMsg && lastMsg.type === 'webview-ready') {
    console.log('  OK  webview-ready posted after init');
} else if (lastMsg && lastMsg.type === 'request-debug') {
    console.log('  OK  DBG panel requested debug report (eruda independent)');
} else if (lastMsg && lastMsg.type === 'hub-connect') {
    console.log('  OK  bootstrapConnection sent hub-connect');
} else {
    console.log('  WARN  Expected webview-ready or request-debug as last postMessage');
}

if (mockWindow._erudaShown) {
    console.error('  FAIL eruda.show should not be called from DBG');
    hadError = true;
} else {
    console.log('  OK  DBG click did not call eruda.show');
}

console.log('');
if (hadError) {
    console.error('VALIDATION FAILED — fix errors before Reload');
    process.exit(1);
} else {
    console.log('VALIDATION PASSED — safe to Reload');
}
