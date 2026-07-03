import * as fs from 'node:fs';

/** Read last N lines from a log file (best-effort; missing file returns []). */
export function readLogTailLines(filePath: string, maxLines = 50): string[] {
    if (!filePath || maxLines <= 0) return [];
    try {
        if (!fs.existsSync(filePath)) return [];
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
        return lines.slice(-maxLines);
    } catch {
        return [];
    }
}

/** Keep lines that mention trace=ID (case-sensitive substring match). */
export function filterLogLinesByTrace(lines: string[], traceId: string): string[] {
    if (!traceId || !lines.length) return [];
    const needle = `trace=${traceId}`;
    return lines.filter((line) => line.includes(needle));
}
