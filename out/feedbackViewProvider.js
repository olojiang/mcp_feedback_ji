"use strict";
/**
 * Webview view provider for the bottom panel.
 *
 * Responsibilities:
 * - Resolve webview with generated HTML
 * - Handle messages from webview (feedback, pending, navigation)
 * - Hot-reload in dev mode
 * - Panel focus and input focus
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const webviewLog_1 = require("./webviewLog");
const logPaths_1 = require("./logPaths");
const fileStore_1 = require("./fileStore");
const registrySnapshot_1 = require("./registrySnapshot");
const webviewDiagnoseHandlers_1 = require("./webviewDiagnoseHandlers");
const deployStamp_1 = require("./deployStamp");
const deployStampReader_1 = require("./deployStampReader");
const logTail_1 = require("./logTail");
const quickReplySettings_1 = require("./quickReplySettings");
const webviewSyncPolicy_1 = require("./webviewSyncPolicy");
const webviewMessageRouter_1 = require("./webviewMessageRouter");
const extensionHelpers_1 = require("./extensionHelpers");
const atSearchService_1 = require("./atSearchService");
class FeedbackViewProvider {
    constructor(getHtml, getPort, getVersion, getHub, extensionUri, getMemoryVersion) {
        this._view = null;
        this._bridge = null;
        this._lastSyncedPort = 0;
        this._webviewReadyAcked = false;
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
        this._getMemoryVersion = getMemoryVersion ?? getVersion;
        this._getHub = getHub;
        this._extensionUri = extensionUri;
        const toSearchResource = (uri) => ({
            path: vscode.workspace.workspaceFolders?.[0]
                ? vscode.workspace.asRelativePath(uri, false)
                : uri.fsPath,
        });
        this._atSearchService = new atSearchService_1.AtSearchService({
            findFiles: async (pattern, excludePattern, maxResults) => {
                const files = await vscode.workspace.findFiles(pattern, excludePattern, maxResults);
                return files.map(toSearchResource);
            },
            findSymbols: async (query) => {
                const symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query);
                return symbols?.map(symbol => ({
                    name: symbol.name,
                    resource: toSearchResource(symbol.location.uri),
                    line: symbol.location.range.start.line,
                }));
            },
            log: webviewLog_1.appendWebviewLog,
        });
    }
    updateHtmlGetter(getHtml) {
        this._getHtml = getHtml;
    }
    onForceReset(callback) {
        this._forceResetCallback = callback;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        this._webviewReadyAcked = false;
        this._bridge?.dispose();
        this._bridge = null;
        this._stopBridgeBroadcast();
        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
        (0, webviewLog_1.appendWebviewLog)(`resolveWebviewView visible=${webviewView.visible} v=${this._getVersion()}`, typeof projectPath === 'string' ? projectPath : undefined);
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
            if (webviewView.visible) {
                this._connectBridge(webviewView);
            }
        });
        if (webviewView.visible) {
            this._connectBridge(webviewView);
        }
        webviewView.onDidDispose(() => {
            const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
            const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
            (0, webviewLog_1.appendWebviewLog)('webview disposed', typeof projectPath === 'string' ? projectPath : undefined);
            this._view = null;
            this._bridge?.dispose();
            this._bridge = null;
            this._stopBridgeBroadcast();
            this._stopHotReload();
        });
    }
    recreate() {
        if (this._view) {
            const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
            const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
            (0, webviewLog_1.appendWebviewLog)('webview html reload reason=recreate', typeof projectPath === 'string' ? projectPath : undefined);
            this._webviewReadyAcked = false;
            this._view.webview.html = this._injectWebviewResources(this._view);
            this._lastSyncedPort = this._getPort();
        }
    }
    focusInput() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'focus-input' });
        }
    }
    reconnect() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'please-reconnect' });
        }
    }
    /** Refresh webview when hub port changes; otherwise soft-reconnect only. */
    syncServer(port) {
        if (!this._view)
            return;
        if ((0, webviewSyncPolicy_1.shouldReloadWebview)(this._lastSyncedPort, port)) {
            const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
            const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
            (0, webviewLog_1.appendWebviewLog)(`webview html reload reason=port-change ${this._lastSyncedPort}->${port}`, typeof projectPath === 'string' ? projectPath : undefined);
            this._lastSyncedPort = port;
            this._webviewReadyAcked = false;
            this._bridge?.dispose();
            this._bridge = null;
            this._view.webview.html = this._injectWebviewResources(this._view);
            return;
        }
        this._lastSyncedPort = port;
        if (!(0, webviewSyncPolicy_1.shouldReconnectWebview)(this._lastSyncedPort, port, this._bridge !== null)) {
            this._pushServerInfo(this._view);
            return;
        }
        this.reconnect();
    }
    _injectWebviewResources(view) {
        let html = this._getHtml();
        const cacheKey = encodeURIComponent(this._getVersion());
        const erudaUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'static', 'vendor', 'eruda.js')
            .with({ query: `v=${cacheKey}` }));
        const panelStateMarkdownUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateMarkdown.js')
            .with({ query: `v=${cacheKey}` }));
        const panelStateUxUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateUx.js')
            .with({ query: `v=${cacheKey}` }));
        const panelStateSessionsViewUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateSessionsView.js')
            .with({ query: `v=${cacheKey}` }));
        const panelStateTransportUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelStateTransport.js')
            .with({ query: `v=${cacheKey}` }));
        const panelAgentResumeWatchUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelAgentResumeWatch.js')
            .with({ query: `v=${cacheKey}` }));
        const panelStateUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelState.js')
            .with({ query: `v=${cacheKey}` }));
        const erudaPanelUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'erudaPanel.js')
            .with({ query: `v=${cacheKey}` }));
        const panelConnectionUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelConnection.js')
            .with({ query: `v=${cacheKey}` }));
        const panelPathReferencesUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelPathReferences.js')
            .with({ query: `v=${cacheKey}` }));
        const panelAppUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelApp.js')
            .with({ query: `v=${cacheKey}` }));
        const themeContrastUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'themeContrast.js')
            .with({ query: `v=${cacheKey}` }));
        const cspSource = view.webview.cspSource;
        html = html.replace(/\{\{ERUDA_URI\}\}/g, erudaUri.toString());
        html = html.replace(/\{\{ERUDA_PANEL_URI\}\}/g, erudaPanelUri.toString());
        html = html.replace(/\{\{PANELSTATE_MARKDOWN_URI\}\}/g, panelStateMarkdownUri.toString());
        html = html.replace(/\{\{PANELSTATE_UX_URI\}\}/g, panelStateUxUri.toString());
        html = html.replace(/\{\{PANELSTATE_SESSIONS_VIEW_URI\}\}/g, panelStateSessionsViewUri.toString());
        html = html.replace(/\{\{PANELSTATE_TRANSPORT_URI\}\}/g, panelStateTransportUri.toString());
        html = html.replace(/\{\{PANEL_AGENT_RESUME_WATCH_URI\}\}/g, panelAgentResumeWatchUri.toString());
        html = html.replace(/\{\{PANELSTATE_URI\}\}/g, panelStateUri.toString());
        html = html.replace(/\{\{PANELCONNECTION_URI\}\}/g, panelConnectionUri.toString());
        html = html.replace(/\{\{PANEL_PATH_REFERENCES_URI\}\}/g, panelPathReferencesUri.toString());
        html = html.replace(/\{\{PANELAPP_URI\}\}/g, panelAppUri.toString());
        html = html.replace(/\{\{THEMECONTRAST_URI\}\}/g, themeContrastUri.toString());
        html = html.replace(/\{\{CSP_SOURCE\}\}/g, cspSource);
        html = (0, extensionHelpers_1.sanitizeUnreplacedWebviewPlaceholders)(html);
        html += `\n<!-- mcp-panel-boot v=${this._getVersion()} -->\n`;
        return html;
    }
    _attachBridge(view) {
        const hub = this._getHub();
        if (!hub || this._bridge)
            return;
        this._bridge = hub.attachWebview((msg) => {
            view.webview.postMessage({ type: 'hub-message', data: msg });
        });
    }
    _registryEntries() {
        return (0, registrySnapshot_1.enrichRegistryEntries)((0, fileStore_1.listAllServers)(), (pid) => {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch {
                return false;
            }
        });
    }
    _versionWarnings() {
        return (0, registrySnapshot_1.versionSkewWarnings)(this._registryEntries(), this._getVersion(), process.pid);
    }
    _quickRepliesFromSettings() {
        try {
            const getConfiguration = vscode.workspace?.getConfiguration;
            if (typeof getConfiguration !== 'function') {
                return (0, quickReplySettings_1.quickRepliesFromConfig)(undefined);
            }
            return (0, quickReplySettings_1.quickRepliesFromConfig)(getConfiguration.call(vscode.workspace, 'mcpFeedback').get('quickReplies'));
        }
        catch {
            return (0, quickReplySettings_1.quickRepliesFromConfig)(undefined);
        }
    }
    _hostPayload(type) {
        const deployStamp = (0, deployStampReader_1.readDeployStamp)();
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
            deployLabel: (0, deployStamp_1.formatDeployStampLabel)(deployStamp, version),
            deployReloadBanner: (0, deployStamp_1.deployReloadBannerText)(memoryVersion, version, deployStamp),
            quickReplies: this._quickRepliesFromSettings(),
        };
    }
    _bridgePayload() {
        return this._hostPayload('bridge-connected');
    }
    _stopBridgeBroadcast() {
        if (this._bridgeBroadcastTimer) {
            clearInterval(this._bridgeBroadcastTimer);
            this._bridgeBroadcastTimer = undefined;
        }
    }
    /** Attach bridge; repost bridge-connected until webview acknowledges (avoids early-connect race). */
    _connectBridge(view) {
        if (this._bridgeBroadcastTimer) {
            clearInterval(this._bridgeBroadcastTimer);
            this._bridgeBroadcastTimer = undefined;
        }
        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
        if (this._bridge && !this._bridge.isAlive()) {
            (0, webviewLog_1.appendWebviewLog)('_connectBridge: bridge dead, recreating', typeof projectPath === 'string' ? projectPath : undefined);
            this._bridge.dispose();
            this._bridge = null;
        }
        if (this._bridge) {
            this._broadcastBridgeConnected(view);
            return;
        }
        (0, webviewLog_1.appendWebviewLog)('_connectBridge: attaching new bridge', typeof projectPath === 'string' ? projectPath : undefined);
        this._attachBridge(view);
        this._broadcastBridgeConnected(view);
    }
    _broadcastBridgeConnected(view) {
        const post = () => {
            if (!this._view) {
                this._stopBridgeBroadcast();
                return;
            }
            view.webview.postMessage(this._bridgePayload());
        };
        post();
        let attempts = 0;
        this._bridgeBroadcastTimer = setInterval(() => {
            attempts += 1;
            if (!this._view || attempts >= 6) {
                if (attempts >= 6 && this._view) {
                    const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                    const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                    (0, webviewLog_1.appendWebviewLog)('bridge_connected_broadcast_exhausted attempts=6', typeof projectPath === 'string' ? projectPath : undefined);
                }
                this._stopBridgeBroadcast();
                return;
            }
            post();
        }, 500);
    }
    _pushServerInfo(view) {
        view.webview.postMessage(this._hostPayload('server-info'));
    }
    _handleDebugRequest(view, traceId) {
        const hub = this._getHub();
        const rawRegistry = (0, fileStore_1.listAllServers)();
        const registry = (0, registrySnapshot_1.enrichRegistryEntries)(rawRegistry, (pid) => {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch {
                return false;
            }
        });
        const skew = (0, registrySnapshot_1.versionSkewWarnings)(registry, this._getVersion(), process.pid);
        const mcpLogPath = (0, logPaths_1.resolveFeedbackLogPath)('mcp-server');
        const report = (0, webviewDiagnoseHandlers_1.buildDebugReport)({
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
                table: (0, registrySnapshot_1.formatRegistryTable)(registry),
            },
            agentContext: (0, fileStore_1.readAgentContext)(),
            versionSkew: skew,
            deployStamp: (0, deployStampReader_1.readDeployStamp)(),
            logPaths: {
                extension: (0, logPaths_1.resolveFeedbackLogPath)('extension'),
                mcpServer: mcpLogPath,
                webview: (0, logPaths_1.resolveFeedbackLogPath)('webview'),
            },
            mcpLogLines: (0, logTail_1.readLogTailLines)(mcpLogPath, 50),
        });
        view.webview.postMessage({ type: 'debug-report', report });
    }
    _handlePruneTestRegistry(view) {
        const result = (0, fileStore_1.pruneTestRegistryEntries)((pid) => {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch {
                return false;
            }
        });
        view.webview.postMessage({
            type: 'prune-test-registry-result',
            result,
        });
        void this._handleDebugRequest(view);
    }
    _setupMessageHandler(view) {
        const handlers = {
            ...(0, webviewMessageRouter_1.buildDefaultWebviewHandlers)(vscode),
            'webview-ready': (msg, v, ctx) => {
                const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                if (this._webviewReadyAcked) {
                    (0, webviewLog_1.appendWebviewLog)(`webview-ready reconnect phase=${String(msg.phase || '')}`, typeof projectPath === 'string' ? projectPath : undefined);
                    ctx.connectBridge(v);
                    return;
                }
                this._webviewReadyAcked = true;
                ctx.stopBridgeBroadcast?.();
                if (!ctx.hasBridge())
                    ctx.connectBridge(v);
                else
                    v.webview.postMessage(ctx.bridgePayload());
                (0, webviewLog_1.appendWebviewLog)(`webview-ready phase=${String(msg.phase || 'default')}`, typeof projectPath === 'string' ? projectPath : undefined);
            },
            'request-debug': (msg, v, ctx) => {
                const traceId = typeof msg.trace_id === 'string' ? msg.trace_id : undefined;
                ctx.handleDebug(v, traceId);
            },
            'prune-test-registry': (_msg, v, ctx) => {
                ctx.handlePrune(v);
            },
            'open-mcp-output': () => {
                void this._openMcpOutput();
            },
            log: (message) => {
                if (typeof message.msg === 'string') {
                    const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                    const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                    (0, webviewLog_1.appendWebviewLog)(message.msg, typeof projectPath === 'string' ? projectPath : undefined);
                }
            },
        };
        const route = (0, webviewMessageRouter_1.createWebviewMessageRouter)(handlers);
        view.webview.onDidReceiveMessage((message) => {
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
                    else if (data) {
                        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                        (0, webviewLog_1.appendWebviewLog)('bridge_deliver_skipped reason=no_bridge', typeof projectPath === 'string' ? projectPath : undefined);
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
                    (0, webviewLog_1.appendWebviewLog)(msg, typeof projectPath === 'string' ? projectPath : undefined);
                },
                exportSessions: (d) => this._exportSessions(d),
                forceReset: this._forceResetCallback,
                recreate: () => this.recreate(),
                focusPanel: () => this._focusPanel(),
            });
        });
    }
    async _handleAtSearch(query, view) {
        await this._atSearchService.search(query, (items) => {
            view.webview.postMessage({ type: 'at-results', items });
        });
    }
    _focusPanel() {
        vscode.commands.executeCommand('mcp-feedback-enhanced.feedbackPanelBottom.focus');
    }
    _setupHotReload(view) {
        if (!process.env.MCP_FEEDBACK_DEV) {
            return;
        }
        try {
            const htmlDir = path.join(__dirname, 'webview');
            if (!fs.existsSync(htmlDir)) {
                return;
            }
            this._fileWatcher = fs.watch(htmlDir, () => {
                if (view.visible) {
                    view.webview.html = this._injectWebviewResources(view);
                }
            });
        }
        catch { /* dev-only, ignore errors */ }
    }
    _stopHotReload() {
        if (this._fileWatcher) {
            this._fileWatcher.close();
            this._fileWatcher = undefined;
        }
    }
    async _truncateLogFile(target) {
        if (target !== 'webview') {
            vscode.window.showWarningMessage(`MCP Feedback: truncate only supported for webview (got "${target}")`);
            return;
        }
        try {
            const logPath = (0, webviewLog_1.truncateWebviewLog)();
            (0, webviewLog_1.appendWebviewLog)('log truncated by user');
            vscode.window.showInformationMessage(`MCP Feedback: cleared ${path.basename(logPath)}`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`MCP Feedback: truncate failed — ${e}`);
        }
    }
    async _openLogFile(target) {
        const allowed = new Set(['extension', 'mcp-server', 'webview']);
        if (!allowed.has(target)) {
            vscode.window.showWarningMessage(`MCP Feedback: unknown log target "${target}"`);
            return;
        }
        const logPath = (0, logPaths_1.resolveFeedbackLogPath)(target);
        try {
            if (!fs.existsSync(logPath)) {
                fs.mkdirSync(path.dirname(logPath), { recursive: true });
                fs.writeFileSync(logPath, '', 'utf8');
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(logPath));
            await vscode.window.showTextDocument(doc, { preview: false });
        }
        catch (e) {
            vscode.window.showErrorMessage(`MCP Feedback: cannot open log — ${e}`);
        }
    }
    async _openMcpOutput() {
        const tried = [
            'mcp.showOutput',
            'workbench.action.output.show',
        ];
        for (const cmd of tried) {
            try {
                await vscode.commands.executeCommand(cmd);
                vscode.window.showInformationMessage('MCP Feedback: Output panel opened — select "MCP: user-mcp-feedback-enhanced" if needed');
                return;
            }
            catch {
                // try next
            }
        }
        await this._openLogFile('mcp-server');
    }
    async _exportSessions(data) {
        const defaultName = `mcp-feedback-sessions-${Date.now()}.json`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', defaultName)),
            filters: { JSON: ['json'] },
        });
        if (!uri)
            return;
        fs.writeFileSync(uri.fsPath, JSON.stringify(data, null, 2), 'utf8');
        vscode.window.showInformationMessage(`MCP Feedback: exported sessions to ${path.basename(uri.fsPath)}`);
    }
}
exports.FeedbackViewProvider = FeedbackViewProvider;
//# sourceMappingURL=feedbackViewProvider.js.map