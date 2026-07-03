/**
 * Webview view provider for the bottom panel.
 *
 * Responsibilities:
 * - Resolve webview with generated HTML
 * - Handle messages from webview (feedback, pending, navigation)
 * - Hot-reload in dev mode
 * - Panel focus and input focus
 */
import * as vscode from 'vscode';
import type { FeedbackWSServer } from './wsServer';
type HtmlGetter = () => string;
type PortGetter = () => number;
type VersionGetter = () => string;
type HubGetter = () => FeedbackWSServer | undefined;
export declare class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private _view;
    private _getHtml;
    private _getPort;
    private _getVersion;
    private _getMemoryVersion;
    private _getHub;
    private _extensionUri;
    private _bridge;
    private _lastSyncedPort;
    private _forceResetCallback?;
    private _fileWatcher?;
    constructor(getHtml: HtmlGetter, getPort: PortGetter, getVersion: VersionGetter, getHub: HubGetter, extensionUri: vscode.Uri, getMemoryVersion?: VersionGetter);
    updateHtmlGetter(getHtml: HtmlGetter): void;
    onForceReset(callback: () => Promise<number>): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    recreate(): void;
    focusInput(): void;
    reconnect(): void;
    /** Refresh webview when hub port changes; otherwise soft-reconnect only. */
    syncServer(port: number): void;
    private _injectWebviewResources;
    private _attachBridge;
    private _registryEntries;
    private _versionWarnings;
    private _quickRepliesFromSettings;
    private _bridgePayload;
    /** Attach bridge only after webview requests hub-connect (avoids lost bridge-connected). */
    private _connectBridge;
    private _pushServerInfo;
    private _handleDebugRequest;
    private _handlePruneTestRegistry;
    private _setupMessageHandler;
    private _handleAtSearch;
    private _focusPanel;
    private _setupHotReload;
    private _stopHotReload;
    private _openLogFile;
    private _openMcpOutput;
    private _exportSessions;
}
export {};
