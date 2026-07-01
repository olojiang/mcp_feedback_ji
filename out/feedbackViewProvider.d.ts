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
type HtmlGetter = () => string;
type PortGetter = () => number;
type VersionGetter = () => string;
export declare class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private _view;
    private _getHtml;
    private _getPort;
    private _getVersion;
    private _forceResetCallback?;
    private _fileWatcher?;
    constructor(getHtml: HtmlGetter, getPort: PortGetter, getVersion: VersionGetter);
    updateHtmlGetter(getHtml: HtmlGetter): void;
    onForceReset(callback: () => Promise<number>): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    recreate(): void;
    focusInput(): void;
    reconnect(): void;
    /** Refresh webview HTML and push current extension port after reload / port change. */
    syncServer(_port: number): void;
    private _pushServerInfo;
    private _setupMessageHandler;
    private _handleAtSearch;
    private _focusPanel;
    private _setupHotReload;
    private _stopHotReload;
}
export {};
