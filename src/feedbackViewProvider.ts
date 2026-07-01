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
import * as fs from 'fs';
import * as path from 'path';

type HtmlGetter = () => string;
type PortGetter = () => number;
type VersionGetter = () => string;

export class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | null = null;
    private _getHtml: HtmlGetter;
    private _getPort: PortGetter;
    private _getVersion: VersionGetter;
    private _forceResetCallback?: () => Promise<number>;
    private _fileWatcher?: fs.FSWatcher;

    constructor(getHtml: HtmlGetter, getPort: PortGetter, getVersion: VersionGetter) {
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
    }

    updateHtmlGetter(getHtml: HtmlGetter): void {
        this._getHtml = getHtml;
    }

    onForceReset(callback: () => Promise<number>): void {
        this._forceResetCallback = callback;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtml();
        this._setupMessageHandler(webviewView);
        this._setupHotReload(webviewView);
        this._pushServerInfo(webviewView);

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._pushServerInfo(webviewView);
            }
        });

        webviewView.onDidDispose(() => {
            this._view = null;
            this._stopHotReload();
        });
    }

    recreate(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml();
        }
    }

    focusInput(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'focus-input' });
        }
    }

    reconnect(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'reconnect' });
        }
    }

    /** Refresh webview HTML and push current extension port after reload / port change. */
    syncServer(_port: number): void {
        if (!this._view) return;
        this._view.webview.html = this._getHtml();
        setTimeout(() => {
            if (this._view) this._pushServerInfo(this._view);
        }, 50);
    }

    private _pushServerInfo(view: vscode.WebviewView): void {
        view.webview.postMessage({
            type: 'server-info',
            port: this._getPort(),
            version: this._getVersion(),
        });
    }

    private _setupMessageHandler(view: vscode.WebviewView): void {
        view.webview.onDidReceiveMessage((message: Record<string, unknown>) => {
            switch (message.type) {
                case 'get-server-info':
                    this._pushServerInfo(view);
                    break;

                case 'feedback-submitted':
                    vscode.window.setStatusBarMessage('Feedback submitted!', 1500);
                    break;

                case 'error':
                    vscode.window.showErrorMessage(`MCP Feedback: ${message.message}`);
                    break;

                case 'info':
                    vscode.window.showInformationMessage(`MCP Feedback: ${message.message}`);
                    break;

                case 'new-session':
                    this._focusPanel();
                    break;

                case 'force-reset':
                    if (this._forceResetCallback) {
                        this._forceResetCallback().then((newPort) => {
                            vscode.window.showInformationMessage(`MCP Feedback: Reset! Port ${newPort}`);
                        }).catch((e) => {
                            vscode.window.showErrorMessage(`MCP Feedback: Reset failed - ${e}`);
                        });
                    }
                    break;

                case 'open-in-editor':
                    vscode.commands.executeCommand('mcp-feedback-enhanced.openInEditor');
                    break;

                case 'reload-webview':
                    this.recreate();
                    break;

                case 'at-search':
                    this._handleAtSearch(message.query as string, view);
                    break;

                case 'log':
                    break;
            }
        });
    }

    private async _handleAtSearch(query: string, view: vscode.WebviewView): Promise<void> {
        if (!query) {
            view.webview.postMessage({ type: 'at-results', items: [] });
            return;
        }

        const items: Array<{ kind: string; label: string; detail: string; insertText: string }> = [];

        try {
            const filePattern = `**/*${query}*`;
            const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.next/**,**/build/**}';
            const files = await vscode.workspace.findFiles(filePattern, excludePattern, 15);
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;

            for (const file of files) {
                const rel = workspaceRoot ? vscode.workspace.asRelativePath(file, false) : file.fsPath;
                items.push({
                    kind: 'file',
                    label: path.basename(file.fsPath),
                    detail: rel,
                    insertText: rel,
                });
            }
        } catch {}

        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider', query
            );
            if (symbols) {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
                for (const sym of symbols.slice(0, 10)) {
                    const rel = workspaceRoot
                        ? vscode.workspace.asRelativePath(sym.location.uri, false)
                        : sym.location.uri.fsPath;
                    const line = sym.location.range.start.line + 1;
                    items.push({
                        kind: 'symbol',
                        label: sym.name,
                        detail: `${rel}:${line}`,
                        insertText: `${sym.name} (${rel}:${line})`,
                    });
                }
            }
        } catch {}

        const seen = new Set<string>();
        const unique = items.filter(it => {
            if (seen.has(it.insertText)) return false;
            seen.add(it.insertText);
            return true;
        }).slice(0, 20);

        view.webview.postMessage({ type: 'at-results', items: unique });
    }

    private _focusPanel(): void {
        vscode.commands.executeCommand('mcp-feedback-enhanced.feedbackPanelBottom.focus');
    }

    private _setupHotReload(view: vscode.WebviewView): void {
        if (!process.env.MCP_FEEDBACK_DEV) { return; }

        try {
            const htmlDir = path.join(__dirname, 'webview');
            if (!fs.existsSync(htmlDir)) { return; }

            this._fileWatcher = fs.watch(htmlDir, () => {
                if (view.visible) {
                    view.webview.html = this._getHtml();
                }
            });
        } catch { /* dev-only, ignore errors */ }
    }

    private _stopHotReload(): void {
        if (this._fileWatcher) {
            this._fileWatcher.close();
            this._fileWatcher = undefined;
        }
    }
}
