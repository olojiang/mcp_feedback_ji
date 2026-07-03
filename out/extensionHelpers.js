"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacesFromFolders = workspacesFromFolders;
exports.substituteWebviewPlaceholders = substituteWebviewPlaceholders;
exports.sanitizeUnreplacedWebviewPlaceholders = sanitizeUnreplacedWebviewPlaceholders;
function workspacesFromFolders(folders) {
    return (folders || []).map((f) => f.uri.fsPath);
}
function substituteWebviewPlaceholders(html, replacements) {
    let out = html;
    for (const [key, value] of Object.entries(replacements)) {
        out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return out;
}
/** Prevent broken panel when extension memory is older than disk panel.html after deploy. */
function sanitizeUnreplacedWebviewPlaceholders(html) {
    return html.replace(/<script\b[^>]*\{\{[A-Z0-9_]+\}\}[^>]*>\s*<\/script>\s*/gi, '');
}
//# sourceMappingURL=extensionHelpers.js.map