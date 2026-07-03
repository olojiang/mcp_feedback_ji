import * as os from 'os';
import * as path from 'path';

export function getConfigDir(): string {
    const override = process.env.MCP_FEEDBACK_CONFIG_DIR?.trim();
    if (override) return path.resolve(override);
    return path.join(os.homedir(), '.config', 'mcp-feedback-enhanced');
}

export function getServersDir(): string {
    return path.join(getConfigDir(), 'servers');
}

export function getAgentContextPath(): string {
    return path.join(getConfigDir(), 'agent-context.json');
}

export function getLogsDir(): string {
    return path.join(getConfigDir(), 'logs');
}
