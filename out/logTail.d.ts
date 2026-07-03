/** Read last N lines from a log file (best-effort; missing file returns []). */
export declare function readLogTailLines(filePath: string, maxLines?: number): string[];
