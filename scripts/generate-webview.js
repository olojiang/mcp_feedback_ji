#!/usr/bin/env node
/**
 * Copies static/panel.html to out/webview/panel.html with panelState.js inlined.
 * The PANELSTATE_PLACEHOLDER comment in panel.html is replaced
 * with the contents of static/panelState.js.
 * Also copies vendor files (e.g. eruda.js) to out/webview/vendor/.
 */

const fs = require('fs');
const path = require('path');

const htmlSrc = path.join(__dirname, '..', 'static', 'panel.html');
const stateSrc = path.join(__dirname, '..', 'static', 'panelState.js');
const outDir = path.join(__dirname, '..', 'out', 'webview');
const dest = path.join(outDir, 'panel.html');

if (!fs.existsSync(htmlSrc)) {
    console.error('[generate-webview] static/panel.html not found!');
    process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

let html = fs.readFileSync(htmlSrc, 'utf8');

if (fs.existsSync(stateSrc)) {
    fs.copyFileSync(stateSrc, path.join(outDir, 'panelState.js'));
    console.log('[generate-webview] Copied panelState.js to out/webview/ (loaded as external resource)');
}

const erudaPanelSrc = path.join(__dirname, '..', 'static', 'erudaPanel.js');
if (fs.existsSync(erudaPanelSrc)) {
    fs.copyFileSync(erudaPanelSrc, path.join(outDir, 'erudaPanel.js'));
    console.log('[generate-webview] Copied erudaPanel.js to out/webview/ (loaded as external resource)');
}

fs.writeFileSync(dest, html, 'utf8');
console.log('[generate-webview] Generated out/webview/panel.html');

const vendorSrc = path.join(__dirname, '..', 'static', 'vendor');
const vendorDest = path.join(outDir, 'vendor');
if (fs.existsSync(vendorSrc)) {
    fs.mkdirSync(vendorDest, { recursive: true });
    for (const file of fs.readdirSync(vendorSrc)) {
        fs.copyFileSync(path.join(vendorSrc, file), path.join(vendorDest, file));
    }
    console.log('[generate-webview] Copied vendor files to out/webview/vendor/');
}
