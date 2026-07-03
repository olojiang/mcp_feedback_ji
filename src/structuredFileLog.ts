import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatLogEvent } from './structuredLog.js';

export type LogComponent = 'hub' | 'mcp' | 'extension' | 'webview';

export interface StructuredLogFields {
    trace_id?: string;
    session_id?: string;
    [key: string]: string | number | boolean | undefined;
}

export interface FileLogSink {
    append(filePath: string, line: string): void;
}

const defaultSink: FileLogSink = {
    append(filePath, line) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.appendFileSync(filePath, line + '\n');
    },
};

export class BatchedFileLogger {
    private readonly queue: string[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly filePath: string,
        private readonly sink: FileLogSink = defaultSink,
        private readonly flushMs = 100,
    ) {}

    append(line: string): void {
        this.queue.push(line);
        if (this.timer) return;
        this.timer = setTimeout(() => this.flush(), this.flushMs);
    }

    flush(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.queue.length) return;
        const chunk = this.queue.join('\n');
        this.queue.length = 0;
        this.sink.append(this.filePath, chunk);
    }
}

export function formatStructuredLine(
    component: LogComponent,
    event: string,
    fields: StructuredLogFields = {},
): string {
    return formatLogEvent(component, event, fields);
}

export function createBatchedLogger(
    filePath: string,
    sink?: FileLogSink,
): BatchedFileLogger {
    return new BatchedFileLogger(filePath, sink);
}
