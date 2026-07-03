"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionJournalPath = sessionJournalPath;
exports.isContinuationEvent = isContinuationEvent;
exports.buildSessionJournalRecord = buildSessionJournalRecord;
exports.appendSessionJournalRecord = appendSessionJournalRecord;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const configPaths_js_1 = require("./configPaths.js");
function sessionJournalPath(logDir = (0, configPaths_js_1.getLogsDir)()) {
    return path.join(logDir, 'session-journal.jsonl');
}
function isContinuationEvent(event) {
    return event === 'transport_reuse'
        || event === 'trace_reuse'
        || event === 'trace_steal';
}
function buildSessionJournalRecord(input) {
    return {
        at: (input.at ?? new Date()).toISOString(),
        event: input.event,
        feedbackSessionId: input.feedbackSessionId,
        cursorTraceId: input.cursorTraceId,
        projectDirectory: input.projectDirectory,
        workspaceRoots: input.workspaceRoots,
        hubPort: input.hubPort,
        hubPid: input.hubPid,
        mcpConnId: input.mcpConnId,
        mcpReadyState: input.mcpReadyState,
        pendingCount: input.pendingCount,
        continuation: isContinuationEvent(input.event),
        reason: input.reason,
        summaryPreview: input.summaryPreview?.slice(0, 120),
    };
}
/** Append one JSON line to session-journal.jsonl (durable audit trail). */
function appendSessionJournalRecord(record, logDir = (0, configPaths_js_1.getLogsDir)()) {
    const dir = logDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(sessionJournalPath(dir), `${JSON.stringify(record)}\n`, 'utf8');
}
//# sourceMappingURL=sessionJournal.js.map