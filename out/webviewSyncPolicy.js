"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldReloadWebview = shouldReloadWebview;
exports.shouldReconnectWebview = shouldReconnectWebview;
exports.shouldDebouncePanelReconnect = shouldDebouncePanelReconnect;
exports.panelBootstrapAction = panelBootstrapAction;
/** Whether the webview HTML must reload when the hub port changes. */
function shouldReloadWebview(lastSyncedPort, nextPort) {
    return lastSyncedPort !== nextPort;
}
/** Avoid please-reconnect storms when port is unchanged and bridge is already up. */
function shouldReconnectWebview(lastSyncedPort, nextPort, bridgeActive) {
    if (shouldReloadWebview(lastSyncedPort, nextPort))
        return true;
    return !bridgeActive;
}
const DEFAULT_RECONNECT_DEBOUNCE_MS = 1200;
/** Panel: ignore rapid duplicate forceReconnect within window (e.g. double please-reconnect). */
function shouldDebouncePanelReconnect(lastReconnectAtMs, nowMs, windowMs = DEFAULT_RECONNECT_DEBOUNCE_MS) {
    return lastReconnectAtMs > 0 && nowMs - lastReconnectAtMs < windowMs;
}
function panelBootstrapAction(gateSnapshot, event) {
    if (event === 'please-reconnect') {
        return { hubConnect: true, register: true, stateSync: true };
    }
    if (event === 'bridge-connected-duplicate') {
        return { hubConnect: false, register: false, stateSync: false };
    }
    return {
        hubConnect: true,
        register: !gateSnapshot.registered,
        stateSync: true,
    };
}
//# sourceMappingURL=webviewSyncPolicy.js.map