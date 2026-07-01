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
    .replace(/\{\{PANELSTATE_URI\}\}/g, 'https://mock/panelState.js')
    .replace(/\{\{CSP_SOURCE\}\}/g, 'https://mock');

const panelStateFile = path.join(__dirname, '..', 'out', 'webview', 'panelState.js');
const panelStateCode = fs.existsSync(panelStateFile)
    ? fs.readFileSync(panelStateFile, 'utf-8')
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
    requestAnimationFrame(fn) { fn(); },
};

mockWindow.eruda = {
    init() {},
    show() {},
    hide() {},
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
    setTimeout(fn) { return 0; },
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

const lastMsg = mockWindow._lastPostMessage;
console.log('\nLast postMessage:', lastMsg ? JSON.stringify(lastMsg) : '(none)');
if (lastMsg && lastMsg.type === 'hub-connect') {
    console.log('  OK  bootstrapConnection sent hub-connect');
} else {
    console.log('  WARN  Expected hub-connect as last postMessage');
}

console.log('');
if (hadError) {
    console.error('VALIDATION FAILED — fix errors before Reload');
    process.exit(1);
} else {
    console.log('VALIDATION PASSED — safe to Reload');
}
