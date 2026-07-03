/** Extension activation sync schedule (testable, no vscode imports). */
export declare const EXTENSION_SYNC_DELAY_MS = 800;
export declare const EXTENSION_PANEL_FOCUS_DELAYS_MS: readonly [1500, 3000, 5000];
/** Single deferred syncWebview — avoids please-reconnect storms at 0/500/1500/3000ms. */
export declare function extensionSyncDelaysMs(): number[];
