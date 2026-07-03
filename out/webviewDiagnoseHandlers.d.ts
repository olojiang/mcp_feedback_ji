export interface DebugReportInput {
    traceId?: string;
    extension: Record<string, unknown>;
    registry: {
        entries: unknown[];
        table: string[];
    };
    agentContext?: unknown;
    versionSkew?: unknown;
    deployStamp?: unknown;
    logPaths?: Record<string, string>;
    mcpLogLines: string[];
}
export declare function buildDebugReport(input: DebugReportInput): Record<string, unknown>;
