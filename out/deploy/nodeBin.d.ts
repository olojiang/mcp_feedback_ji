import { execSync } from 'node:child_process';
/** Resolve `node` for configs spawned by Cursor (hooks, MCP). Cached after first call. */
export declare function resolveNodeBin(exec?: typeof execSync): string;
export declare function resetNodeBinCacheForTests(): void;
