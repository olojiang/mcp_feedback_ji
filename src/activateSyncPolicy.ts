/** Extension activation sync schedule (testable, no vscode imports). */

export const EXTENSION_SYNC_DELAY_MS = 800;

export const EXTENSION_PANEL_FOCUS_DELAYS_MS = [1500, 3000, 5000] as const;

/** Single deferred syncWebview — avoids please-reconnect storms at 0/500/1500/3000ms. */
export function extensionSyncDelaysMs(): number[] {
    return [EXTENSION_SYNC_DELAY_MS];
}
