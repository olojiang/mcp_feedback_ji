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
