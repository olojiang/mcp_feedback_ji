/**
 * Extension entry point.
 *
 * Responsibilities:
 * - Start WebSocket server
 * - Register bottom panel and editor webview providers
 * - Deploy Cursor hooks
 * - Auto-configure MCP server in Cursor's mcp.json
 * - Register commands
 */
import * as vscode from 'vscode';
export declare function activate(context: vscode.ExtensionContext): Promise<void>;
export declare function deactivate(): void;
