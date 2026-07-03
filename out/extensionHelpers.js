"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacesFromFolders = workspacesFromFolders;
exports.substituteWebviewPlaceholders = substituteWebviewPlaceholders;
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
//# sourceMappingURL=extensionHelpers.js.map