import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { findExtensionServer, type ServerData } from './serverDiscovery.js';
import { connectToExtension, requestFeedback } from './extensionClient.js';
import { browserFallback } from './browserFallback.js';
import { runPostFeedbackHooks } from './postFeedbackHooks.js';
import { isFinishedMessage, sessionTailForFeedback } from './feedbackSession.js';

export { isFinishedMessage, sessionTailForFeedback } from './feedbackSession.js';

export const FEEDBACK_REMINDER = '\n\n[Reminder] Read through all your active rules now. For each rule, check: am I following it? If you have forgotten any, read ~/.cursor/rules/ before continuing.';

export const PONG_TEXT = 'pong';

const INSTRUCTIONS_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'instructions');

let _instructionsCache: string = '';
let _instructionsCacheExpiry = 0;

function loadRegisteredInstructions(): string {
    if (Date.now() < _instructionsCacheExpiry) return _instructionsCache;
    try {
        if (!fs.existsSync(INSTRUCTIONS_DIR)) {
            _instructionsCache = '';
            _instructionsCacheExpiry = Date.now() + 30_000;
            return '';
        }
        const files = fs.readdirSync(INSTRUCTIONS_DIR)
            .filter(f => f.endsWith('.md') || f.endsWith('.txt'));
        _instructionsCache = files
            .map(f => {
                try {
                    return fs.readFileSync(path.join(INSTRUCTIONS_DIR, f), 'utf8').trim();
                } catch { return ''; }
            })
            .filter(Boolean)
            .map(inst => `\n<!-- ${inst} -->`)
            .join('');
        _instructionsCacheExpiry = Date.now() + 60_000;
    } catch {
        _instructionsCache = '';
        _instructionsCacheExpiry = Date.now() + 30_000;
    }
    return _instructionsCache;
}

function feedbackSuffix(userFeedback = '') {
    return FEEDBACK_REMINDER + loadRegisteredInstructions() + sessionTailForFeedback(userFeedback);
}

type ToolContent = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

interface ToolHandlerDeps {
    findExtensionServer: (projectDirectory?: string, log?: (msg: string) => void) => Promise<ServerData | null>;
    connectToExtension: typeof connectToExtension;
    requestFeedback: typeof requestFeedback;
    browserFallback: typeof browserFallback;
    log: (msg: string) => void;
}

export function buildToolDefinitions() {
    return [
        {
            name: 'interactive_feedback',
            description: 'Request interactive feedback from the user. Call this tool to check in with the user, present your progress, and get their input before continuing.',
            inputSchema: {
                type: 'object' as const,
                required: ['summary'],
                properties: {
                    summary: {
                        type: 'string',
                        description: 'Summary of what you have done so far.',
                    },
                    project_directory: {
                        type: 'string',
                        description: 'Optional. The project directory path.',
                    },
                },
            },
        },
        {
            name: 'get_system_info',
            description: 'Get system information including OS, architecture, and Node.js version.',
            inputSchema: {
                type: 'object' as const,
                properties: {},
            },
        },
        {
            name: 'ping',
            description: 'Health check for MCP server process. Always returns the fixed text "pong".',
            inputSchema: {
                type: 'object' as const,
                properties: {},
            },
        },
    ];
}

export function createToolCallHandler(deps: ToolHandlerDeps) {
    return async function handleToolCall(
        name: string,
        args: unknown
    ): Promise<{ content: ToolContent; isError?: boolean }> {
        if (name === 'get_system_info') {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        platform: process.platform,
                        arch: process.arch,
                        nodeVersion: process.version,
                        homeDir: os.homedir(),
                        cursorTraceId: process.env.CURSOR_TRACE_ID || '',
                    }, null, 2),
                }],
            };
        }

        if (name === 'ping') {
            deps.log('[MCP Feedback] ping -> pong');
            return {
                content: [{ type: 'text', text: PONG_TEXT }],
            };
        }

        if (name !== 'interactive_feedback') {
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        const parsed = z.object({
            summary: z.string(),
            project_directory: z.string().optional(),
        }).parse(args);

        const summary = parsed.summary.replace(/\s*\[preflight:done\]\s*/g, '').trim();
        const { project_directory } = parsed;

        try {
            const log = (msg: string) => deps.log(msg);
            let extensionServer = await deps.findExtensionServer(project_directory, log);
            const maxAttempts = 3;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!extensionServer) break;

                try {
                    const ws = await deps.connectToExtension(extensionServer.port);
                    try {
                        const result = await deps.requestFeedback(ws, summary, project_directory);
                        deps.log(
                            `[MCP Feedback] Feedback via extension port=${extensionServer.port} `
                            + `pid=${extensionServer.pid}`
                        );
                        const content: ToolContent = [
                            { type: 'text', text: result.feedback + feedbackSuffix(result.feedback) },
                        ];
                        if (result.images) {
                            for (const img of result.images) {
                                content.push({
                                    type: 'image',
                                    data: img,
                                    mimeType: 'image/png',
                                });
                            }
                        }
                        runPostFeedbackHooks({ summary, feedback: result.feedback });
                        return { content };
                    } finally {
                        ws.close();
                    }
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    deps.log(
                        `[MCP Feedback] Extension port=${extensionServer.port} `
                        + `pid=${extensionServer.pid} attempt ${attempt}/${maxAttempts} failed: ${errMsg}`
                    );
                    extensionServer = await deps.findExtensionServer(project_directory, log);
                }
            }

            if (process.env.MCP_FEEDBACK_BROWSER_FALLBACK !== '1') {
                deps.log('[MCP Feedback] Extension unavailable, browser fallback disabled');
                return {
                    content: [{
                        type: 'text',
                        text: 'Error: MCP Feedback extension not connected. Open bottom panel, click ↻ to reconnect, or Reload Window.',
                    }],
                    isError: true,
                };
            }

            deps.log('[MCP Feedback] No extension found, using browser fallback');
            const feedback = await deps.browserFallback(summary);
            runPostFeedbackHooks({ summary, feedback });
            return {
                content: [{ type: 'text', text: feedback + feedbackSuffix(feedback) }],
            };
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            deps.log(`[MCP Feedback] Error: ${errMsg}`);

            try {
                if (process.env.MCP_FEEDBACK_BROWSER_FALLBACK !== '1') {
                    return {
                        content: [{ type: 'text', text: `Error: ${errMsg}. Please try again.` }],
                        isError: true,
                    };
                }
                const feedback = await deps.browserFallback(summary);
                runPostFeedbackHooks({ summary, feedback });
                return {
                    content: [{ type: 'text', text: feedback + feedbackSuffix(feedback) }],
                };
            } catch (fallbackErr) {
                const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
                deps.log(`[MCP Feedback] Browser fallback also failed: ${fallbackMsg}`);
                return {
                    content: [{ type: 'text', text: `Error: ${errMsg}. Please try again.` }],
                    isError: true,
                };
            }
        }
    };
}

export const handleToolCall = createToolCallHandler({
    findExtensionServer,
    connectToExtension,
    requestFeedback,
    browserFallback,
    log: (msg) => console.error(msg),
});
