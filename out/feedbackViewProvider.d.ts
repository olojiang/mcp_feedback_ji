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
    private _getHub;
    private _extensionUri;
    private _bridge;
    private _forceResetCallback?;
    private _fileWatcher?;
    constructor(getHtml: HtmlGetter, getPort: PortGetter, getVersion: VersionGetter, getHub: HubGetter, extensionUri: vscode.Uri);
    updateHtmlGetter(getHtml: HtmlGetter): void;
    onForceReset(callback: () => Promise<number>): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    recreate(): void;
    focusInput(): void;
    reconnect(): void;
    /** Refresh webview HTML and re-attach in-process bridge. */
    syncServer(_port: number): void;
    private _injectWebviewResources;
    private _attachBridge;
    /** Attach bridge only after webview requests hub-connect (avoids lost bridge-connected). */
    private _connectBridge;
    private _pushServerInfo;
    private _handleDebugRequest;
    private _setupMessageHandler;
    private _handleAtSearch;
    private _focusPanel;
    private _setupHotReload;
    private _stopHotReload;
}
export {};
