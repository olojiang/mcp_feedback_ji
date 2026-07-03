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
import { appendWebviewLog, truncateWebviewLog, webviewLogPath } from './webviewLog';
import { resolveFeedbackLogPath } from './logPaths';
import { listAllServers, readAgentContext, pruneTestRegistryEntries } from './fileStore';
import {
    enrichRegistryEntries,
    formatRegistryTable,
    versionSkewWarnings,
} from './registrySnapshot';
import { buildDebugReport } from './webviewDiagnoseHandlers';
import { formatDeployStampLabel, deployReloadBannerText } from './deployStamp';
import { readDeployStamp } from './deployStampReader';
import { readLogTailLines } from './logTail';
import { quickRepliesFromConfig } from './quickReplySettings';
import { shouldReloadWebview, shouldReconnectWebview } from './webviewSyncPolicy';
import { buildDefaultWebviewHandlers, createWebviewMessageRouter } from './webviewMessageRouter';
import { sanitizeUnreplacedWebviewPlaceholders } from './extensionHelpers';

type HtmlGetter = () => string;
type PortGetter = () => number;
type VersionGetter = () => string;
type HubGetter = () => FeedbackWSServer | undefined;

export class FeedbackViewProvider implements vscode.WebviewViewProvider {
    private _view: vscode.WebviewView | null = null;
    private _getHtml: HtmlGetter;
    private _getPort: PortGetter;
    private _getVersion: VersionGetter;
    private _getMemoryVersion: VersionGetter;
    private _getHub: HubGetter;
    private _extensionUri: vscode.Uri;
    private _bridge: WebviewBridge | null = null;
    private _lastSyncedPort = 0;
    private _forceResetCallback?: () => Promise<number>;
    private _fileWatcher?: fs.FSWatcher;
    private _webviewReadyAcked = false;

    constructor(
        getHtml: HtmlGetter,
        getPort: PortGetter,
        getVersion: VersionGetter,
        getHub: HubGetter,
        extensionUri: vscode.Uri,
        getMemoryVersion?: VersionGetter,
    ) {
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
        this._getMemoryVersion = getMemoryVersion ?? getVersion;
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
        this._webviewReadyAcked = false;
        this._bridge?.dispose();
        this._bridge = null;
        this._stopBridgeBroadcast();

        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
        appendWebviewLog(
            `resolveWebviewView visible=${webviewView.visible} v=${this._getVersion()}`,
            typeof projectPath === 'string' ? projectPath : undefined,
        );

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

        if (webviewView.visible) {
            this._connectBridge(webviewView);
        }

        webviewView.onDidDispose(() => {
            this._view = null;
            this._bridge?.dispose();
            this._bridge = null;
            this._stopHotReload();
        });
    }

    recreate(): void {
        if (this._view) {
            const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
            const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
            appendWebviewLog('webview html reload reason=recreate', typeof projectPath === 'string' ? projectPath : undefined);
            this._webviewReadyAcked = false;
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
            const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
            const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
            appendWebviewLog(`webview html reload reason=port-change ${this._lastSyncedPort}->${port}`, typeof projectPath === 'string' ? projectPath : undefined);
            this._lastSyncedPort = port;
            this._webviewReadyAcked = false;
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
        const panelStateMarkdownUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateMarkdown.js')
                .with({ query: `v=${cacheKey}` })
        );
        const panelStateUxUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateUx.js')
                .with({ query: `v=${cacheKey}` })
        );
        const panelStateTransportUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateTransport.js')
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
        const panelAppUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelApp.js')
                .with({ query: `v=${cacheKey}` })
        );
        const themeContrastUri = view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'themeContrast.js')
                .with({ query: `v=${cacheKey}` })
        );
        const cspSource = view.webview.cspSource;
        html = html.replace(/\{\{ERUDA_URI\}\}/g, erudaUri.toString());
        html = html.replace(/\{\{ERUDA_PANEL_URI\}\}/g, erudaPanelUri.toString());
        html = html.replace(/\{\{PANELSTATE_MARKDOWN_URI\}\}/g, panelStateMarkdownUri.toString());
        html = html.replace(/\{\{PANELSTATE_UX_URI\}\}/g, panelStateUxUri.toString());
        html = html.replace(/\{\{PANELSTATE_TRANSPORT_URI\}\}/g, panelStateTransportUri.toString());
        html = html.replace(/\{\{PANELSTATE_URI\}\}/g, panelStateUri.toString());
        html = html.replace(/\{\{PANELCONNECTION_URI\}\}/g, panelConnectionUri.toString());
        html = html.replace(/\{\{PANELAPP_URI\}\}/g, panelAppUri.toString());
        html = html.replace(/\{\{THEMECONTRAST_URI\}\}/g, themeContrastUri.toString());
        html = html.replace(/\{\{CSP_SOURCE\}\}/g, cspSource);
        html = sanitizeUnreplacedWebviewPlaceholders(html);
        html += `\n<!-- mcp-panel-boot v=${this._getVersion()} -->\n`;
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

    private _quickRepliesFromSettings() {
        try {
            const getConfiguration = vscode.workspace?.getConfiguration;
            if (typeof getConfiguration !== 'function') {
                return quickRepliesFromConfig(undefined);
            }
            return quickRepliesFromConfig(
                getConfiguration.call(vscode.workspace, 'mcpFeedback').get('quickReplies'),
            );
        } catch {
            return quickRepliesFromConfig(undefined);
        }
    }

    private _hostPayload(type: 'bridge-connected' | 'server-info'): Record<string, unknown> {
        const deployStamp = readDeployStamp();
        const version = this._getVersion();
        const memoryVersion = this._getMemoryVersion();
        return {
            type,
            port: this._getPort(),
            version,
            memoryVersion,
            pid: process.pid,
            versionWarnings: this._versionWarnings(),
            deployStamp,
            deployLabel: formatDeployStampLabel(deployStamp, version),
            deployReloadBanner: deployReloadBannerText(memoryVersion, version, deployStamp),
            quickReplies: this._quickRepliesFromSettings(),
        };
    }

    private _bridgePayload(): Record<string, unknown> {
        return this._hostPayload('bridge-connected');
    }

    private _stopBridgeBroadcast(): void {
        if (this._bridgeBroadcastTimer) {
            clearInterval(this._bridgeBroadcastTimer);
            this._bridgeBroadcastTimer = undefined;
        }
    }

    private _bridgeBroadcastTimer: ReturnType<typeof setInterval> | undefined;

    /** Attach bridge; repost bridge-connected until webview acknowledges (avoids early-connect race). */
    private _connectBridge(view: vscode.WebviewView): void {
        if (this._bridgeBroadcastTimer) {
            clearInterval(this._bridgeBroadcastTimer);
            this._bridgeBroadcastTimer = undefined;
        }
        if (this._bridge) {
            this._broadcastBridgeConnected(view);
            return;
        }
        this._attachBridge(view);
        this._broadcastBridgeConnected(view);
    }

    private _broadcastBridgeConnected(view: vscode.WebviewView): void {
        const post = (): void => {
            view.webview.postMessage(this._bridgePayload());
        };
        post();
        let attempts = 0;
        this._bridgeBroadcastTimer = setInterval(() => {
            post();
            attempts += 1;
            if (attempts >= 30 && this._bridgeBroadcastTimer) {
                clearInterval(this._bridgeBroadcastTimer);
                this._bridgeBroadcastTimer = undefined;
            }
        }, 500);
    }

    private _pushServerInfo(view: vscode.WebviewView): void {
        view.webview.postMessage(this._hostPayload('server-info'));
    }

    private _handleDebugRequest(view: vscode.WebviewView, traceId?: string): void {
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
        const mcpLogPath = resolveFeedbackLogPath('mcp-server');
        const report = buildDebugReport({
            traceId,
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
                mcpServer: mcpLogPath,
                webview: resolveFeedbackLogPath('webview'),
            },
            mcpLogLines: readLogTailLines(mcpLogPath, 50),
        });

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
        const handlers = {
            ...buildDefaultWebviewHandlers(vscode),
            'webview-ready': (msg: Record<string, unknown>, v: vscode.WebviewView, ctx: import('./webviewMessageRouter.js').WebviewRouterContext) => {
                if (this._webviewReadyAcked) {
                    const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                    const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                    appendWebviewLog(`webview-ready ignored duplicate phase=${String(msg.phase || '')}`, typeof projectPath === 'string' ? projectPath : undefined);
                    return;
                }
                this._webviewReadyAcked = true;
                ctx.stopBridgeBroadcast?.();
                if (!ctx.hasBridge()) ctx.connectBridge(v);
                else v.webview.postMessage(ctx.bridgePayload());
                const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                appendWebviewLog(`webview-ready phase=${String(msg.phase || 'default')}`, typeof projectPath === 'string' ? projectPath : undefined);
            },
            'request-debug': (msg: Record<string, unknown>, v: vscode.WebviewView, ctx: import('./webviewMessageRouter.js').WebviewRouterContext) => {
                const traceId = typeof msg.trace_id === 'string' ? msg.trace_id : undefined;
                ctx.handleDebug(v, traceId);
            },
            'prune-test-registry': (_msg: Record<string, unknown>, v: vscode.WebviewView, ctx: import('./webviewMessageRouter.js').WebviewRouterContext) => {
                ctx.handlePrune(v);
            },
            'open-mcp-output': () => {
                void this._openMcpOutput();
            },
            log: (message: Record<string, unknown>) => {
                if (typeof message.msg === 'string') {
                    const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                    const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                    appendWebviewLog(message.msg, typeof projectPath === 'string' ? projectPath : undefined);
                }
            },
        };
        const route = createWebviewMessageRouter(handlers);
        view.webview.onDidReceiveMessage((message: Record<string, unknown>) => {
            route(message, view, {
                pushServerInfo: (v) => this._pushServerInfo(v),
                connectBridge: (v) => this._connectBridge(v),
                stopBridgeBroadcast: () => this._stopBridgeBroadcast(),
                bridgePayload: () => this._bridgePayload(),
                hasBridge: () => this._bridge !== null,
                deliverHubMessage: (data) => {
                    if (this._bridge && data) {
                        this._bridge.deliver(JSON.stringify(data));
                    }
                },
                handleDebug: (v, traceId) => this._handleDebugRequest(v, traceId),
                handlePrune: (v) => this._handlePruneTestRegistry(v),
                handleAtSearch: (q, v) => this._handleAtSearch(q, v),
                openLog: (t) => this._openLogFile(t),
                truncateLog: (t) => this._truncateLogFile(t),
                appendWebviewLog: (msg) => {
                    const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                    const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                    appendWebviewLog(msg, typeof projectPath === 'string' ? projectPath : undefined);
                },
                exportSessions: (d) => this._exportSessions(d),
                forceReset: this._forceResetCallback,
                recreate: () => this.recreate(),
                focusPanel: () => this._focusPanel(),
            });
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

    private async _truncateLogFile(target: string): Promise<void> {
        if (target !== 'webview') {
            vscode.window.showWarningMessage(`MCP Feedback: truncate only supported for webview (got "${target}")`);
            return;
        }
        try {
            const logPath = truncateWebviewLog();
            appendWebviewLog('log truncated by user');
            vscode.window.showInformationMessage(`MCP Feedback: cleared ${path.basename(logPath)}`);
        } catch (e) {
            vscode.window.showErrorMessage(`MCP Feedback: truncate failed — ${e}`);
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
