export type LogComponent = 'hub' | 'mcp' | 'extension' | 'webview';
export interface StructuredLogFields {
    trace_id?: string;
    session_id?: string;
    [key: string]: string | number | boolean | undefined;
}
export interface FileLogSink {
    append(filePath: string, line: string): void;
}
export declare class BatchedFileLogger {
    private readonly filePath;
    private readonly sink;
    private readonly flushMs;
    private readonly queue;
    private timer;
    constructor(filePath: string, sink?: FileLogSink, flushMs?: number);
    append(line: string): void;
    flush(): void;
}
export declare function formatStructuredLine(component: LogComponent, event: string, fields?: StructuredLogFields): string;
export declare function createBatchedLogger(filePath: string, sink?: FileLogSink): BatchedFileLogger;
