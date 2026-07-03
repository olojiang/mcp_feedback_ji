/** Whether the webview HTML must reload when the hub port changes. */
export function shouldReloadWebview(lastSyncedPort: number, nextPort: number): boolean {
    return lastSyncedPort !== nextPort;
}

/** Avoid please-reconnect storms when port is unchanged and bridge is already up. */
export function shouldReconnectWebview(
    lastSyncedPort: number,
    nextPort: number,
    bridgeActive: boolean,
): boolean {
    if (shouldReloadWebview(lastSyncedPort, nextPort)) return true;
    return !bridgeActive;
}

const DEFAULT_RECONNECT_DEBOUNCE_MS = 1200;

/** Panel: ignore rapid duplicate forceReconnect within window (e.g. double please-reconnect). */
export function shouldDebouncePanelReconnect(
    lastReconnectAtMs: number,
    nowMs: number,
    windowMs = DEFAULT_RECONNECT_DEBOUNCE_MS,
): boolean {
    return lastReconnectAtMs > 0 && nowMs - lastReconnectAtMs < windowMs;
}

export function panelBootstrapAction(
    gateSnapshot: { initialized: boolean; registered: boolean },
    event: 'webview-ready' | 'please-reconnect' | 'bridge-connected-duplicate',
): { hubConnect: boolean; register: boolean; stateSync: boolean } {
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
