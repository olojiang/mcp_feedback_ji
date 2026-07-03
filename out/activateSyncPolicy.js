"use strict";
/** Extension activation sync schedule (testable, no vscode imports). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENSION_PANEL_FOCUS_DELAYS_MS = exports.EXTENSION_SYNC_DELAY_MS = void 0;
exports.extensionSyncDelaysMs = extensionSyncDelaysMs;
exports.EXTENSION_SYNC_DELAY_MS = 800;
exports.EXTENSION_PANEL_FOCUS_DELAYS_MS = [1500, 3000, 5000];
/** Single deferred syncWebview — avoids please-reconnect storms at 0/500/1500/3000ms. */
function extensionSyncDelaysMs() {
    return [exports.EXTENSION_SYNC_DELAY_MS];
}
//# sourceMappingURL=activateSyncPolicy.js.map