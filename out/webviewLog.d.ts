/** Test hook: redirect webview logs to a temp directory. */
export declare function setWebviewLogDirForTests(dir: string | null): void;
export declare function appendWebviewLog(msg: string, projectPath?: string): void;
export declare function webviewLogPath(): string;
