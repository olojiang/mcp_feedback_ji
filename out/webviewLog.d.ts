/** Test hook: redirect webview logs to a temp directory. */
export declare function setWebviewLogDirForTests(dir: string | null): void;
export declare function appendWebviewLog(msg: string, projectPath?: string): void;
/** Path to today's webview log (dated file). */
export declare function webviewLogPath(): string;
/** Stable alias `webview.log` -> today's dated file. */
export declare function webviewLogAliasPath(): string;
/** Clear today's webview log for clean repro/debug sessions. */
export declare function truncateWebviewLog(): string;
