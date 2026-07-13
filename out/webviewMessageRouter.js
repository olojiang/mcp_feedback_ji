"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebviewMessageRouter = createWebviewMessageRouter;
exports.buildDefaultWebviewHandlers = buildDefaultWebviewHandlers;
function createWebviewMessageRouter(handlers) {
    return (message, view, ctx) => {
        const type = String(message.type || '');
        const handler = handlers[type];
        if (handler) {
            const result = handler(message, view, ctx);
            if (result && typeof result.catch === 'function') {
                result.catch(() => { });
            }
        }
    };
}
function buildDefaultWebviewHandlers(vscodeApi) {
    return {
        'get-server-info': (_msg, view, ctx) => ctx.pushServerInfo(view),
        'webview-ready': (msg, view, ctx) => {
            ctx.appendWebviewLog?.(`webview-ready phase=${String(msg.phase || 'default')}`);
            ctx.stopBridgeBroadcast?.();
            if (!ctx.hasBridge())
                ctx.connectBridge(view);
            else
                view.webview.postMessage(ctx.bridgePayload());
        },
        'hub-connect': (_msg, view, ctx) => ctx.connectBridge(view),
        'bridge-ack': (_msg, _view, ctx) => ctx.stopBridgeBroadcast?.(),
        'request-debug': (_msg, view, ctx) => ctx.handleDebug(view),
        'prune-test-registry': (_msg, view, ctx) => ctx.handlePrune(view),
        'open-webview-devtools': () => {
            void vscodeApi.commands.executeCommand('workbench.action.webview.openDeveloperTools');
        },
        'copy-debug-json': (msg) => {
            if (typeof msg.json === 'string') {
                void vscodeApi.env.clipboard.writeText(msg.json).then(() => vscodeApi.window.showInformationMessage('MCP Feedback: debug JSON copied'), () => vscodeApi.window.showWarningMessage('MCP Feedback: copy failed'));
            }
        },
        'hub-message': (msg, _view, ctx) => {
            if (msg.data)
                ctx.deliverHubMessage(msg.data);
        },
        'feedback-submitted': () => {
            vscodeApi.window.setStatusBarMessage('Feedback submitted!', 1500);
        },
        'error': (msg) => {
            vscodeApi.window.showErrorMessage(`MCP Feedback: ${msg.message}`);
        },
        'info': (msg) => {
            vscodeApi.window.showInformationMessage(`MCP Feedback: ${msg.message}`);
        },
        'new-session': (_msg, _view, ctx) => ctx.focusPanel(),
        'force-reset': (_msg, _view, ctx) => {
            if (!ctx.forceReset)
                return;
            void ctx.forceReset().then((port) => vscodeApi.window.showInformationMessage(`MCP Feedback: Reset! Port ${port}`), (e) => vscodeApi.window.showErrorMessage(`MCP Feedback: Reset failed - ${e}`));
        },
        'open-in-editor': () => {
            void vscodeApi.commands.executeCommand('mcp-feedback-enhanced.openInEditor');
        },
        'reload-webview': (_msg, _view, ctx) => ctx.recreate(),
        'at-search': (msg, view, ctx) => {
            ctx.handleAtSearch(String(msg.query || ''), view);
        },
        'browse-paths': async (msg, view) => {
            const canSelectFiles = msg.canSelectFiles !== false;
            const canSelectFolders = msg.canSelectFolders === true;
            try {
                const uris = await vscodeApi.window.showOpenDialog({
                    canSelectFiles,
                    canSelectFolders,
                    canSelectMany: true,
                    openLabel: 'Insert path',
                });
                const paths = [];
                if (uris && uris.length) {
                    const workspaceRoot = vscodeApi.workspace.workspaceFolders?.[0]?.uri;
                    for (const uri of uris) {
                        const rel = workspaceRoot
                            ? vscodeApi.workspace.asRelativePath(uri, false)
                            : uri.fsPath;
                        paths.push(rel);
                    }
                }
                view.webview.postMessage({ type: 'browse-paths-result', paths });
            }
            catch {
                view.webview.postMessage({ type: 'browse-paths-result', paths: [] });
            }
        },
        'open-log': (msg, _view, ctx) => {
            void ctx.openLog(String(msg.target || ''));
        },
        'truncate-log': (msg, _view, ctx) => {
            if (!ctx.truncateLog)
                return;
            void ctx.truncateLog(String(msg.target || ''));
        },
        'export-sessions': (msg, _view, ctx) => {
            if (msg.data && typeof msg.data === 'object') {
                void ctx.exportSessions(msg.data);
            }
        },
    };
}
//# sourceMappingURL=webviewMessageRouter.js.map