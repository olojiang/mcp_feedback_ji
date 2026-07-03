/** @param {NodeJS.ProcessEnv} env */
function shouldKillMcpServersOnDeploy(env = process.env) {
    return env.MCP_FEEDBACK_KILL_MCP_ON_DEPLOY === '1';
}

/**
 * @param {string} psOutput
 * @param {string} serverPath
 * @param {number} currentPid
 * @returns {number[]}
 */
function findMcpServerPids(psOutput, serverPath, currentPid) {
    return psOutput
        .split(/\r?\n/)
        .map((line) => {
            const match = line.trim().match(/^(\d+)\s+(.+)$/);
            if (!match) return null;
            const pid = Number(match[1]);
            const args = match[2];
            if (!Number.isFinite(pid) || pid === currentPid) return null;
            return args.includes(serverPath) ? pid : null;
        })
        .filter((pid) => pid !== null);
}

module.exports = {
    shouldKillMcpServersOnDeploy,
    findMcpServerPids,
};
