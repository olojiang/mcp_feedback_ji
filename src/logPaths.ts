import * as path from 'node:path';
import { getLogsDir } from './configPaths';
import { webviewLogPath } from './webviewLog';

export type FeedbackLogTarget = 'extension' | 'mcp-server' | 'webview';

export function feedbackLogDir(): string {
    return getLogsDir();
}

export function resolveFeedbackLogPath(target: FeedbackLogTarget): string {
    const logDir = getLogsDir();
    switch (target) {
        case 'extension':
            return path.join(logDir, 'extension.log');
        case 'mcp-server':
            return path.join(logDir, 'mcp-server.log');
        case 'webview':
            return webviewLogPath();
        default:
            return logDir;
    }
}

/** Human-readable agent link status for the panel status bar. */
export function formatAgentLinkStatus(
    mcpServers: number,
    pendingCount: number,
    mcpDetached: number,
): string {
    if (mcpDetached > 0) {
        return 'Agent: waiting (link lost)';
    }
    if (mcpServers > 0) {
        return mcpServers === 1 ? 'Agent: live' : `Agent: live×${mcpServers}`;
    }
    if (pendingCount > 0) {
        return 'Agent: offline';
    }
    return 'Agent: idle';
}
