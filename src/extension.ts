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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { FeedbackWSServer } from './wsServer';
import { FeedbackViewProvider } from './feedbackViewProvider';
import { readExtensionVersion, readMemoryExtensionVersion } from './extensionVersion';
import { truncateWebviewLog } from './webviewLog';
import { extensionSyncDelaysMs, EXTENSION_PANEL_FOCUS_DELAYS_MS } from './activateSyncPolicy';
import { shouldPromptReloadAfterVersionChange } from './deployStamp';
import { resolveNodeBin } from './deploy/nodeBin';
import { planMcpConfigUpdate, applyMcpConfigPlan } from './deploy/mcpConfig';
import {
    planHooksConfigUpdate,
    applyHooksConfigPlan,
    HOOK_FILES,
    RETIRED_HOOK_FILES,
} from './deploy/hooks';
import { RULES_CONTENT, planRulesDeploy } from './deploy/rules';
import { planPendingMigration } from './deploy/pendingMigration';
import { createVscodeClipboard } from './vscodeClipboard';
import { workspacesFromFolders, substituteWebviewPlaceholders } from './extensionHelpers';
import { buildPostDeployReloadSteps } from './postDeployReload';
import {
    DEFAULT_REMINDER_DELAYS_MS,
    scheduleReminderDelays,
    clearScheduledTimers,
} from './feedbackReminders';

let wsServer: FeedbackWSServer;
let bottomProvider: FeedbackViewProvider;
const disposables: vscode.Disposable[] = [];
const activationTimers: ReturnType<typeof setTimeout>[] = [];

const REMINDER_DELAYS = DEFAULT_REMINDER_DELAYS_MS;
let reminderTimers: ReturnType<typeof setTimeout>[] = [];

function playSystemSound(): void {
    if (process.platform === 'darwin') {
        exec('afplay /System/Library/Sounds/Funk.aiff');
    }
}

function startFeedbackReminders(): void {
    cancelFeedbackReminders();
    reminderTimers = scheduleReminderDelays(REMINDER_DELAYS, () => playSystemSound());
}

function cancelFeedbackReminders(): void {
    clearScheduledTimers(reminderTimers);
    reminderTimers = [];
}

function getWorkspaces(): string[] {
    return workspacesFromFolders(vscode.workspace.workspaceFolders);
}

function _loadWebviewHtml(extensionPath: string, serverPort: number, version: string): string {
    // Prefer compiled output so panel.html stays aligned with out/webview/*.js after deploy.
    const candidates = [
        path.join(extensionPath, 'out', 'webview', 'panel.html'),
        path.join(extensionPath, 'static', 'panel.html'),
    ];
    let html = '';
    for (const p of candidates) {
        if (fs.existsSync(p)) { html = fs.readFileSync(p, 'utf-8'); break; }
    }
    if (!html) {
        return '<html><body><h3>Webview not found. Check static/panel.html.</h3></body></html>';
    }
    html = substituteWebviewPlaceholders(html, {
        SERVER_URL: `ws://127.0.0.1:${serverPort}`,
        PROJECT_PATH: getWorkspaces()[0] || '',
        VERSION: version,
    });
    // Do NOT sanitize here — script {{URI}} placeholders are replaced later in _injectWebviewResources.
    return html;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Avoid console.log during activation — it opens the Output panel and steals focus

    const extensionPath = context.extensionPath;
    const getVersion = () => readExtensionVersion(extensionPath);
    const getMemoryVersion = () => readMemoryExtensionVersion(context.extension.packageJSON);
    const pkgVersion = getVersion();
    const memoryVersion = getMemoryVersion();
    wsServer = new FeedbackWSServer(pkgVersion, { clipboard: createVscodeClipboard() });
    wsServer.setWorkspaces(getWorkspaces());

    let port: number;
    try {
        port = await wsServer.start();
    } catch (e) {
        vscode.window.showErrorMessage(`MCP Feedback: Failed to start server - ${e}`);
        return;
    }

    wsServer.onFeedbackRequest(async () => {
        startFeedbackReminders();
        try {
            await vscode.commands.executeCommand('workbench.view.extension.mcp-feedback-enhanced-bottom');
            await vscode.commands.executeCommand('mcp-feedback-enhanced.feedbackPanelBottom.focus');
        } catch { /* ignore */ }
    });

    wsServer.onFeedbackResolved(() => {
        cancelFeedbackReminders();
    });

    wsServer.onFeedbackError((reason) => {
        vscode.window.showWarningMessage(`MCP Feedback error: ${reason}`);
    });

    wsServer.onSleepResumeWithPending = (minutesSleep) => {
        const isChinese = vscode.env.language.startsWith('zh');
        const msg = isChinese
            ? `系统休眠了约 ${minutesSleep} 分钟，当前仍有活跃的 Agent 会话。Agent 可能在休眠期间继续消耗 Cursor Request。`
            : `System slept for ~${minutesSleep} min with active agent sessions. Requests may have been consumed during sleep.`;
        vscode.window.showWarningMessage(msg);
    };

    const getHtml = () => _loadWebviewHtml(extensionPath, port, getVersion());
    bottomProvider = new FeedbackViewProvider(
        getHtml, () => port, getVersion, () => wsServer, context.extensionUri, getMemoryVersion,
    );

    const forceResetCallback = async (): Promise<number> => {
        await wsServer.stop();
        wsServer.setWorkspaces(getWorkspaces());
        const newPort = await wsServer.start();
        port = newPort;
        bottomProvider.updateHtmlGetter(() => _loadWebviewHtml(extensionPath, newPort, getVersion()));
        bottomProvider.syncServer(newPort);
        return newPort;
    };
    bottomProvider.onForceReset(forceResetCallback);

    disposables.push(
        vscode.window.registerWebviewViewProvider(
            'mcp-feedback-enhanced.feedbackPanelBottom',
            bottomProvider,
            // Must stay false: retained webview keeps a stale acquireVsCodeApi after Reload Window.
            { webviewOptions: { retainContextWhenHidden: false } }
        ),
    );

    disposables.push(
        vscode.commands.registerCommand('mcp-feedback-enhanced.openInEditor', () => {
            _openEditorPanel(context, port);
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.openInBottom', () => {
            vscode.commands.executeCommand('mcp-feedback-enhanced.feedbackPanelBottom.focus');
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.reconnect', () => {
            bottomProvider.reconnect();
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.forceReset', async () => {
            try {
                const newPort = await forceResetCallback();
                vscode.window.showInformationMessage(`MCP Feedback: Reset! Server on port ${newPort}`);
            } catch (e) {
                vscode.window.showErrorMessage(`MCP Feedback: Reset failed - ${e}`);
            }
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.showStatus', () => {
            const clients = wsServer.getConnectedClients();
            vscode.window.showInformationMessage(
                `MCP Feedback Status:\nPort: ${port}\nWebviews: ${clients.webviews}\nMCP Servers: ${clients.mcpServers}\nPending requests: ${wsServer.hasPendingRequests() ? 'Yes' : 'No'}`
            );
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.postDeployReload', () => {
            const steps = buildPostDeployReloadSteps(pkgVersion);
            void vscode.window.showInformationMessage(
                steps.join('\n'),
                'Reload Window',
            ).then((choice) => {
                if (choice === 'Reload Window') {
                    void vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }),
        vscode.commands.registerCommand('mcp-feedback-enhanced.truncateWebviewLog', () => {
            try {
                const logPath = truncateWebviewLog();
                vscode.window.showInformationMessage(`MCP Feedback: cleared ${path.basename(logPath)}`);
            } catch (e) {
                vscode.window.showErrorMessage(`MCP Feedback: truncate failed — ${e}`);
            }
        }),
    );

    disposables.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            wsServer.setWorkspaces(getWorkspaces());
            wsServer.refreshServerRegistration();
        }),
    );

    ensureMcpConfig(extensionPath);
    deployCursorHooks(context.extensionPath);
    deployCursorRules();
    migratePendingFiles();
    checkPowerNap();

    context.subscriptions.push(...disposables);
    // Port info available via showStatus command

    const activatePanel = async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.mcp-feedback-enhanced-bottom');
            await vscode.commands.executeCommand('mcp-feedback-enhanced.feedbackPanelBottom.focus');
        } catch { /* commands may not be ready yet */ }
    };
    const syncWebview = () => {
        bottomProvider.syncServer(port);
    };
    for (const delay of EXTENSION_PANEL_FOCUS_DELAYS_MS) {
        activationTimers.push(setTimeout(activatePanel, delay));
    }
    for (const delay of extensionSyncDelaysMs()) {
        activationTimers.push(setTimeout(syncWebview, delay));
    }

    const prevActivated = context.globalState.get<string>('mcpFeedback.lastActivatedVersion');
    if (shouldPromptReloadAfterVersionChange(prevActivated, pkgVersion) || memoryVersion !== pkgVersion) {
        void vscode.window.showInformationMessage(
            `MCP Feedback ${pkgVersion} on disk (running ${memoryVersion}) — Reload Window to load it`,
            'Reload Window',
        ).then((choice) => {
            if (choice === 'Reload Window') {
                void vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
    void context.globalState.update('mcpFeedback.lastActivatedVersion', pkgVersion);
}

export function deactivate(): void {
    cancelFeedbackReminders();
    for (const t of activationTimers) { clearTimeout(t); }
    activationTimers.length = 0;
    for (const d of disposables) { d.dispose(); }
    disposables.length = 0;
    void wsServer?.stop().catch(() => {});
}

function _openEditorPanel(context: vscode.ExtensionContext, port: number): void {
    const version = readExtensionVersion(context.extensionPath);
    const panel = vscode.window.createWebviewPanel(
        'mcp-feedback-editor',
        'MCP Feedback',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: false,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out'))],
        }
    );
    panel.webview.html = _loadWebviewHtml(context.extensionPath, port, version);
}

function ensureMcpConfig(extensionPath: string): void {
    try {
        const version = readExtensionVersion(extensionPath);
        const mcpConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
        let config: Record<string, unknown> = {};

        if (fs.existsSync(mcpConfigPath)) {
            config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        }

        const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;
        const plan = planMcpConfigUpdate(
            extensionPath,
            version,
            resolveNodeBin(),
            mcpServers['mcp-feedback-enhanced'] as Record<string, unknown> | undefined,
        );
        if (!plan.changed) return;

        config = applyMcpConfigPlan(config, plan);
        fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
        fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('[MCP Feedback] Failed to update MCP config:', e);
    }
}

function deployCursorHooks(extensionPath: string): void {
    try {
        const hooksSourceDir = path.join(extensionPath, 'scripts', 'hooks');
        const targetDir = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'hooks');
        fs.mkdirSync(targetDir, { recursive: true });

        for (const file of HOOK_FILES) {
            const src = path.join(hooksSourceDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(targetDir, file));
            }
        }

        for (const old of RETIRED_HOOK_FILES) {
            try { fs.unlinkSync(path.join(targetDir, old)); } catch { /* already gone */ }
        }

        const preToolUseHook = path.join(targetDir, 'consume-pending.js');
        const hooksConfigPath = path.join(os.homedir(), '.cursor', 'hooks.json');
        let hooksConfig: Record<string, unknown> = {};

        if (fs.existsSync(hooksConfigPath)) {
            hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf-8'));
        }

        const plan = planHooksConfigUpdate(resolveNodeBin(), preToolUseHook, hooksConfig);
        if (!plan.changed) return;

        hooksConfig = applyHooksConfigPlan(hooksConfig, plan);
        fs.mkdirSync(path.dirname(hooksConfigPath), { recursive: true });
        fs.writeFileSync(hooksConfigPath, JSON.stringify(plan.hooksConfig, null, 2));
    } catch (e) {
        console.error('[MCP Feedback] Failed to deploy hooks:', e);
    }
}

function deployCursorRules(): void {
    try {
        const rulesDir = path.join(os.homedir(), '.cursor', 'rules');
        const ruleFile = path.join(rulesDir, 'mcp-feedback-enhanced.mdc');

        fs.mkdirSync(rulesDir, { recursive: true });

        const existing = fs.existsSync(ruleFile)
            ? fs.readFileSync(ruleFile, 'utf-8')
            : null;
        const plan = planRulesDeploy(existing, getWorkspaces());

        if (plan.writeGlobal) {
            fs.writeFileSync(ruleFile, RULES_CONTENT);
        }

        for (const wsRuleFile of plan.removeWorkspaceRules) {
            try { fs.unlinkSync(wsRuleFile); } catch { /* already gone */ }
        }
    } catch (e) {
        console.error('[MCP Feedback] Failed to deploy rules:', e);
    }
}

function migratePendingFiles(): void {
    try {
        const pendingDir = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'pending');
        if (!fs.existsSync(pendingDir)) return;
        const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
        const plan = planPendingMigration(files);
        for (const f of plan.unlinkFiles) {
            try { fs.unlinkSync(path.join(pendingDir, f)); } catch { /* ignore */ }
        }
        if (plan.removeDir) {
            try { fs.rmdirSync(pendingDir); } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

function checkPowerNap(): void {
    if (process.platform !== 'darwin') return;

    exec('pmset -g custom', { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) return;
        if (/powernap\s+1/i.test(stdout)) {
            const isChinese = vscode.env.language.startsWith('zh');
            const message = isChinese
                ? 'Power Nap 已启用。如果 Cursor 中有未完成的 Agent 会话，'
                + '合盖后 macOS 仍会周期性唤醒，Agent 会继续执行并消耗 API 请求。'
                + '建议禁用 Power Nap，避免休眠期间的无效消耗。'
                : 'Power Nap is enabled. If you have an active Cursor agent session, '
                + 'macOS will periodically wake during sleep and the agent will keep running, '
                + 'silently consuming API requests while your Mac is closed. '
                + 'Disable Power Nap to prevent unattended request usage.';
            const disable = isChinese ? '禁用 Power Nap' : 'Disable Power Nap';
            const learnMore = isChinese ? '了解更多' : 'Learn More';

            vscode.window.showWarningMessage(message, disable, learnMore).then(choice => {
                if (choice === disable) {
                    const terminal = vscode.window.createTerminal('Disable Power Nap');
                    terminal.sendText('sudo pmset -a powernap 0');
                    terminal.show();
                } else if (choice === learnMore) {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://support.apple.com/en-us/102292'
                    ));
                }
            });
        }
    });
}
