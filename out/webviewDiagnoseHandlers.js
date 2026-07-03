"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDebugReport = buildDebugReport;
const logTail_js_1 = require("./logTail.js");
const registrySnapshot_1 = require("./registrySnapshot");
function buildDebugReport(input) {
    const filtered = input.traceId
        ? (0, logTail_js_1.filterLogLinesByTrace)(input.mcpLogLines, input.traceId)
        : input.mcpLogLines;
    const report = {
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
    report.diagnoseBundle = (0, registrySnapshot_1.buildDiagnoseBundle)(report);
    return report;
}
//# sourceMappingURL=webviewDiagnoseHandlers.js.map