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
import * as os from 'os';

import type { FeedbackWSServer } from './wsServer';
import type { WebviewBridge } from './server/webviewBridge';
import { appendWebviewLog, webviewLogPath } from './webviewLog';
import { resolveFeedbackLogPath } from './logPaths';
import { listAllServers, readAgentContext, pruneTestRegistryEntries } from './fileStore';
import {
    enrichRegistryEntries,
    formatRegistryTable,
    versionSkewWarnings,
    buildDiagnoseBundle,
} from './registrySnapshot';
import { formatDeployStampLabel } from './deployStamp';
import { readDeployStamp } from './deployStampReader';
import { shouldReloadWebview, shouldReconnectWebview } from './webviewSyncPolicy';

type HtmlGetter = () => string;
type PortGetter = () => number;
type VersionGetter = () => string;
type HubGetter = () => FeedbackWSServer | undefined;

export class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | null = null;
    private _getHtml: HtmlGetter;
    private _getPort: PortGetter;
    private _getVersion: VersionGetter;
    private _getHub: HubGetter;
    private _extensionUri: vscode.Uri;
    private _bridge: WebviewBridge | null = null;
    private _lastSyncedPort = 0;
    private _forceResetCallback?: () => Promise<number>;
    private _fileWatcher?: fs.FSWatcher;

    constructor(getHtml: HtmlGetter, getPort: PortGetter, getVersion: VersionGetter, getHub: HubGetter, extensionUri: vscode.Uri) {
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
        this._getHub = getHub;
        this._extensionUri = extensionUri;
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
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'static'),
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
            ],
        };

        this._setupMessageHandler(webviewView);
        webviewView.webview.html = this._injectWebviewResources(webviewView);
        this._lastSyncedPort = this._getPort();
        this._setupHotReload(webviewView);

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && !this._bridge) {
                this._connectBridge(webviewView);
            }
        });

        webviewView.onDidDispose(() => {
            this._view = null;
            this._bridge?.dispose();
            this._bridge = null;
            this._stopHotReload();
        });
    }

    recreate(): void {
        if (this._view) {
            this._view.webview.html = this._injectWebviewResources(this._view);
            this._lastSyncedPort = this._getPort();
        }
    }

    focusInput(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'focus-input' });
        }
    }

    reconnect(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'please-reconnect' });
        }
    }

    /** Refresh webview when hub port changes; otherwise soft-reconnect only. */
    syncServer(port: number): void {
        if (!this._view) return;
        if (shouldReloadWebview(this._lastSyncedPort, port)) {
            this._lastSyncedPort = port;
            this._bridge?.dispose();
            this._bridge = null;
            this._view.webview.html = this._injectWebviewResources(this._view);
            return;
        }
        this._lastSyncedPort = port;
        if (!shouldReconnectWebview(this._lastSyncedPort, port, this._bridge !== null)) {
            this._pushServerInfo(this._view);
            return;
        }
        this.reconnect();
    }

    private _injectWebviewResources(view: vscode.WebviewView): string {
        let html = this._getHtml();
        const cacheKey = encodeURIComponent(this._getVersion());
        const erudaUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'static', 'vendor', 'eruda.js')
                .with({ query: `v=${cacheKey}` })
        );
        const panelStateUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelState.js')
                .with({ query: `v=${cacheKey}` })
        );
        const erudaPanelUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'erudaPanel.js')
                .with({ query: `v=${cacheKey}` })
        );
        const panelConnectionUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelConnection.js')
                .with({ query: `v=${cacheKey}` })
        );
        const themeContrastUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'themeContrast.js')
                .with({ query: `v=${cacheKey}` })
        );
        const cspSource = view.webview.cspSource;
        html = html.replace(/\{\{ERUDA_URI\}\}/g, erudaUri.toString());
        html = html.replace(/\{\{ERUDA_PANEL_URI\}\}/g, erudaPanelUri.toString());
        html = html.replace(/\{\{PANELSTATE_URI\}\}/g, panelStateUri.toString());
        html = html.replace(/\{\{PANELCONNECTION_URI\}\}/g, panelConnectionUri.toString());
        html = html.replace(/\{\{THEMECONTRAST_URI\}\}/g, themeContrastUri.toString());
        html = html.replace(/\{\{CSP_SOURCE\}\}/g, cspSource);
        return html;
    }

    private _attachBridge(view: vscode.WebviewView): void {
        const hub = this._getHub();
        if (!hub || this._bridge) return;

        this._bridge = hub.attachWebview((msg) => {
            view.webview.postMessage({ type: 'hub-message', data: msg });
        });
    }

    private _registryEntries() {
        return enrichRegistryEntries(listAllServers(), (pid) => {
            try {
                process.kill(pid, 0);
                return true;
            } catch {
                return false;
            }
        });
    }

    private _versionWarnings(): string[] {
        return versionSkewWarnings(this._registryEntries(), this._getVersion(), process.pid);
    }

    private _bridgePayload(): Record<string, unknown> {
        const deployStamp = readDeployStamp();
        return {
            type: 'bridge-connected',
            port: this._getPort(),
            version: this._getVersion(),
            pid: process.pid,
            versionWarnings: this._versionWarnings(),
            deployStamp,
            deployLabel: formatDeployStampLabel(deployStamp, this._getVersion()),
        };
    }

    /** Attach bridge only after webview requests hub-connect (avoids lost bridge-connected). */
    private _connectBridge(view: vscode.WebviewView): void {
        if (this._bridge) {
            view.webview.postMessage(this._bridgePayload());
            return;
        }
        this._attachBridge(view);
        view.webview.postMessage(this._bridgePayload());
    }

    private _pushServerInfo(view: vscode.WebviewView): void {
        const deployStamp = readDeployStamp();
        view.webview.postMessage({
            type: 'server-info',
            port: this._getPort(),
            version: this._getVersion(),
            pid: process.pid,
            versionWarnings: this._versionWarnings(),
            deployStamp,
            deployLabel: formatDeployStampLabel(deployStamp, this._getVersion()),
        });
    }

    private _handleDebugRequest(view: vscode.WebviewView): void {
        const hub = this._getHub();
        const rawRegistry = listAllServers();
        const registry = enrichRegistryEntries(rawRegistry, (pid) => {
            try {
                process.kill(pid, 0);
                return true;
            } catch {
                return false;
            }
        });
        const skew = versionSkewWarnings(registry, this._getVersion(), process.pid);
        const report: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            extension: {
                pid: process.pid,
                version: this._getVersion(),
                port: this._getPort(),
                bridgeActive: this._bridge !== null,
                viewVisible: view.visible,
                ...(hub?.getDebugInfo() ?? {}),
            },
            registry: {
                entries: registry,
                table: formatRegistryTable(registry),
            },
            agentContext: readAgentContext(),
            versionSkew: skew,
            deployStamp: readDeployStamp(),
            logPaths: {
                extension: resolveFeedbackLogPath('extension'),
                mcpServer: resolveFeedbackLogPath('mcp-server'),
                webview: resolveFeedbackLogPath('webview'),
            },
        };
        report.diagnoseBundle = buildDiagnoseBundle(report);

        view.webview.postMessage({ type: 'debug-report', report });
    }


    private _handlePruneTestRegistry(view: vscode.WebviewView): void {
        const result = pruneTestRegistryEntries((pid) => {
            try {
                process.kill(pid, 0);
                return true;
            } catch {
                return false;
            }
        });
        view.webview.postMessage({
            type: 'prune-test-registry-result',
            result,
        });
        void this._handleDebugRequest(view);
    }

    private _setupMessageHandler(view: vscode.WebviewView): void {
        view.webview.onDidReceiveMessage((message: Record<string, unknown>) => {
            switch (message.type) {
                case 'get-server-info':
                    this._pushServerInfo(view);
                    break;

                case 'webview-ready':
                    if (!this._bridge) {
                        this._connectBridge(view);
                    } else {
                        view.webview.postMessage(this._bridgePayload());
                    }
                    break;

                case 'hub-connect':
                    this._connectBridge(view);
                    break;

                case 'request-debug':
                    this._handleDebugRequest(view);
                    break;

                case 'prune-test-registry':
                    this._handlePruneTestRegistry(view);
                    break;

                case 'open-webview-devtools':
                    void vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
                    break;

                case 'copy-debug-json':
                    if (typeof message.json === 'string') {
                        void vscode.env.clipboard.writeText(message.json).then(
                            () => vscode.window.showInformationMessage('MCP Feedback: debug JSON copied'),
                            () => vscode.window.showWarningMessage('MCP Feedback: copy failed'),
                        );
                    }
                    break;

                case 'hub-message':
                    if (this._bridge && message.data) {
                        this._bridge.deliver(JSON.stringify(message.data));
                    }
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

                case 'open-log':
                    void this._openLogFile(message.target as string);
                    break;

                case 'open-mcp-output':
                    void this._openMcpOutput();
                    break;

                case 'export-sessions':
                    void this._exportSessions(message.data as Record<string, unknown>);
                    break;

                case 'log':
                    if (typeof message.msg === 'string') {
                        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                        appendWebviewLog(message.msg, typeof projectPath === 'string' ? projectPath : undefined);
                    }
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
                    view.webview.html = this._injectWebviewResources(view);
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

    private async _openLogFile(target: string): Promise<void> {
        const allowed = new Set(['extension', 'mcp-server', 'webview']);
        if (!allowed.has(target)) {
            vscode.window.showWarningMessage(`MCP Feedback: unknown log target "${target}"`);
            return;
        }
        const logPath = resolveFeedbackLogPath(target as 'extension' | 'mcp-server' | 'webview');
        try {
            if (!fs.existsSync(logPath)) {
                fs.mkdirSync(path.dirname(logPath), { recursive: true });
                fs.writeFileSync(logPath, '', 'utf8');
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(logPath));
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (e) {
            vscode.window.showErrorMessage(`MCP Feedback: cannot open log — ${e}`);
        }
    }

    private async _openMcpOutput(): Promise<void> {
        const tried = [
            'mcp.showOutput',
            'workbench.action.output.show',
        ];
        for (const cmd of tried) {
            try {
                await vscode.commands.executeCommand(cmd);
                vscode.window.showInformationMessage(
                    'MCP Feedback: Output panel opened — select "MCP: user-mcp-feedback-enhanced" if needed',
                );
                return;
            } catch {
                // try next
            }
        }
        await this._openLogFile('mcp-server');
    }

    private async _exportSessions(data: Record<string, unknown>): Promise<void> {
        const defaultName = `mcp-feedback-sessions-${Date.now()}.json`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', defaultName)),
            filters: { JSON: ['json'] },
        });
        if (!uri) return;
        fs.writeFileSync(uri.fsPath, JSON.stringify(data, null, 2), 'utf8');
        vscode.window.showInformationMessage(`MCP Feedback: exported sessions to ${path.basename(uri.fsPath)}`);
    }
}
