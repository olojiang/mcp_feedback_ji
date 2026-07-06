import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { findExtensionServer, readAgentContext, type ServerData } from './serverDiscovery.js';
import { connectToExtension, requestFeedback, type RequestFeedbackDeps } from './extensionClient.js';
import { browserFallback } from './browserFallback.js';
import { runPostFeedbackHooks } from './postFeedbackHooks.js';
import { isFinishedMessage, sessionTailForFeedback } from './feedbackSession.js';
import { feedbackNoOpToolText, requestWasteGuardLogLine, type FeedbackNoOpReason } from './feedbackNoOp.js';
import { requestBillingRiskLogLine } from './requestBillingRisk.js';
import { mcpLog } from './logger.js';

export { isFinishedMessage, sessionTailForFeedback } from './feedbackSession.js';

export const FEEDBACK_REMINDER = '';

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

function noOpFeedbackResponse(
    deps: ToolHandlerDeps,
    reason: FeedbackNoOpReason,
    traceId?: string,
    elapsedMs = 0,
): { content: ToolContent } {
    deps.log(requestWasteGuardLogLine(reason, traceId));
    deps.log(requestBillingRiskLogLine({
        reason: reason === 'keepalive' ? 'our_keepalive' : reason,
        elapsedMs,
        traceId,
        detail: 'tool_completed_no_user_input',
    }));
    return {
        content: [{
            type: 'text',
            text: feedbackNoOpToolText(reason) + feedbackSuffix(),
        }],
    };
}

type ToolContent = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

function resolveTraceId(
    requestTraceId?: string,
    agentContextTraceId?: string,
    envTraceId?: string,
): string | undefined {
    const pick = requestTraceId || agentContextTraceId || envTraceId;
    return pick && String(pick).trim() ? String(pick).trim() : undefined;
}

interface ToolCallContext {
    progressToken?: string | number;
    sendNotification?: RequestFeedbackDeps['sendNotification'];
}

interface ToolHandlerDeps {
    findExtensionServer: (projectDirectory?: string, log?: (msg: string) => void) => Promise<ServerData | null>;
    connectToExtension: typeof connectToExtension;
    requestFeedback: typeof requestFeedback;
    browserFallback: typeof browserFallback;
    log: (msg: string) => void;
    readAgentContext?: () => { traceId?: string } | null;
    rediscoveryAttempts?: number;
    retryDelayMs?: number;
    /** MCP stdio keepalive while waiting for user feedback (prevents ~30s Cursor idle drop). */
    stdioKeepaliveTick?: (traceId?: string, projectDirectory?: string) => void | Promise<void>;
}

const DEFAULT_EXTENSION_ATTEMPTS = 2;
const DEFAULT_REDISCOVERY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function rediscoverExtensionServer(
    deps: ToolHandlerDeps,
    projectDirectory: string | undefined,
    log: (msg: string) => void,
    opts?: { extended?: boolean },
): Promise<ServerData | null> {
    const attempts = opts?.extended
        ? 6
        : (deps.rediscoveryAttempts ?? DEFAULT_REDISCOVERY_ATTEMPTS);
    const retryDelayMs = opts?.extended
        ? 1000
        : (deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

    for (let i = 1; i <= attempts; i++) {
        const server = await deps.findExtensionServer(projectDirectory, log);
        if (server) return server;
        if (i < attempts) {
            deps.log(`[MCP Feedback] rediscover ${i}/${attempts} found no extension; retrying`);
            await sleep(retryDelayMs);
        }
    }
    return null;
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
        args: unknown,
        ctx?: ToolCallContext,
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
        const agentCtx = deps.readAgentContext?.() ?? null;
        const traceId = resolveTraceId(undefined, agentCtx?.traceId, process.env.CURSOR_TRACE_ID);

        try {
            const log = (msg: string) => deps.log(msg);
            log(
                `[MCP Feedback] feedback_request start trace=${traceId ?? '(none)'} `
                + `project=${project_directory ?? '(none)'} `
                + `workspaces=${(agentCtx?.workspaceRoots ?? []).join('|') || '(none)'}`,
            );
            let extensionServer = await rediscoverExtensionServer(deps, project_directory, log);
            const maxAttempts = DEFAULT_EXTENSION_ATTEMPTS;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!extensionServer) break;

                let ws;
                try {
                    ws = await deps.connectToExtension(extensionServer.port);
                    const waitStartedAt = Date.now();
                    const result = await deps.requestFeedback(ws, summary, project_directory, traceId, {
                        onWaitTick: deps.stdioKeepaliveTick
                            ? () => deps.stdioKeepaliveTick!(traceId, project_directory)
                            : undefined,
                        progressToken: ctx?.progressToken,
                        sendNotification: ctx?.sendNotification,
                    });
                    deps.log(
                        `[MCP Feedback] Feedback via extension port=${extensionServer.port} `
                        + `pid=${extensionServer.pid} status=${result.status ?? 'submitted'}`
                        + ` session=${result.session_id ?? '-'}`,
                    );
                    if (result.status === 'keepalive' || result.status === 'released_duplicate') {
                        deps.log(
                            `[MCP Feedback] ${result.status} auto-resolve `
                            + `trace=${traceId ?? '(none)'} project=${project_directory ?? '(none)'}`,
                        );
                        return noOpFeedbackResponse(
                            deps,
                            result.status,
                            traceId,
                            Date.now() - waitStartedAt,
                        );
                    }
                    if (result.status && result.status !== 'submitted' && result.status !== 'ok' && !result.feedback) {
                        return {
                            content: [{
                                type: 'text',
                                text: `[${result.status}] Feedback request did not complete. Please retry or continue working.` + feedbackSuffix(),
                            }],
                        };
                    }
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
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    deps.log(
                        `[MCP Feedback] Extension port=${extensionServer.port} `
                        + `pid=${extensionServer.pid} attempt ${attempt}/${maxAttempts} failed: ${errMsg}`
                    );
                    if (errMsg.includes('Connection closed') || errMsg.includes('extension_ws_close')) {
                        deps.log('[MCP Feedback] MCP connection closed during wait — not retrying');
                        return {
                            content: [{
                                type: 'text',
                                text: '[connection_closed] MCP disconnected while waiting for feedback. '
                                    + 'End your turn. Reload Window, toggle MCP, then reply in the panel.'
                                    + feedbackSuffix(),
                            }],
                        };
                    }
                    if (errMsg.includes('cursor_hard_timeout_suspected')) {
                        deps.log('[MCP Feedback] cursor_hard_timeout_suspected — not retrying');
                        return {
                            content: [{
                                type: 'text',
                                text: '[cursor_hard_timeout] Interactive feedback wait ended near Cursor tool limit. '
                                    + 'End your turn. Reply in the panel when ready.'
                                    + feedbackSuffix(),
                            }],
                        };
                    }
                    if (errMsg.includes('superseded')) {
                        deps.log('[MCP Feedback] Superseded by another MCP call — not retrying');
                        return noOpFeedbackResponse(deps, 'superseded', traceId);
                    }
                    const extendedRediscover = errMsg.includes('extension_ws_close')
                        || errMsg.includes('Connection timeout');
                    extensionServer = await rediscoverExtensionServer(
                        deps,
                        project_directory,
                        log,
                        { extended: extendedRediscover },
                    );
                } finally {
                    if (ws) {
                        try { ws.close(); } catch { /* ignore */ }
                    }
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
    readAgentContext,
    log: mcpLog,
});
