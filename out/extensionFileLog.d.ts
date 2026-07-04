import { type LogComponent, type StructuredLogFields } from './structuredFileLog.js';
export declare function hubLog(msg: string): void;
export declare function hubStructuredLog(event: string, fields?: StructuredLogFields, component?: LogComponent): void;
export declare function flushHubLog(): void;
export declare function resetHubLoggerForTests(): void;
