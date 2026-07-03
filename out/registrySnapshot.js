"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichRegistryEntries = enrichRegistryEntries;
exports.isPublishableVersion = isPublishableVersion;
exports.isTestRegistryEntry = isTestRegistryEntry;
exports.versionSkewWarnings = versionSkewWarnings;
exports.formatRegistryTable = formatRegistryTable;
exports.buildDiagnoseBundle = buildDiagnoseBundle;
function enrichRegistryEntries(servers, isAlive) {
    return servers.map((s) => ({
        ...s,
        alive: isAlive(s.pid),
    }));
}
/** Release builds use semver or ji patch tags only. */
function isPublishableVersion(version) {
    return /^\d+\.\d+\.\d+(-ji\.\d+)?$/.test(String(version || ''));
}
function isTestRegistryEntry(info) {
    if (!isPublishableVersion(info.version))
        return true;
    const p = String(info.projectPath || '');
    return p.startsWith('/tmp/') || p.includes('/var/folders/');
}
/** Warn when other live extension windows run a different build. */
function versionSkewWarnings(entries, localVersion, localPid) {
    const warnings = [];
    for (const e of entries) {
        if (!e.alive || e.pid === localPid)
            continue;
        if (isTestRegistryEntry(e))
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
        const tag = isTestRegistryEntry(e) ? ' test' : '';
        return `${status}${tag} | ${ws} | :${e.port} pid=${e.pid} | ${e.version}`;
    });
}
function buildDiagnoseBundle(payload) {
    return JSON.stringify({
        generated_at: new Date().toISOString(),
        ...payload,
    }, null, 2);
}
//# sourceMappingURL=registrySnapshot.js.map