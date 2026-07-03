import { filterLogLinesByTrace } from './logTail.js';
import { buildDiagnoseBundle } from './registrySnapshot';

export interface DebugReportInput {
    traceId?: string;
    extension: Record<string, unknown>;
    registry: { entries: unknown[]; table: string[] };
    agentContext?: unknown;
    versionSkew?: unknown;
    deployStamp?: unknown;
    logPaths?: Record<string, string>;
    mcpLogLines: string[];
}

export function buildDebugReport(input: DebugReportInput): Record<string, unknown> {
    const filtered = input.traceId
        ? filterLogLinesByTrace(input.mcpLogLines, input.traceId)
        : input.mcpLogLines;
    const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        traceId: input.traceId || '',
        extension: input.extension,
        registry: input.registry,
        agentContext: input.agentContext,
        versionSkew: input.versionSkew,
        deployStamp: input.deployStamp,
        logPaths: input.logPaths,
        logTail: {
            mcpServer: input.mcpLogLines,
            mcpServerFiltered: filtered,
        },
    };
    report.diagnoseBundle = buildDiagnoseBundle(report);
    return report;
}
