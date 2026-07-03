import type * as vscode from 'vscode';
export type WebviewMessageHandler = (message: Record<string, unknown>, view: vscode.WebviewView, ctx: WebviewRouterContext) => void | Promise<void>;
export interface WebviewRouterContext {
    pushServerInfo: (view: vscode.WebviewView) => void;
    connectBridge: (view: vscode.WebviewView) => void;
    bridgePayload: () => Record<string, unknown>;
    hasBridge: () => boolean;
    deliverHubMessage: (data: unknown) => void;
    handleDebug: (view: vscode.WebviewView) => void;
    handlePrune: (view: vscode.WebviewView) => void;
    handleAtSearch: (query: string, view: vscode.WebviewView) => void;
    openLog: (target: string) => void | Promise<void>;
    openMcpOutput?: () => void | Promise<void>;
    appendWebviewLog?: (msg: string) => void;
    exportSessions: (data: Record<string, unknown>) => void | Promise<void>;
    forceReset?: () => Promise<number>;
    recreate: () => void;
    focusPanel: () => void;
}
export declare function createWebviewMessageRouter(handlers: Record<string, WebviewMessageHandler>): (message: Record<string, unknown>, view: vscode.WebviewView, ctx: WebviewRouterContext) => void;
export declare function buildDefaultWebviewHandlers(vscodeApi: typeof vscode): Record<string, WebviewMessageHandler>;
