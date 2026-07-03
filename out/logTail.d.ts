/** Read last N lines from a log file (best-effort; missing file returns []). */
export declare function readLogTailLines(filePath: string, maxLines?: number): string[];
/** Keep lines that mention trace=ID (case-sensitive substring match). */
export declare function filterLogLinesByTrace(lines: string[], traceId: string): string[];
