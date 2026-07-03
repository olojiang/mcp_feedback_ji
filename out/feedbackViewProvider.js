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
const deployStamp_1 = require("./deployStamp");
const deployStampReader_1 = require("./deployStampReader");
const logTail_1 = require("./logTail");
const quickReplySettings_1 = require("./quickReplySettings");
const webviewSyncPolicy_1 = require("./webviewSyncPolicy");
class FeedbackViewProvider {
    constructor(getHtml, getPort, getVersion, getHub, extensionUri, getMemoryVersion) {
        this._view = null;
        this._bridge = null;
        this._lastSyncedPort = 0;
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
        this._getMemoryVersion = getMemoryVersion ?? getVersion;
        this._getHub = getHub;
        this._extensionUri = extensionUri;
    }
    updateHtmlGetter(getHtml) {
        this._getHtml = getHtml;
    }
    onForceReset(callback) {
        this._forceResetCallback = callback;
    }
    resolveWebviewView(webviewView, _context, _token) {
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
    recreate() {
        if (this._view) {
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
            this._lastSyncedPort = port;
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
        const panelStateUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelState.js')
            .with({ query: `v=${cacheKey}` }));
        const erudaPanelUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'erudaPanel.js')
            .with({ query: `v=${cacheKey}` }));
        const panelConnectionUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'panelConnection.js')
            .with({ query: `v=${cacheKey}` }));
        const themeContrastUri = view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'themeContrast.js')
            .with({ query: `v=${cacheKey}` }));
        const cspSource = view.webview.cspSource;
        html = html.replace(/\{\{ERUDA_URI\}\}/g, erudaUri.toString());
        html = html.replace(/\{\{ERUDA_PANEL_URI\}\}/g, erudaPanelUri.toString());
        html = html.replace(/\{\{PANELSTATE_URI\}\}/g, panelStateUri.toString());
        html = html.replace(/\{\{PANELCONNECTION_URI\}\}/g, panelConnectionUri.toString());
        html = html.replace(/\{\{THEMECONTRAST_URI\}\}/g, themeContrastUri.toString());
        html = html.replace(/\{\{CSP_SOURCE\}\}/g, cspSource);
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
    _bridgePayload() {
        const deployStamp = (0, deployStampReader_1.readDeployStamp)();
        const version = this._getVersion();
        const memoryVersion = this._getMemoryVersion();
        return {
            type: 'bridge-connected',
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
    /** Attach bridge only after webview requests hub-connect (avoids lost bridge-connected). */
    _connectBridge(view) {
        if (this._bridge) {
            view.webview.postMessage(this._bridgePayload());
            return;
        }
        this._attachBridge(view);
        view.webview.postMessage(this._bridgePayload());
    }
    _pushServerInfo(view) {
        const deployStamp = (0, deployStampReader_1.readDeployStamp)();
        const version = this._getVersion();
        const memoryVersion = this._getMemoryVersion();
        view.webview.postMessage({
            type: 'server-info',
            port: this._getPort(),
            version,
            memoryVersion,
            pid: process.pid,
            versionWarnings: this._versionWarnings(),
            deployStamp,
            deployLabel: (0, deployStamp_1.formatDeployStampLabel)(deployStamp, version),
            deployReloadBanner: (0, deployStamp_1.deployReloadBannerText)(memoryVersion, version, deployStamp),
            quickReplies: this._quickRepliesFromSettings(),
        });
    }
    _handleDebugRequest(view) {
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
        const report = {
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
            logTail: {
                mcpServer: (0, logTail_1.readLogTailLines)(mcpLogPath, 50),
            },
        };
        report.diagnoseBundle = (0, registrySnapshot_1.buildDiagnoseBundle)(report);
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
        view.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case 'get-server-info':
                    this._pushServerInfo(view);
                    break;
                case 'webview-ready':
                    if (!this._bridge) {
                        this._connectBridge(view);
                    }
                    else {
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
                        void vscode.env.clipboard.writeText(message.json).then(() => vscode.window.showInformationMessage('MCP Feedback: debug JSON copied'), () => vscode.window.showWarningMessage('MCP Feedback: copy failed'));
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
                    this._handleAtSearch(message.query, view);
                    break;
                case 'open-log':
                    void this._openLogFile(message.target);
                    break;
                case 'open-mcp-output':
                    void this._openMcpOutput();
                    break;
                case 'export-sessions':
                    void this._exportSessions(message.data);
                    break;
                case 'log':
                    if (typeof message.msg === 'string') {
                        const workspaces = this._getHub()?.getDebugInfo()?.workspaces;
                        const projectPath = Array.isArray(workspaces) ? workspaces[0] : undefined;
                        (0, webviewLog_1.appendWebviewLog)(message.msg, typeof projectPath === 'string' ? projectPath : undefined);
                    }
                    break;
            }
        });
    }
    async _handleAtSearch(query, view) {
        if (!query) {
            view.webview.postMessage({ type: 'at-results', items: [] });
            return;
        }
        const items = [];
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
        }
        catch { }
        try {
            const symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query);
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
        }
        catch { }
        const seen = new Set();
        const unique = items.filter(it => {
            if (seen.has(it.insertText))
                return false;
            seen.add(it.insertText);
            return true;
        }).slice(0, 20);
        view.webview.postMessage({ type: 'at-results', items: unique });
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