/** Whether the webview HTML must reload when the hub port changes. */
export declare function shouldReloadWebview(lastSyncedPort: number, nextPort: number): boolean;
/** Avoid please-reconnect storms when port is unchanged and bridge is already up. */
export declare function shouldReconnectWebview(lastSyncedPort: number, nextPort: number, bridgeActive: boolean): boolean;
/** Panel: ignore rapid duplicate forceReconnect within window (e.g. double please-reconnect). */
export declare function shouldDebouncePanelReconnect(lastReconnectAtMs: number, nowMs: number, windowMs?: number): boolean;
