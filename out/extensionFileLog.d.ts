import { type LogComponent, type StructuredLogFields } from './structuredFileLog.js';
/** Test hook: redirect extension logs to a temp directory. */
export declare function setExtensionLogDirForTests(dir: string | null): void;
export declare function hubLog(msg: string): void;
export declare function hubStructuredLog(event: string, fields?: StructuredLogFields, component?: LogComponent): void;
export declare function flushHubLog(): void;
export declare function resetHubLoggerForTests(): void;
