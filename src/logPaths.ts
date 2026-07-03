import * as os from 'node:os';
import * as path from 'node:path';
import { webviewLogPath } from './webviewLog';

export type FeedbackLogTarget = 'extension' | 'mcp-server' | 'webview';

const LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');

export function feedbackLogDir(): string {
    return LOG_DIR;
}

export function resolveFeedbackLogPath(target: FeedbackLogTarget): string {
    switch (target) {
        case 'extension':
            return path.join(LOG_DIR, 'extension.log');
        case 'mcp-server':
            return path.join(LOG_DIR, 'mcp-server.log');
        case 'webview':
            return webviewLogPath();
        default:
            return LOG_DIR;
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
