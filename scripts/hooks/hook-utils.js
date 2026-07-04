/**
 * Shared utilities for Cursor hook scripts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced');
const SERVERS_DIR = path.join(CONFIG_DIR, 'servers');
const AGENT_CONTEXT_FILE = path.join(CONFIG_DIR, 'agent-context.json');
const AGENT_CONTEXT_TTL_MS = 5 * 60 * 1000;

function localDateKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function log(msg) {
    try {
        var logDir = path.join(CONFIG_DIR, 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        var dateKey = localDateKey();
        var logFile = path.join(logDir, 'hooks-' + dateKey + '.log');

        // migrate legacy hooks.log (non-symlink) to today's file
        var alias = path.join(logDir, 'hooks.log');
        try {
            var st = fs.lstatSync(alias);
            if (!st.isSymbolicLink() && !fs.existsSync(logFile)) {
                fs.renameSync(alias, logFile);
            }
        } catch (e) {}

        fs.appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + msg + '\n');

        // update symlink
        try {
            var target = 'hooks-' + dateKey + '.log';
            try {
                var cur = fs.readlinkSync(alias);
                if (cur !== target) { fs.unlinkSync(alias); fs.symlinkSync(target, alias); }
            } catch (e) {
                try { fs.symlinkSync(target, alias); } catch (e2) {}
            }
        } catch (e) {}

        // prune files older than 7 days
        try {
            var files = fs.readdirSync(logDir);
            var cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 6);
            cutoff.setHours(0, 0, 0, 0);
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                if (f.indexOf('hooks-') !== 0 || f.indexOf('.log') !== f.length - 4) continue;
                var key = f.slice(6, -4);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
                var fd = new Date(key + 'T00:00:00');
                if (fd < cutoff) {
                    try { fs.unlinkSync(path.join(logDir, f)); } catch (e) {}
                }
            }
        } catch (e) {}
    } catch (e) {}
}

function output(obj) {
    log('  -> output: ' + JSON.stringify(obj).slice(0, 300));
    process.stdout.write(JSON.stringify(obj));
}

function readJSON(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) { return null; }
}

function readStdin() {
    var rawInput = '';
    try {
        rawInput = fs.readFileSync('/dev/stdin', 'utf-8');
        return JSON.parse(rawInput);
    } catch (e) {
        log('PARSE_ERROR: ' + e.message + ' raw=' + rawInput.slice(0, 200));
        return null;
    }
}

function httpGet(port, urlPath, timeout) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            req.destroy();
            reject(new Error('timeout'));
        }, timeout || 2000);

        var req = http.get('http://127.0.0.1:' + port + urlPath, function (res) {
            var body = '';
            res.on('data', function (chunk) { body += chunk; });
            res.on('end', function () {
                clearTimeout(timer);
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: null });
                }
            });
        });
        req.on('error', function (err) {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function projectHash(dir) {
    var crypto = require('crypto');
    var normalized = path.normalize(dir).replace(/\/+$/, '');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function findServer(workspaceRoots) {
    try {
        if (!fs.existsSync(SERVERS_DIR)) {
            log('  findServer: no servers dir');
            return null;
        }

        var roots = (workspaceRoots || []).map(function (r) { return r.replace(/\/+$/, ''); });
        for (var i = 0; i < roots.length; i++) {
            var hash = projectHash(roots[i]);
            var files = fs.readdirSync(SERVERS_DIR).filter(function (f) {
                return f.endsWith('.json') && (f === hash + '.json' || f.indexOf(hash + '-') === 0);
            });
            for (var fi = 0; fi < files.length; fi++) {
                var s = readJSON(path.join(SERVERS_DIR, files[fi]));
                if (s && s.pid && s.port) {
                    try { process.kill(s.pid, 0); } catch (e) { continue; }
                    log('  findServer: hash match pid=' + s.pid + ' port=' + s.port + ' file=' + files[fi]);
                    return s;
                }
            }
        }

        // Single server fallback
        var files = fs.readdirSync(SERVERS_DIR).filter(function (f) { return f.endsWith('.json'); });
        var alive = [];
        for (var j = 0; j < files.length; j++) {
            var sv = readJSON(path.join(SERVERS_DIR, files[j]));
            if (!sv || !sv.pid || !sv.port) continue;
            try { process.kill(sv.pid, 0); } catch (e) { continue; }
            alive.push(sv);
        }
        if (alive.length === 1) {
            log('  findServer: single server pid=' + alive[0].pid + ' port=' + alive[0].port);
            return alive[0];
        }

        return null;
    } catch (e) { return null; }
}

var FEEDBACK_STATE_FILE = path.join(CONFIG_DIR, 'feedback-state.json');
var ENFORCEMENT_CONFIG_FILE = path.join(CONFIG_DIR, 'enforcement-config.json');

var DEFAULT_ENFORCEMENT = {
    maxToolCalls: 50,
    maxMinutes: 15,
};

function workspaceKey(workspaceRoots) {
    if (!workspaceRoots || !workspaceRoots.length) return '_global';
    var first = (workspaceRoots[0] || '').replace(/\/+$/, '');
    return first || '_global';
}

function readFeedbackState(wsKey) {
    var all = readJSON(FEEDBACK_STATE_FILE) || {};
    var key = wsKey || '_global';
    // Migrate flat format (pre per-workspace) to nested
    if (all.toolsSinceFeedback !== undefined || all.lastToolAt !== undefined) {
        var migrated = {};
        migrated[key] = all;
        try {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
            fs.writeFileSync(FEEDBACK_STATE_FILE, JSON.stringify(migrated));
        } catch (e) {}
        return all;
    }
    return all[key] || {};
}

function writeFeedbackState(state, wsKey) {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        var all = readJSON(FEEDBACK_STATE_FILE) || {};
        var key = wsKey || '_global';
        all[key] = state;
        fs.writeFileSync(FEEDBACK_STATE_FILE, JSON.stringify(all));
    } catch (e) {
        log('writeFeedbackState error: ' + e.message);
    }
}

function readEnforcementConfig() {
    var cfg = readJSON(ENFORCEMENT_CONFIG_FILE);
    if (!cfg) return DEFAULT_ENFORCEMENT;
    return {
        maxToolCalls: cfg.maxToolCalls || DEFAULT_ENFORCEMENT.maxToolCalls,
        maxMinutes: cfg.maxMinutes || DEFAULT_ENFORCEMENT.maxMinutes,
    };
}

function writeAgentContext(workspaceRoots, meta) {
    try {
        var roots = (workspaceRoots || []).map(function (r) { return r.replace(/\/+$/, ''); }).filter(Boolean);
        var traceId = (meta && meta.traceId) || process.env.CURSOR_TRACE_ID || '';
        if (!roots.length && !traceId) return;
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AGENT_CONTEXT_FILE, JSON.stringify({
            traceId: traceId,
            workspaceRoots: roots,
            updatedAt: Date.now(),
        }));
    } catch (e) {
        log('writeAgentContext error: ' + e.message);
    }
}

module.exports = {
    CONFIG_DIR,
    SERVERS_DIR,
    AGENT_CONTEXT_FILE,
    AGENT_CONTEXT_TTL_MS,
    FEEDBACK_STATE_FILE,
    ENFORCEMENT_CONFIG_FILE,
    DEFAULT_ENFORCEMENT,
    log,
    output,
    readJSON,
    readStdin,
    httpGet,
    findServer,
    workspaceKey,
    readFeedbackState,
    writeFeedbackState,
    readEnforcementConfig,
    writeAgentContext,
};
