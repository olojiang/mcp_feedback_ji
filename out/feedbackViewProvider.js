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
class FeedbackViewProvider {
    constructor(getHtml, getPort, getVersion, getHub) {
        this._view = null;
        this._bridge = null;
        this._getHtml = getHtml;
        this._getPort = getPort;
        this._getVersion = getVersion;
        this._getHub = getHub;
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
        };
        this._setupMessageHandler(webviewView);
        webviewView.webview.html = this._getHtml();
        this._setupHotReload(webviewView);
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._connectBridge(webviewView);
            }
        });
        this._connectBridge(webviewView);
        webviewView.onDidDispose(() => {
            this._view = null;
            this._bridge?.dispose();
            this._bridge = null;
            this._stopHotReload();
        });
    }
    recreate() {
        if (this._view) {
            this._view.webview.html = this._getHtml();
        }
    }
    focusInput() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'focus-input' });
        }
    }
    reconnect() {
        if (this._view) {
            this._connectBridge(this._view);
        }
    }
    /** Refresh webview HTML and re-attach in-process bridge. */
    syncServer(_port) {
        if (!this._view)
            return;
        this._view.webview.html = this._getHtml();
        setTimeout(() => {
            if (this._view)
                this._connectBridge(this._view);
        }, 50);
    }
    _connectBridge(view) {
        const hub = this._getHub();
        if (!hub)
            return;
        this._bridge?.dispose();
        this._bridge = hub.attachWebview((msg) => {
            view.webview.postMessage({ type: 'hub-message', data: msg });
        });
        view.webview.postMessage({
            type: 'bridge-connected',
            port: this._getPort(),
            version: this._getVersion(),
            pid: process.pid,
        });
    }
    _pushServerInfo(view) {
        this._connectBridge(view);
    }
    _setupMessageHandler(view) {
        view.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case 'get-server-info':
                case 'webview-ready':
                case 'hub-connect':
                    this._connectBridge(view);
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
                case 'log':
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
                    view.webview.html = this._getHtml();
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
}
exports.FeedbackViewProvider = FeedbackViewProvider;
//# sourceMappingURL=feedbackViewProvider.js.map