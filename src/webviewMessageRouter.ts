import type * as vscode from 'vscode';

export type WebviewMessageHandler = (
    message: Record<string, unknown>,
    view: vscode.WebviewView,
    ctx: WebviewRouterContext,
) => void | Promise<void>;

export interface WebviewRouterContext {
    pushServerInfo: (view: vscode.WebviewView) => void;
    connectBridge: (view: vscode.WebviewView) => void;
    stopBridgeBroadcast?: () => void;
    bridgePayload: () => Record<string, unknown>;
    hasBridge: () => boolean;
    deliverHubMessage: (data: unknown) => void;
    handleDebug: (view: vscode.WebviewView, traceId?: string) => void;
    handlePrune: (view: vscode.WebviewView) => void;
    handleAtSearch: (query: string, view: vscode.WebviewView) => void;
    openLog: (target: string) => void | Promise<void>;
    openMcpOutput?: () => void | Promise<void>;
    appendWebviewLog?: (msg: string) => void;
    truncateLog?: (target: string) => void | Promise<void>;
    exportSessions: (data: Record<string, unknown>) => void | Promise<void>;
    forceReset?: () => Promise<number>;
    recreate: () => void;
    focusPanel: () => void;
}

export function createWebviewMessageRouter(
    handlers: Record<string, WebviewMessageHandler>,
): (message: Record<string, unknown>, view: vscode.WebviewView, ctx: WebviewRouterContext) => void {
    return (message, view, ctx) => {
        const type = String(message.type || '');
        const handler = handlers[type];
        if (handler) {
            void handler(message, view, ctx);
        }
    };
}

export function buildDefaultWebviewHandlers(
    vscodeApi: typeof vscode,
): Record<string, WebviewMessageHandler> {
    return {
        'get-server-info': (_msg, view, ctx) => ctx.pushServerInfo(view),
        'webview-ready': (msg, view, ctx) => {
            ctx.appendWebviewLog?.(`webview-ready phase=${String(msg.phase || 'default')}`);
            ctx.stopBridgeBroadcast?.();
            if (!ctx.hasBridge()) ctx.connectBridge(view);
            else view.webview.postMessage(ctx.bridgePayload());
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
                void vscodeApi.env.clipboard.writeText(msg.json).then(
                    () => vscodeApi.window.showInformationMessage('MCP Feedback: debug JSON copied'),
                    () => vscodeApi.window.showWarningMessage('MCP Feedback: copy failed'),
                );
            }
        },
        'hub-message': (msg, _view, ctx) => {
            if (msg.data) ctx.deliverHubMessage(msg.data);
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
            if (!ctx.forceReset) return;
            void ctx.forceReset().then(
                (port) => vscodeApi.window.showInformationMessage(`MCP Feedback: Reset! Port ${port}`),
                (e) => vscodeApi.window.showErrorMessage(`MCP Feedback: Reset failed - ${e}`),
            );
        },
        'open-in-editor': () => {
            void vscodeApi.commands.executeCommand('mcp-feedback-enhanced.openInEditor');
        },
        'reload-webview': (_msg, _view, ctx) => ctx.recreate(),
        'at-search': (msg, view, ctx) => {
            ctx.handleAtSearch(String(msg.query || ''), view);
        },
        'open-log': (msg, _view, ctx) => {
            void ctx.openLog(String(msg.target || ''));
        },
        'truncate-log': (msg, _view, ctx) => {
            if (!ctx.truncateLog) return;
            void ctx.truncateLog(String(msg.target || ''));
        },
        'export-sessions': (msg, _view, ctx) => {
            if (msg.data && typeof msg.data === 'object') {
                void ctx.exportSessions(msg.data as Record<string, unknown>);
            }
        },
    };
}
