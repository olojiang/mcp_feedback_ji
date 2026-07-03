"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichRegistryEntries = enrichRegistryEntries;
exports.versionSkewWarnings = versionSkewWarnings;
exports.formatRegistryTable = formatRegistryTable;
function enrichRegistryEntries(servers, isAlive) {
    return servers.map((s) => ({
        ...s,
        alive: isAlive(s.pid),
    }));
}
/** Warn when other live extension windows run a different build. */
function versionSkewWarnings(entries, localVersion, localPid) {
    const warnings = [];
    for (const e of entries) {
        if (!e.alive || e.pid === localPid)
            continue;
        if (e.version !== localVersion) {
            const ws = e.projectPath.split(/[/\\]/).pop() || e.projectPath;
            warnings.push(`${ws} pid=${e.pid} runs ${e.version} (this window: ${localVersion})`);
        }
    }
    return warnings;
}
function formatRegistryTable(entries) {
    return entries.map((e) => {
        const ws = e.projectPath.split(/[/\\]/).pop() || e.projectPath;
        const status = e.alive ? 'live' : 'stale';
        return `${status} | ${ws} | :${e.port} pid=${e.pid} | ${e.version}`;
    });
}
//# sourceMappingURL=registrySnapshot.js.map