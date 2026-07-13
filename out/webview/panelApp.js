(function () {
    'use strict';

    window.addEventListener('error', function (e) {
        try {
            var err = e.error || e.message || String(e);
            var msg = 'JS_ERROR: ' + (err && err.stack ? err.stack : String(err))
                + ' at ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?');
            if (window.__mcpVscode) window.__mcpVscode.postMessage({ type: 'log', msg: msg });
            console.error(msg);
        } catch (_) {}
    });

    var PS = window.PanelStateModule || (typeof PanelState !== 'undefined' ? { PanelState: PanelState } : null);
    var EP = window.ErudaPanelModule || {
        loadHeight: function (_storage, viewportHeight) {
            return Math.round((viewportHeight || 600) * 0.33);
        },
    };
    if (!PS) {
        console.error('PanelState not loaded');
        if (window.__mcpVscode) {
            window.__mcpVscode.postMessage({
                type: 'log',
                msg: 'panelApp abort: PanelState missing scripts=' + JSON.stringify(window.__mcpScriptLoad || {}),
            });
        }
        return;
    }

    var state = new PS.PanelState();
    state.panelWorkspace = PROJECT_PATH;
    var vscode = window.__mcpVscode || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null);
    window.__mcpVscode = vscode;
    var wsUrl = SERVER_URL;
    var useBridge = !!vscode;
    var bridgeGate = new PS.BridgeSessionGate();
    var outboundQueue = new PS.OutboundQueue();
    var transportMetrics = new PS.TransportMetrics();

    function transportReady() {
        if (useBridge) return bridgeGate.isReady();
        return ws && ws.readyState === WebSocket.OPEN;
    }

    function transportSend(obj) {
        if (useBridge) {
            if (!bridgeGate.isReady()) return false;
            transportMetrics.record('bridge');
            vscode.postMessage({ type: 'hub-message', data: obj });
            return true;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            transportMetrics.record('ws');
            ws.send(JSON.stringify(obj));
            return true;
        }
        return false;
    }

    function flushOutboundQueue() {
        if (!transportReady()) return;
        var items = outboundQueue.drain();
        if (!items.length) return;
        debugLog('flushOutboundQueue n=' + items.length);
        for (var i = 0; i < items.length; i++) {
            transportSend(items[i]);
        }
    }

    function queueOutbound(message) {
        var size = outboundQueue.enqueue(message);
        debugLog('queueOutbound type=' + (message && message.type) + ' size=' + size);
        if (message && message.type === 'feedback_response') {
            debugLog('event=panel_submit_no_effect reason=transport_queued session='
                + (message.session_id || '(none)') + ' queue_size=' + size);
            showToast('Reconnecting — feedback queued');
        }
        if (message && message.type === 'queue-pending') {
            debugLog('event=panel_submit_detached_queue comments=' + ((message.comments || []).length));
        }
    }

    function execWsSend(message) {
        if (message && message.type === 'feedback_response') {
            debugLog('event=panel_submit_attempt session=' + (message.session_id || '(none)')
                + ' feedback_len=' + ((message.feedback || '').length)
                + ' queued=' + (!transportReady()));
        }
        return PS.transportSendWithQueue(
            message,
            transportReady,
            function (m) { transportSend(m); },
            queueOutbound
        );
    }

    var messagesEl = document.getElementById('messages');
    var sessionTabsEl = document.getElementById('sessionTabs');
    var tabContextMenu = document.getElementById('tabContextMenu');
    var closeResolvedBtn = document.getElementById('closeResolvedBtn');
    var emptyState = document.getElementById('emptyState');
    var pendingSection = document.getElementById('pendingSection');
    var pendingCountEl = document.getElementById('pendingCount');
    var pendingList = document.getElementById('pendingList');
    var clearPendingBtn = document.getElementById('clearPendingBtn');
    var quickReplies = document.getElementById('quickReplies');
    var inputEl = document.getElementById('input');
    var sendBtn = document.getElementById('sendBtn');
    var settingsBtn = document.getElementById('settingsBtn');
    var settingsPanel = document.getElementById('settingsPanel');
    var debugBtn = document.getElementById('debugBtn');
    var debugPanel = document.getElementById('debugPanel');
    var debugJsonEl = document.getElementById('debugJson');
    var debugRegistryEl = document.getElementById('debugRegistry');
    var debugAgentContextEl = document.getElementById('debugAgentContext');
    var routingBannerEl = document.getElementById('routingBanner');
    var routingProjectEl = document.getElementById('routingProject');
    var waitingBadgeEl = document.getElementById('waitingBadge');
    var sessionSearchInput = document.getElementById('sessionSearchInput');
    var sessionSearchQuery = '';
    var debugDevToolsBtn = document.getElementById('debugDevToolsBtn');
    var debugReconnectBtn = document.getElementById('debugReconnectBtn');
    var debugCopyBtn = document.getElementById('debugCopyBtn');
    var debugCloseBtn = document.getElementById('debugCloseBtn');
    var autoReplyCheck = document.getElementById('autoReplyCheck');
    var autoReplyText = document.getElementById('autoReplyText');
    var atDropdown = document.getElementById('atDropdown');
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = document.getElementById('lightboxImg');
    var imagePreviews = document.getElementById('imagePreviews');
    var attachBtn = document.getElementById('attachBtn');
    var fileInput = document.getElementById('fileInput');
    var browseBtn = document.getElementById('browseBtn');
    var lruPaths = document.getElementById('lruPaths');
    var bottomPane = document.getElementById('bottomPane');
    var paneSplitter = document.getElementById('paneSplitter');
    var scrollBottomBtn = document.getElementById('scrollBottomBtn');
    var versionSkewBannerEl = document.getElementById('versionSkewBanner');
    var deployReloadBannerEl = document.getElementById('deployReloadBanner');
    var deployStampLabelEl = document.getElementById('deployStampLabel');
    var ctrlEnterCheck = document.getElementById('ctrlEnterCheck');
    var confirmFinishedCheck = document.getElementById('confirmFinishedCheck');
    var inputPaneHeightInput = document.getElementById('inputPaneHeightInput');
    var quickRepliesConfig = document.getElementById('quickRepliesConfig');
    var debugSessionTracesEl = document.getElementById('debugSessionTraces');

    var ws = null;
    var reconnectAttempts = 0;
    var lastForceReconnectAt = 0;

    var wsStatusEl = document.getElementById('wsStatus');
    var wsStatusLabel = document.getElementById('wsStatusLabel');
    var wsPortEl = document.getElementById('wsPort');
    var connectionDetailEl = document.getElementById('connectionDetail');
    var wsReconnectBtn = document.getElementById('wsReconnectBtn');

    var debugEvents = [];
    var lastExtensionDebugReport = null;
    var lastHealthSig = '';
    var userPingPending = false;
    var userPingTimer = null;
    var lastPongAt = 0;
    var lastHubActivityAt = 0;
    var connectedHubPid = null;
    var agentResumeWatchTimer = null;

    var agentResumeWatch = window.PanelAgentResumeWatchModule || null;
    var AGENT_RESUME_STALL_MS = agentResumeWatch
        ? agentResumeWatch.AGENT_RESUME_STALL_MS
        : 30000;
    var AGENT_RESUME_STALL_TOAST = agentResumeWatch
        ? agentResumeWatch.AGENT_RESUME_STALL_TOAST
        : 'Reply delivered. If Cursor still spins: Stop the turn, then send a new chat message.';

    function clearAgentResumeWatch() {
        if (agentResumeWatchTimer) {
            clearTimeout(agentResumeWatchTimer);
            agentResumeWatchTimer = null;
        }
    }

    function startAgentResumeWatch(sessionId) {
        if (agentResumeWatch) {
            agentResumeWatchTimer = agentResumeWatch.scheduleAgentResumeWatch(
                clearAgentResumeWatch,
                setTimeout,
                AGENT_RESUME_STALL_MS,
                function () {
                    agentResumeWatchTimer = null;
                    debugLog(agentResumeWatch.agentResumeStallLogLine(sessionId, state.waitingCount));
                    showToast(AGENT_RESUME_STALL_TOAST);
                },
            );
            return;
        }
        clearAgentResumeWatch();
        agentResumeWatchTimer = setTimeout(function () {
            agentResumeWatchTimer = null;
            debugLog('event=agent_resume_stall session=' + (sessionId || '-')
                + ' waiting_count=' + state.waitingCount);
            showToast(AGENT_RESUME_STALL_TOAST);
        }, AGENT_RESUME_STALL_MS);
    }
    var PING_STALE_MS = 45000;
    var erudaInited = false;
    var erudaDisplayPct = Math.round(
        (EP.loadHeight(localStorage, window.innerHeight || 600) / (window.innerHeight || 600)) * 100
    );

    function logEruda(msg) {
        console.log('[mcp-eruda] ' + msg);
        debugLog('eruda: ' + msg);
    }

    function ensureErudaInited() {
        if (erudaInited) return true;
        if (typeof eruda === 'undefined') {
            console.warn('[mcp-eruda] script not loaded');
            return false;
        }
        try {
            eruda.init({
                tool: ['console', 'elements', 'network', 'resources', 'info'],
                defaults: {
                    displaySize: erudaDisplayPct,
                    transparency: 1,
                },
            });
            erudaInited = true;
            return true;
        } catch (err) {
            console.error('[mcp-eruda] init failed', err);
            debugLog('eruda init failed: ' + (err && err.message ? err.message : String(err)));
            return false;
        }
    }

    function bootstrapErudaPanel() {
        var load = window.__mcpScriptLoad || {};
        if (load.errors && load.errors.length) {
            logEruda('script load errors: ' + load.errors.join(', '));
        }
        if (ensureErudaInited()) {
            logEruda('init at page load ok displaySize=' + erudaDisplayPct + '%');
        } else {
            logEruda('init at page load skipped (eruda=' + (typeof eruda) + ')');
        }
    }

    function debugLog(msg) {
        debugEvents.push({ t: new Date().toISOString(), msg: msg });
        if (debugEvents.length > 50) debugEvents.shift();
        if (vscode) {
            vscode.postMessage({ type: 'log', msg: msg });
        }
    }

    function collectLocalDebugState() {
        return {
            webview: {
                useBridge: useBridge,
                bridgeGate: bridgeGate.snapshot(),
                wsUrl: wsUrl,
                wsReadyState: ws ? ws.readyState : null,
                bootstrapped: !!window.__mcpBootstrapped,
                reconnectAttempts: reconnectAttempts,
                vscodeApi: !!vscode,
                transportReady: transportReady(),
                outboundQueued: outboundQueue.size,
                transportMetrics: transportMetrics.snapshot(),
                erudaInited: erudaInited,
            },
            events: debugEvents.slice(-30),
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
        };
    }

    function renderDebugPanel() {
        if (!debugJsonEl) return;
        var payload = {
            local: collectLocalDebugState(),
            extension: lastExtensionDebugReport || { note: 'waiting for extension debug-report...' },
        };
        debugJsonEl.textContent = JSON.stringify(payload, null, 2);
        if (debugRegistryEl && lastExtensionDebugReport && lastExtensionDebugReport.registry) {
            var reg = lastExtensionDebugReport.registry;
            debugRegistryEl.textContent = (reg.table || []).join('\n') || '(no registry entries)';
        }
        if (debugAgentContextEl) {
            debugAgentContextEl.textContent = JSON.stringify(
                (lastExtensionDebugReport && lastExtensionDebugReport.agentContext) || null,
                null,
                2,
            );
        }
        if (debugSessionTracesEl) {
            debugSessionTracesEl.textContent = JSON.stringify(
                PS.PanelState.debugSessionTraces(state),
                null,
                2,
            );
        }
        var debugMcpLogTailEl = document.getElementById('debugMcpLogTail');
        if (debugMcpLogTailEl && lastExtensionDebugReport && lastExtensionDebugReport.logTail) {
            var tail = lastExtensionDebugReport.logTail.mcpServer || [];
            debugMcpLogTailEl.textContent = tail.length ? tail.join('\n') : '(mcp log empty or missing)';
        }
    }

    function showRoutingBanner(project) {
        if (!routingBannerEl || !routingProjectEl) return;
        if (!project) {
            routingBannerEl.classList.remove('visible');
            return;
        }
        routingProjectEl.textContent = project;
        routingBannerEl.classList.add('visible');
    }

    function showVersionSkewBanner(warnings) {
        if (!versionSkewBannerEl) return;
        var text = PS.PanelState.versionSkewBannerText(warnings || []);
        if (!text) {
            versionSkewBannerEl.classList.remove('visible');
            versionSkewBannerEl.textContent = '';
            return;
        }
        versionSkewBannerEl.textContent = 'Version skew: ' + text + ' — Reload Window on each Cursor window.';
        versionSkewBannerEl.classList.add('visible');
    }

    function showDeployReloadBanner(msg) {
        if (!deployReloadBannerEl) return;
        var text = (msg && msg.deployReloadBanner)
            || PS.PanelState.deployReloadBannerText(
                (msg && msg.memoryVersion) || '',
                (msg && msg.version) || '',
                msg && msg.deployStamp,
            );
        if (!text) {
            deployReloadBannerEl.classList.remove('visible');
            deployReloadBannerEl.textContent = '';
            return;
        }
        deployReloadBannerEl.textContent = text;
        deployReloadBannerEl.classList.add('visible');
    }

    function applyDeployLabel(msg) {
        if (!deployStampLabelEl || !msg) return;
        if (msg.deployLabel) {
            deployStampLabelEl.textContent = msg.deployLabel;
            deployStampLabelEl.title = msg.deployLabel;
        }
        if (msg.memoryVersion && msg.version && msg.memoryVersion !== msg.version) {
            var vl = document.getElementById('versionLabel');
            if (vl) vl.textContent = 'v' + msg.version + ' (mem ' + msg.memoryVersion + ')';
        }
    }

    function applyQuickRepliesFromHost(msg) {
        if (!msg || !msg.quickReplies || !msg.quickReplies.length) return;
        state.quickReplies = PS.PanelState.normalizeQuickReplies(msg.quickReplies);
        if (quickRepliesConfig) quickRepliesConfig.value = quickRepliesToConfigText(state.quickReplies);
        renderQuickReplies();
    }

    function quickRepliesToConfigText(list) {
        return (list || []).map(function (q) {
            return (q.label || '') + '|' + (q.text || '');
        }).join('\n');
    }

    function renderQuickReplies() {
        if (!quickReplies) return;
        quickReplies.innerHTML = '';
        var list = state.quickReplies || PS.PanelState.DEFAULT_QUICK_REPLIES;
        for (var i = 0; i < list.length; i++) {
            var q = list[i];
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-reply-btn' + (q.finished ? ' finished-reply-btn' : '');
            btn.dataset.text = q.text || '';
            btn.title = q.finished ? 'End session (Shift+click to fill input)' : 'Click send; Shift+click fill input';
            var label = (q.icon ? q.icon + ' ' : '') + (q.label || q.text || '');
            btn.textContent = label;
            quickReplies.appendChild(btn);
        }
    }

    function getInputTextareaMaxPx() {
        return Math.max(48, (state.inputPaneHeight || 220) - 72);
    }

    function syncInputTextareaToPane() {
        if (!inputEl) return;
        requestAnimationFrame(function () {
            inputEl.style.height = getInputTextareaMaxPx() + 'px';
        });
    }

    function applyInputPaneHeight(heightPx) {
        if (!bottomPane) return;
        var h = PS.PanelState.clampInputPaneHeight(heightPx, window.innerHeight || 600);
        state.inputPaneHeight = h;
        bottomPane.style.height = h + 'px';
        if (inputPaneHeightInput) inputPaneHeightInput.value = String(h);
        try {
            localStorage.setItem('mcp-feedback-input-pane-height', String(h));
        } catch (_e) { /* ignore */ }
        syncInputTextareaToPane();
    }

    function setupPaneSplitter() {
        if (!paneSplitter || !bottomPane) return;
        var dragging = false;
        var startY = 0;
        var startH = 0;
        paneSplitter.addEventListener('mousedown', function (e) {
            dragging = true;
            startY = e.clientY;
            startH = bottomPane.getBoundingClientRect().height;
            e.preventDefault();
        });
        paneSplitter.addEventListener('dblclick', function () {
            applyInputPaneHeight(220);
            saveState();
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            var delta = startY - e.clientY;
            applyInputPaneHeight(startH + delta);
        });
        window.addEventListener('mouseup', function () {
            if (!dragging) return;
            dragging = false;
            syncInputTextareaToPane();
            saveState();
        });
    }

    function updateScrollBottomBtn() {
        if (!scrollBottomBtn || !messagesEl) return;
        scrollBottomBtn.hidden = !PS.PanelState.messagesScrolledUp(messagesEl, 48);
    }

    function scrollMessagesToBottom() {
        if (!messagesEl) return;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        updateScrollBottomBtn();
    }

    function playFeedbackChime() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            var ctx = new Ctx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.04;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } catch (_e) { /* ignore */ }
    }

    function updateWaitingBadge() {
        if (!waitingBadgeEl) return;
        var n = state.waitingCount || 0;
        waitingBadgeEl.textContent = n > 0 ? String(n) : '';
    }

    function openDebugPanel() {
        if (!debugPanel) return;
        debugPanel.classList.add('visible');
        settingsPanel.classList.remove('visible');
        if (debugBtn) debugBtn.classList.add('active');
        renderDebugPanel();
        if (vscode) {
            var active = state.getActiveSession();
            vscode.postMessage({
                type: 'request-debug',
                trace_id: active && active.traceId ? active.traceId : '',
            });
        }
    }

    function closeDebugPanel() {
        if (!debugPanel) return;
        debugPanel.classList.remove('visible');
        if (debugBtn) debugBtn.classList.remove('active');
    }

    function getFullDebugJson() {
        return JSON.stringify({
            local: collectLocalDebugState(),
            extension: lastExtensionDebugReport,
        }, null, 2);
    }

    function getWsPort() {
        try {
            var m = wsUrl.match(/:(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
        } catch (_e) { return 0; }
    }

    (function showPort() {
        var port = getWsPort();
        if (port) wsPortEl.textContent = ':' + port;
    })();

    function setWsStatus(s, detail) {
        wsStatusEl.dataset.state = s;
        var defaults = {
            connected: 'Connected',
            degraded: 'Degraded',
            connecting: 'Connecting...',
            disconnected: 'Disconnected — click ↻ or Reload Window',
        };
        wsStatusLabel.textContent = detail || defaults[s] || s;
    }

    function applyHubSnapshot(hub) {
        if (!hub || typeof hub !== 'object') return;
        state.hubSnapshot = hub;
        if (hub.pid) connectedHubPid = hub.pid;
    }

    var connectionRenderer = null;
    function ensureConnectionRenderer() {
        if (connectionRenderer || !window.PanelConnectionModule) return connectionRenderer;
        connectionRenderer = window.PanelConnectionModule.createConnectionRenderer({
            PS: PS,
            state: state,
            bridgeGate: bridgeGate,
            elements: {
                connectionDetailEl: connectionDetailEl,
                wsPortEl: wsPortEl,
            },
            helpers: {
                PING_STALE_MS: PING_STALE_MS,
                getLastPongAt: function () { return lastPongAt; },
                getLastHubActivityAt: function () { return lastHubActivityAt; },
                getConnectedHubPid: function () { return connectedHubPid; },
                getLastExtensionDebugReport: function () { return lastExtensionDebugReport; },
                getWsPort: getWsPort,
                setWsStatus: setWsStatus,
                showVersionSkewBanner: showVersionSkewBanner,
                updateWaitingBadge: updateWaitingBadge,
                showRoutingBanner: showRoutingBanner,
            },
        });
        return connectionRenderer;
    }

    function renderConnectionHealth() {
        var r = ensureConnectionRenderer();
        if (r) {
            var result = r.render();
            if (result && result.health && result.health.issues && result.health.issues.length) {
                debugLog('connection_health issues=' + result.health.issues.join('; '));
            }
        }
    }

    function applyConnectionInfo(msg) {
        if (!msg || !msg.port) return;
        var nextUrl = PS.PanelState.resolveWsUrl(wsUrl, msg.port);
        if (nextUrl !== wsUrl) {
            console.warn('mcp-feedback ws port drift:', getWsPort(), '->', msg.port);
            wsUrl = nextUrl;
            forceReconnect();
            return;
        }
        wsPortEl.textContent = ':' + msg.port;
        wsPortEl.textContent = ':' + msg.port;
        setWsStatus('connected', PS.PanelState.formatConnectionStatusLabel('ok', msg.pid));
    }

    function forceReconnect() {
        var now = Date.now();
        if (PS.PanelState.shouldDebounceReconnect(lastForceReconnectAt, now)) {
            debugLog('forceReconnect debounced');
            return;
        }
        lastForceReconnectAt = now;
        debugLog('forceReconnect');
        bridgeGate.resetForReconnect();
        if (useBridge) {
            setWsStatus('connecting', 'Reconnecting...');
            vscode.postMessage({ type: 'hub-connect' });
            return;
        }
        if (ws) { try { ws.close(); } catch (_e) { /* ignore */ } }
        ws = null; reconnectAttempts = 0;
        setWsStatus('connecting', 'Reconnecting...');
        connect();
    }

    wsStatusEl.addEventListener('click', forceReconnect);
    wsReconnectBtn.addEventListener('click', forceReconnect);

    // ── Command Executor ────────────────────────────────

    function exec(result) {
        if (!result) return;
        var cmds = Array.isArray(result) ? result : result.commands;
        if (!cmds) return;

        for (var i = 0; i < cmds.length; i++) {
            var cmd = cmds[i];
            switch (cmd.type) {
                case 'ws_send':
                    execWsSend(cmd.message);
                    break;
                case 'render':
                    for (var j = 0; j < cmd.targets.length; j++) {
                        switch (cmd.targets[j]) {
                            case 'tabs': renderTabs(); break;
                            case 'messages': renderMessages(); break;
                            case 'pending': renderPending(); break;
                            case 'input': updateSendButton(); break;
                            case 'connection': renderConnectionHealth(); break;
                            case 'images': renderStagedImages(); break;
                            case 'staged_images': renderStagedImages(); break;
                        }
                    }
                    break;
                case 'dom':
                    switch (cmd.action) {
                        case 'set_input': inputEl.value = cmd.value || ''; break;
                        case 'clear_input': inputEl.value = ''; break;
                        case 'focus_input': inputEl.focus(); break;
                        case 'set_staged_images': renderStagedImages(); break;
                        case 'clear_staged_images': renderStagedImages(); break;
                        case 'update_send_button': updateSendButton(); break;
                        case 'save_state': saveState(); break;
                        case 'sync_settings': syncSettings(); break;
                        case 'render_quick_replies': renderQuickReplies(); break;
                        case 'apply_pane_height': applyInputPaneHeight(state.inputPaneHeight || 220); break;
                        case 'user_ping': beginUserPing(); break;
                    }
                    break;
                case 'notify':
                    if (cmd.message) {
                        if (cmd.message.type === 'feedback-arrived') playFeedbackChime();
                        if (cmd.message.type === 'routing-mismatch') showRoutingBanner(cmd.message.project);
                        if (cmd.message.type === 'agent-turn-status') {
                            showToast(cmd.message.detail || 'Cursor Agent 已结束 — 回复将存入队列');
                        }
                        if (cmd.message.type === 'agent-link-lost-queued') {
                            showToast(cmd.message.detail || 'Agent link lost — saved to queue. Toggle MCP off/on.');
                        }
                    }
                    if (vscode && cmd.message) vscode.postMessage(cmd.message);
                    break;
            }
        }

        if (result.autoSubmit) {
            var as = result.autoSubmit;
            if (as.session_id) exec(state.setActiveSession(as.session_id));
            exec(state.submitFeedback(as.text, as.images || [], {
                preserveInput: true,
                session_id: as.session_id,
            }));
        }
        if (result.autoReply) {
            var ar = result.autoReply;
            setTimeout(function () {
                var sid = ar.session_id || state.activeSessionId;
                var sess = sid && state.sessions[sid];
                if (sess && sess.waiting) {
                    exec(state.submitFeedback(ar.text, [], { preserveInput: true, session_id: sid }));
                }
            }, ar.delay || 500);
        }
    }

    // ── Persistence ─────────────────────────────────────

    var STORAGE_KEY = PS.storageKeyForWorkspace
        ? PS.storageKeyForWorkspace(PROJECT_PATH)
        : ('mcp-fb-v4-multi-' + PROJECT_PATH.replace(/[^a-zA-Z0-9]/g, '-').slice(-30));
    var LEGACY_STORAGE_KEY = 'mcp-fb-v4-multi-' + PROJECT_PATH.replace(/[^a-zA-Z0-9]/g, '-').slice(-30);

    function saveState() {
        try {
            var data = state.serialize();
            if (typeof outboundQueue.snapshot === 'function') {
                data.outboundQueue = outboundQueue.snapshot();
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    function syncSettings() {
        autoReplyCheck.checked = !!state.autoReply;
        autoReplyText.value = state.autoReplyText || 'Continue';
        if (ctrlEnterCheck) ctrlEnterCheck.checked = state.ctrlEnterSend !== false;
        if (confirmFinishedCheck) confirmFinishedCheck.checked = state.confirmFinished !== false;
        if (quickRepliesConfig) quickRepliesConfig.value = quickRepliesToConfigText(state.quickReplies);
        if (inputPaneHeightInput) inputPaneHeightInput.value = String(state.inputPaneHeight || 220);
    }

    var pendingLocalRestore = null;
    var bootHydratedFromServer = false;

    function tryHydrateAfterStateSync() {
        if (bootHydratedFromServer) return;
        bootHydratedFromServer = true;
        debugLog('hydrateAfterStateSync localRestore=' + (pendingLocalRestore ? 'yes' : 'no'));
        var serverPending = state.snapshotServerPendingSessions();
        var serverGlobal = state.snapshotServerGlobalPending();
        if (serverPending.length) {
            debugLog('hydrateAfterStateSync server_pending_snapshot n=' + serverPending.length
                + ' ids=' + serverPending.map(function (p) { return p.id; }).join(','));
        }
        if (pendingLocalRestore) {
            try {
                var d = JSON.parse(pendingLocalRestore);
                if (d) {
                    state.deserialize(d);
                    if (typeof outboundQueue.restore === 'function') {
                        outboundQueue.restore(d.outboundQueue);
                    }
                }
            } catch (e) { /* ignore */ }
            pendingLocalRestore = null;
        }
        state.restoreServerPendingSessions(serverPending);
        state.restoreServerGlobalPending(serverGlobal);
        debugLog('hydrateAfterStateSync restored waiting_count=' + state.waitingCount
            + ' active=' + (state.activeSessionId || '(none)'));
        exec(state.reconcileLocalAfterServerSync());
        renderTabs();
        renderMessages();
        renderPending();
        renderStagedImages();
        updateSendButton();
        if (state.getActiveSession() && state.getActiveSession().inputDraft) {
            inputEl.value = state.getActiveSession().inputDraft;
        }
    }

    // ── Renderers (pure DOM from state) ─────────────────

    function hideTabContextMenu() {
        tabContextMenu.classList.remove('visible');
        tabContextMenu.innerHTML = '';
    }

    function showTabContextMenu(e, sid) {
        hideTabContextMenu();
        var items = [
            { label: 'Close', run: function () { exec(state.closeSession(sid)); } },
            { label: 'Close Others', run: function () { exec(state.closeOtherSessions(sid)); } },
            { label: 'Close to the Left', run: function () { exec(state.closeSessionsToLeft(sid)); } },
            { label: 'Close All Resolved', run: function () { exec(state.closeResolvedSessions()); } },
        ];
        for (var i = 0; i < items.length; i++) {
            (function (item) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = item.label;
                btn.onclick = function () { hideTabContextMenu(); item.run(); };
                tabContextMenu.appendChild(btn);
            })(items[i]);
        }
        tabContextMenu.style.left = e.clientX + 'px';
        tabContextMenu.style.top = e.clientY + 'px';
        tabContextMenu.classList.add('visible');
    }

    if (closeResolvedBtn) {
        closeResolvedBtn.addEventListener('click', function () {
            exec(state.closeResolvedSessions());
        });
    }

    function renderTabs() {
        sessionTabsEl.innerHTML = '';
        var order = PS.PanelState.filterSessionsByQuery(state, sessionSearchQuery);
        if (!order.length) return;
        for (var i = 0; i < order.length; i++) {
            (function (sid) {
                var sess = state.sessions[sid];
                if (!sess) return;
                var tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'session-tab' + (state.activeSessionId === sid ? ' active' : '') + (sess.waiting ? '' : ' resolved');
                var dot = document.createElement('span');
                dot.className = 'tab-dot';
                var label = document.createElement('span');
                label.className = 'tab-label';
                label.textContent = PS.PanelState.tabTitle(sess);
                label.title = sess.summary || sid;
                var proj = PS.PanelState.tabProjectBadge(sess);
                if (proj) {
                    var badge = document.createElement('span');
                    badge.className = 'tab-project-badge';
                    badge.textContent = proj;
                    badge.title = sess.projectDirectory;
                    label.appendChild(badge);
                }
                var closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'tab-close';
                closeBtn.title = 'Close';
                closeBtn.textContent = '\u00d7';
                closeBtn.onclick = function (ev) {
                    ev.stopPropagation();
                    exec(state.closeSession(sid));
                };
                tab.appendChild(dot);
                tab.appendChild(label);
                tab.appendChild(closeBtn);
                tab.onclick = function () { exec(state.setActiveSession(sid)); };
                tab.oncontextmenu = function (ev) {
                    ev.preventDefault();
                    showTabContextMenu(ev, sid);
                };
                sessionTabsEl.appendChild(tab);
            })(order[i]);
        }
    }

    function renderMessages() {
        messagesEl.innerHTML = '';
        var active = state.getActiveSession();
        var messages = active ? active.messages : [];
        if (!messages.length) {
            emptyState.style.display = 'flex';
            messagesEl.appendChild(emptyState);
            return;
        }
        emptyState.style.display = 'none';

        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            var row = document.createElement('div');
            row.className = 'msg-row ' + msg.role;
            var el = document.createElement('div');
            el.className = 'message';

            if (msg.role === 'system') {
                el.innerHTML = msg.content.includes('<span') ? msg.content : PS.PanelState.md(msg.content);
            } else {
                var h = document.createElement('div'); h.className = 'header';
                var r = document.createElement('span'); r.className = 'role';
                r.textContent = msg.role === 'ai' ? '\uD83E\uDD16 AI' : '\uD83D\uDC64 You';
                h.appendChild(r);
                if (msg.pending_delivered) {
                    var badge = document.createElement('span');
                    badge.className = 'hint-badge';
                    badge.textContent = 'draft';
                    h.appendChild(badge);
                }
                if (msg.timestamp) {
                    var t = document.createElement('span');
                    t.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    h.appendChild(t);
                }
                el.appendChild(h);
                var c = document.createElement('div'); c.className = 'content';
                c.dataset.raw = msg.content || '';
                c.innerHTML = PS.PanelState.md(msg.content);
                if (msg.images && msg.images.length > 0) {
                    for (var k = 0; k < msg.images.length; k++) {
                        var img = document.createElement('img');
                        img.src = 'data:image/png;base64,' + msg.images[k];
                        img.title = 'Click to open';
                        c.appendChild(img);
                    }
                }
                el.appendChild(c);
            }
            row.appendChild(el);
            messagesEl.appendChild(row);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
        updateScrollBottomBtn();
    }

    function renderPending() {
        var pending = state.getPendingDisplay();
        var q = pending.comments || [];
        var imgs = pending.images || [];
        if (q.length === 0 && imgs.length === 0) {
            pendingSection.classList.remove('visible');
            syncInputTextareaToPane();
            return;
        }
        pendingSection.classList.add('visible');
        var total = PS.PanelState.pendingDisplayCount(pending);
        pendingCountEl.textContent = total;
        pendingList.innerHTML = '';
        for (var i = 0; i < q.length; i++) {
            (function (idx) {
                var item = document.createElement('div'); item.className = 'pending-item';
                var span = document.createElement('span'); span.className = 'text';
                span.textContent = q[idx];
                item.appendChild(span);
                var editBtn = document.createElement('button'); editBtn.textContent = '\u270E'; editBtn.title = 'Edit';
                editBtn.onclick = function () { exec(state.editPending(idx)); };
                item.appendChild(editBtn);
                var delBtn = document.createElement('button'); delBtn.textContent = '\u2715'; delBtn.title = 'Remove';
                delBtn.onclick = function () { exec(state.removePending(idx)); };
                item.appendChild(delBtn);
                pendingList.appendChild(item);
            })(i);
        }
        if (imgs.length > 0) {
            var item = document.createElement('div'); item.className = 'pending-item';
            var span = document.createElement('span'); span.className = 'text';
            span.textContent = '\uD83D\uDDBC ' + imgs.length + ' image' + (imgs.length > 1 ? 's' : '') + ' attached';
            span.style.opacity = '0.7';
            item.appendChild(span);
            var delBtn = document.createElement('button'); delBtn.textContent = '\u2715'; delBtn.title = 'Remove images';
            delBtn.onclick = function () { exec(state.clearPendingImages()); };
            item.appendChild(delBtn);
            pendingList.appendChild(item);
        }
        syncInputTextareaToPane();
    }

    function renderStagedImages() {
        var staged = state.getStagedImages();
        imagePreviews.innerHTML = '';
        for (var i = 0; i < staged.length; i++) {
            (function (idx) {
                var wrap = document.createElement('div'); wrap.className = 'img-preview';
                var img = document.createElement('img');
                img.src = 'data:image/png;base64,' + staged[idx];
                img.onclick = function () { lightboxImg.src = img.src; lightbox.classList.add('visible'); };
                img.style.cursor = 'zoom-in';
                wrap.appendChild(img);
                var rm = document.createElement('button'); rm.className = 'remove'; rm.textContent = '\u00D7';
                rm.onclick = function (e) { e.stopPropagation(); exec(state.unstageImage(idx)); };
                wrap.appendChild(rm);
                imagePreviews.appendChild(wrap);
            })(i);
        }
    }

    function updateSendButton() {
        var ui = state.getUIState();
        var staged = state.getStagedImages();
        var hasContent = inputEl.value.trim().length > 0 || staged.length > 0;
        if (ui.buttonMode === 'send') {
            sendBtn.disabled = !hasContent || ui.submitInFlight;
            sendBtn.textContent = ui.submitInFlight
                ? 'Sending...'
                : (ui.waitingCount > 1 ? 'Send (' + ui.waitingCount + ' waiting)' : 'Send');
            sendBtn.className = 'send-btn';
        } else if (ui.buttonMode === 'queue_lost') {
            sendBtn.disabled = !hasContent;
            sendBtn.textContent = 'Queue (link lost)';
            sendBtn.className = 'send-btn queue-mode queue-lost-mode';
        } else {
            sendBtn.disabled = !hasContent;
            sendBtn.textContent = 'Queue';
            sendBtn.className = 'send-btn queue-mode';
        }
    }

    // ── User Actions ────────────────────────────────────

    function smartSend() {
        var text = inputEl.value.trim();
        var staged = state.getStagedImages();
        if (!text && staged.length === 0) return;
        exec(state.smartSend(text, staged));
    }

    sendBtn.addEventListener('click', smartSend);

    var saveTimer = null;
    inputEl.addEventListener('input', function () {
        var active = state.getActiveSession();
        if (active) active.inputDraft = inputEl.value;
        inputEl.style.height = getInputTextareaMaxPx() + 'px';
        updateSendButton();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveState, 500);
    });

    clearPendingBtn.addEventListener('click', function () {
        exec(state.clearPending());
    });

    var finishedPendingConfirm = false;
    var finishedConfirmTimer = null;

    quickReplies.addEventListener('click', function (e) {
        var btn = e.target.closest('.quick-reply-btn');
        if (!btn) return;
        var text = btn.dataset.text;
        if (!text) return;
        if (PS.PanelState.resolveQuickReplyMode(e) === 'fill') {
            exec(state.fillInputFromQuickReply(text));
            return;
        }
        if (PS.PanelState.shouldConfirmFinished(text, state.confirmFinished !== false)) {
            var action = PS.PanelState.finishedClickAction(
                state.confirmFinished !== false,
                finishedPendingConfirm
            );
            if (action === 'confirm-first') {
                finishedPendingConfirm = true;
                showToast('Click Finished again to confirm and end session');
                clearTimeout(finishedConfirmTimer);
                finishedConfirmTimer = setTimeout(function () {
                    finishedPendingConfirm = false;
                }, 3000);
                return;
            }
            finishedPendingConfirm = false;
            clearTimeout(finishedConfirmTimer);
        }
        exec(state.smartSend(text, []));
    });

    if (scrollBottomBtn) {
        scrollBottomBtn.addEventListener('click', scrollMessagesToBottom);
    }
    if (messagesEl) {
        messagesEl.addEventListener('scroll', updateScrollBottomBtn);
    }
    inputEl.addEventListener('keydown', function (e) {
        if (PS.PanelState.shouldSubmitOnCtrlEnter(e, state.ctrlEnterSend !== false)) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    // ── Image Handling ──────────────────────────────────

    var clipboardBridgeHealthy = true;
    function extensionClipboardReady() {
        return transportReady() && clipboardBridgeHealthy;
    }

    function extractImagesFromClipboard(clipboardData) {
        return PS.PanelState.extractClipboardImages(clipboardData);
    }

    function addImage(base64) {
        exec(state.stageImage(base64));
        updateSendButton();
    }

    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result.split(',')[1]); };
            reader.onerror = function () { reject(reader.error || new Error('read failed')); };
            reader.readAsDataURL(file);
        });
    }

    function insertAtCursor(text) {
        if (!text) return;
        var start = inputEl.selectionStart || 0;
        var end = inputEl.selectionEnd || 0;
        var val = inputEl.value || '';
        inputEl.value = val.slice(0, start) + text + val.slice(end);
        var pos = start + text.length;
        inputEl.selectionStart = inputEl.selectionEnd = pos;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ── LRU path list (per-workspace, persisted in localStorage) ──────
    var PATH_LRU_MAX = 20;
    function pathLruKey() { return STORAGE_KEY + '-path-lru'; }
    function loadPathLru() {
        try {
            var raw = localStorage.getItem(pathLruKey());
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            debugLog('loadPathLru error: ' + (e && e.message ? e.message : String(e)));
            return [];
        }
    }
    function savePathLru(list) {
        try {
            localStorage.setItem(pathLruKey(), JSON.stringify(list));
            debugLog('savePathLru key=' + pathLruKey() + ' n=' + list.length);
        } catch (e) {
            debugLog('savePathLru error: ' + (e && e.message ? e.message : String(e)));
        }
    }
    function addPathsToLru(paths) {
        if (!paths || !paths.length) return;
        try {
            var before = loadPathLru();
            var list = PS.PanelState.addPathsToLru(before, paths, PATH_LRU_MAX);
            savePathLru(list);
            renderLruInline();
            debugLog('addPathsToLru in=' + JSON.stringify(paths) + ' before_n=' + before.length + ' after_n=' + list.length);
        } catch (e) {
            debugLog('addPathsToLru error: ' + (e && e.message ? e.message : String(e)));
        }
    }
    function removePathFromLru(p) {
        savePathLru(PS.PanelState.removeFromPathLru(loadPathLru(), p));
        renderLruInline();
    }
    function renderLruInline() {
        if (!lruPaths) return;
        var list = loadPathLru();
        lruPaths.innerHTML = '';
        list.forEach(function (p) {
            var chip = document.createElement('span');
            chip.className = 'lru-chip';
            chip.title = p;
            var icon = document.createElement('span');
            icon.className = 'lru-chip-icon';
            icon.textContent = p.charAt(p.length - 1) === '/' ? '\uD83D\uDCC1' : '\uD83D\uDCC4';
            var pathEl = document.createElement('span');
            pathEl.className = 'lru-chip-path';
            pathEl.textContent = p;
            var del = document.createElement('span');
            del.className = 'lru-chip-del';
            del.textContent = '\u00D7';
            del.title = 'Remove';
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                removePathFromLru(p);
            });
            chip.addEventListener('click', function () {
                insertAtCursor(p);
            });
            chip.appendChild(icon);
            chip.appendChild(pathEl);
            chip.appendChild(del);
            lruPaths.appendChild(chip);
        });
    }

    function getCopyPlainFromSelection() {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) return '';
        var selected = sel.toString();
        if (!selected) return '';
        var node = sel.anchorNode;
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        var msgEl = el && el.closest ? el.closest('.message') : null;
        if (!msgEl) return '';
        var contentEl = msgEl.querySelector('.content');
        if (!contentEl) return selected;
        var raw = contentEl.dataset.raw || '';
        return PS.PanelState.selectionCopyText(selected, raw, (contentEl.textContent || '').length);
    }

    function writeClipboardText(text) {
        if (!text) return;
        if (extensionClipboardReady()) {
            window.__mcpPendingCopyText = text;
            transportSend({ type: 'clipboard_write', text: text });
            return;
        }
        if (vscode) {
            vscode.postMessage({ type: 'clipboard-write', text: text });
            showToast('Copied');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                showToast('Copied');
            }).catch(function (err) {
                console.warn('mcp-feedback clipboard write failed:', err && err.message ? err.message : err);
            });
        }
    }

    var pasteRequestId = 0;
    function requestClipboardPaste() {
        if (transportReady()) {
            var rid = 'paste-' + (++pasteRequestId);
            window.__mcpPendingPasteId = rid;
            window.__mcpWsPastePending = true;
            window.__mcpWsPasteAt = Date.now();
            transportSend({ type: 'clipboard_paste', request_id: rid });
            setTimeout(function () {
                if (window.__mcpPendingPasteId === rid) {
                    window.__mcpPendingPasteId = null;
                    window.__mcpWsPastePending = false;
                    clipboardBridgeHealthy = false;
                    debugLog('requestClipboardPaste: bridge timeout rid=' + rid + ' — fallback to native paste');
                }
            }, 3000);
            return;
        }
        if (!vscode) return;
        var rid2 = 'paste-' + (++pasteRequestId);
        window.__mcpPendingPasteId = rid2;
        vscode.postMessage({ type: 'clipboard-paste', requestId: rid2 });
    }

    function showToast(msg) {
        var el = document.getElementById('clipboardToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'clipboardToast';
            el.className = 'clipboard-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('visible');
        clearTimeout(window.__mcpToastTimer);
        window.__mcpToastTimer = setTimeout(function () { el.classList.remove('visible'); }, 1200);
    }

    function beginUserPing() {
        if (!transportReady()) {
            console.warn('[mcp-ping] transport not ready');
            showToast('Disconnected');
            return;
        }
        userPingPending = true;
        clearTimeout(userPingTimer);
        userPingTimer = setTimeout(function () {
            if (!userPingPending) return;
            userPingPending = false;
            console.warn('[mcp-ping] timeout waiting for pong');
            showToast('ping timeout');
        }, 3000);
        console.log('[mcp-ping] sent');
        debugLog('ping sent');
    }

    function finishUserPing(body) {
        if (!userPingPending) return;
        userPingPending = false;
        clearTimeout(userPingTimer);
        userPingTimer = null;
        var reply = body || PS.PanelState.PONG_REPLY || 'pong';
        console.log('[mcp-ping] ' + reply);
        debugLog('pong received');
        showToast(reply);
    }

    inputEl.addEventListener('mousedown', function () {
        inputEl.focus();
    });

    document.addEventListener('keydown', function (e) {
        if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
        if (e.key !== 'c') return;
        if (document.activeElement === inputEl) return;
        var plain = getCopyPlainFromSelection();
        if (plain) {
            e.preventDefault();
            e.stopImmediatePropagation();
            writeClipboardText(plain);
        }
    }, true);

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result.split(',')[1]); };
            reader.onerror = function () { reject(reader.error || new Error('read failed')); };
            reader.readAsDataURL(blob);
        });
    }

    function pasteImageSource(img) {
        var p = img instanceof Blob ? blobToBase64(img) : fileToBase64(img);
        return p.then(addImage).catch(function (err) {
            console.warn('mcp-feedback paste image failed:', err && err.message ? err.message : err);
        });
    }

    async function readImagesFromNavigatorClipboard() {
        if (!navigator.clipboard || !navigator.clipboard.read) return [];
        try {
            var items = await navigator.clipboard.read();
            var blobs = [];
            for (var i = 0; i < items.length; i++) {
                for (var j = 0; j < items[i].types.length; j++) {
                    var type = items[i].types[j];
                    if (type.indexOf('image/') === 0) {
                        blobs.push(await items[i].getType(type));
                    }
                }
            }
            return blobs;
        } catch (err) {
            console.warn('mcp-feedback navigator.clipboard.read failed:', err && err.message ? err.message : err);
            return [];
        }
    }

    async function handleInputPaste(e) {
        if (document.activeElement !== inputEl && e.target !== inputEl) return;
        if (PS.PanelState.shouldBlockDuplicatePaste(window.__mcpWsPastePending, window.__mcpWsPasteAt, Date.now())) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }

        var images = extractImagesFromClipboard(e.clipboardData);
        if (!images.length) {
            images = await readImagesFromNavigatorClipboard();
        }
        if (images.length) {
            e.preventDefault();
            e.stopImmediatePropagation();
            for (var pi = 0; pi < images.length; pi++) {
                await pasteImageSource(images[pi]);
            }
            showToast('Pasted');
            return;
        }

        if (extensionClipboardReady()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }

        var text = e.clipboardData && e.clipboardData.getData('text/plain');
        if (text) {
            e.preventDefault();
            e.stopImmediatePropagation();
            insertAtCursor(text);
        }
    }

    inputEl.addEventListener('paste', function (e) {
        handleInputPaste(e).catch(function (err) {
            console.warn('mcp-feedback handleInputPaste failed:', err && err.message ? err.message : err);
        });
    }, true);

    function logDropEvent(stage, e) {
        var dt = e.dataTransfer;
        var types = dt ? dt.types : [];
        var files = dt && dt.files ? dt.files.length : 0;
        var tgt = e.target && e.target.tagName ? e.target.tagName : '?';
        // Sample data from each type for diagnostics
        var samples = {};
        if (dt) {
            for (var i = 0; i < types.length; i++) {
                try { samples[types[i]] = (dt.getData(types[i]) || '').slice(0, 200); } catch (err) {}
            }
        }
        debugLog('drag ' + stage + ' target=' + tgt
            + ' types=' + JSON.stringify(types) + ' files=' + files
            + ' samples=' + JSON.stringify(samples));
    }

    var dropProcessed = false;
    function processFileDrop(e) {
        if (dropProcessed) return;
        dropProcessed = true;
        setTimeout(function () { dropProcessed = false; }, 500);
        var dt = e.dataTransfer;
        if (!dt) { debugLog('drop no_dataTransfer'); return; }
        var paths = [];
        var types = dt.types || [];
        debugLog('drop process types=' + JSON.stringify(types)
            + ' files=' + (dt.files ? dt.files.length : 0));

        // 1. Try text/uri-list (VSCode explorer drag)
        var uriList = '';
        try { uriList = dt.getData('text/uri-list') || ''; } catch (err) {}
        // 1b. Fallback: some VSCode versions put file:// URIs in text/plain
        if (!uriList) {
            try { uriList = dt.getData('text/plain') || ''; } catch (err) {}
            if (uriList && uriList.indexOf('file://') === -1) uriList = '';
        }
        if (uriList) {
            var uris = uriList.split('\n');
            for (var i = 0; i < uris.length; i++) {
                var u = uris[i].trim();
                if (!u || u.charAt(0) === '#') continue;
                var fp = PS.PanelState.pathFromFileUri(u);
                if (fp) {
                    var rel = PS.PanelState.relativeFilePath(fp, PROJECT_PATH);
                    if (rel) paths.push(rel);
                }
            }
        }

        // 2. Process File objects (OS file manager drag)
        var files = dt.files;
        var imagePromises = [];
        for (var j = 0; j < files.length; j++) {
            var f = files[j];
            if (f.type.startsWith('image/')) {
                imagePromises.push(fileToBase64(f).then(addImage));
            } else {
                var fpath = f.path || '';
                if (!fpath && f.name) fpath = f.name;
                if (fpath) {
                    var rel2 = PS.PanelState.relativeFilePath(fpath, PROJECT_PATH);
                    if (rel2) paths.push(rel2);
                }
            }
        }

        if (paths.length) insertAtCursor(paths.join('\n'));
        debugLog('drop result paths=' + JSON.stringify(paths) + ' images=' + imagePromises.length);
        hideDragOverlay();
    }

    // ── Drag overlay: visual feedback so the user can see if the webview
    //    receives DnD events at all, even before checking logs.
    var dragOverlay = null;
    var dragDepth = 0;
    function showDragOverlay() {
        if (!dragOverlay) {
            dragOverlay = document.createElement('div');
            dragOverlay.id = 'dragOverlay';
            dragOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;'
                + 'background:rgba(124,58,237,0.15);border:3px dashed #7c3aed;'
                + 'display:flex;align-items:center;justify-content:center;'
                + 'font-size:18px;color:#7c3aed;pointer-events:none;'
                + 'font-family:monospace;';
            dragOverlay.textContent = 'Drop files/folders here';
            document.body.appendChild(dragOverlay);
        }
        dragOverlay.style.display = 'flex';
    }
    function hideDragOverlay() {
        if (dragOverlay) dragOverlay.style.display = 'none';
    }

    // Instrument ALL drag events on both window and document (capture phase).
    // window capture fires before document capture — if the webview host
    // blocks events, neither fires and the logs confirm it.
    function bindDragLogger(target, label) {
        target.addEventListener('dragenter', function (e) {
            debugLog('dragenter@' + label);
            logDropEvent('enter@' + label, e);
            dragDepth++;
            showDragOverlay();
        }, true);
        target.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }, true);
        target.addEventListener('dragleave', function (e) {
            debugLog('dragleave@' + label);
            dragDepth--;
            if (dragDepth <= 0) { dragDepth = 0; hideDragOverlay(); }
        }, true);
        target.addEventListener('drop', function (e) {
            debugLog('drop@' + label);
            logDropEvent('drop@' + label, e);
            e.preventDefault();
            e.stopPropagation();
            processFileDrop(e);
        }, true);
    }
    bindDragLogger(window, 'win');
    bindDragLogger(document, 'doc');

    document.addEventListener('copy', function (e) {
        var plain = getCopyPlainFromSelection();
        if (!plain) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        writeClipboardText(plain);
    }, true);

    attachBtn.addEventListener('click', function () { fileInput.click(); });

    if (browseBtn) {
        browseBtn.addEventListener('click', function () {
            if (vscode) {
                vscode.postMessage({ type: 'browse-paths', canSelectFiles: true, canSelectFolders: true });
            }
        });
    }

    renderLruInline();

    window.addEventListener('message', function (event) {
        var msg = event && event.data;
        if (!msg || msg.type !== 'browse-paths-result') return;
        var paths = Array.isArray(msg.paths) ? msg.paths : [];
        if (paths.length) {
            addPathsToLru(paths);
            insertAtCursor(paths.join('\n'));
        }
        debugLog('browse-paths-result paths=' + JSON.stringify(paths));
    });

    fileInput.addEventListener('change', async function () {
        for (var i = 0; i < fileInput.files.length; i++) {
            if (fileInput.files[i].type.startsWith('image/')) {
                addImage(await fileToBase64(fileInput.files[i]));
            }
        }
        fileInput.value = '';
    });

    // ── Lightbox ────────────────────────────────────────

    lightbox.addEventListener('click', function () { lightbox.classList.remove('visible'); });
    document.addEventListener('click', function (e) {
        hideTabContextMenu();
        if (e.target.tagName === 'IMG' && e.target.closest('.message .content')) {
            lightboxImg.src = e.target.src;
            lightbox.classList.add('visible');
        }
    });

    // ── Settings ────────────────────────────────────────

    settingsBtn.addEventListener('click', function () {
        settingsPanel.classList.toggle('visible');
        closeDebugPanel();
    });
    if (debugBtn) {
        debugBtn.addEventListener('click', function () {
            if (debugPanel.classList.contains('visible')) closeDebugPanel();
            else openDebugPanel();
        });
    }
    if (debugCloseBtn) debugCloseBtn.addEventListener('click', closeDebugPanel);
    if (debugReconnectBtn) debugReconnectBtn.addEventListener('click', function () {
        debugLog('debug panel reconnect');
        forceReconnect();
        renderDebugPanel();
    });
    if (debugDevToolsBtn) debugDevToolsBtn.addEventListener('click', function () {
        debugLog('open-webview-devtools');
        if (vscode) vscode.postMessage({ type: 'open-webview-devtools' });
    });
    if (debugCopyBtn) debugCopyBtn.addEventListener('click', function () {
        var text = getFullDebugJson();
        if (vscode) {
            vscode.postMessage({ type: 'copy-debug-json', json: text });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        }
    });
    function bindLogOpenBtn(id, target) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', function () {
            debugLog('open-log ' + target);
            if (vscode) vscode.postMessage({ type: 'open-log', target: target });
        });
    }
    bindLogOpenBtn('debugLogExtBtn', 'extension');
    bindLogOpenBtn('debugLogMcpBtn', 'mcp-server');
    bindLogOpenBtn('debugLogPanelBtn', 'webview');
    var debugTruncatePanelLogBtn = document.getElementById('debugTruncatePanelLogBtn');
    if (debugTruncatePanelLogBtn) {
        debugTruncatePanelLogBtn.addEventListener('click', function () {
            debugLog('truncate-log webview');
            if (vscode) vscode.postMessage({ type: 'truncate-log', target: 'webview' });
        });
    }
    var debugMcpOutputBtn = document.getElementById('debugMcpOutputBtn');
    if (debugMcpOutputBtn) {
        debugMcpOutputBtn.addEventListener('click', function () {
            if (vscode) vscode.postMessage({ type: 'open-mcp-output' });
        });
    }
    var debugPruneTestBtn = document.getElementById('debugPruneTestBtn');
    if (debugPruneTestBtn) {
        debugPruneTestBtn.addEventListener('click', function () {
            vscode.postMessage({ type: 'prune-test-registry' });
        });
    }
    var debugExportMdBtn = document.getElementById('debugExportMdBtn');
    if (debugExportMdBtn) {
        debugExportMdBtn.addEventListener('click', function () {
            var md = PS.PanelState.sessionsToMarkdown(state);
            vscode.postMessage({ type: 'copy-debug-json', json: md });
        });
    }
    var debugCopyDiagnoseBtn = document.getElementById('debugCopyDiagnoseBtn');
    if (debugCopyDiagnoseBtn) {
        debugCopyDiagnoseBtn.addEventListener('click', function () {
            var bundle = (lastExtensionDebugReport && lastExtensionDebugReport.diagnoseBundle)
                || JSON.stringify({ extension: lastExtensionDebugReport, panel: collectPanelDebugState() }, null, 2);
            vscode.postMessage({ type: 'copy-debug-json', json: bundle });
        });
    }
    var debugExportBtn = document.getElementById('debugExportBtn');
    if (debugExportBtn) {
        debugExportBtn.addEventListener('click', function () {
            if (!vscode) return;
            vscode.postMessage({
                type: 'export-sessions',
                data: PS.PanelState.exportAgentContinuationJson(state),
            });
        });
    }
    if (sessionSearchInput) {
        sessionSearchInput.addEventListener('input', function () {
            sessionSearchQuery = sessionSearchInput.value || '';
            renderTabs();
        });
    }
    autoReplyCheck.addEventListener('change', function () {
        exec(state.setAutoReply(autoReplyCheck.checked, autoReplyText.value));
    });
    autoReplyText.addEventListener('input', function () {
        exec(state.setAutoReply(autoReplyCheck.checked, autoReplyText.value));
    });
    if (ctrlEnterCheck) {
        ctrlEnterCheck.addEventListener('change', function () {
            exec(state.setUxPrefs({ ctrlEnterSend: ctrlEnterCheck.checked }));
        });
    }
    if (confirmFinishedCheck) {
        confirmFinishedCheck.addEventListener('change', function () {
            exec(state.setUxPrefs({ confirmFinished: confirmFinishedCheck.checked }));
        });
    }
    if (inputPaneHeightInput) {
        inputPaneHeightInput.addEventListener('change', function () {
            applyInputPaneHeight(Number(inputPaneHeightInput.value));
            saveState();
        });
    }
    if (quickRepliesConfig) {
        quickRepliesConfig.addEventListener('change', function () {
            var parsed = PS.PanelState.parseQuickRepliesConfig(quickRepliesConfig.value);
            if (!parsed) return;
            state.quickReplies = parsed;
            renderQuickReplies();
            saveState();
        });
    }

    // ── @ Reference Autocomplete ────────────────────────

    var atSearchTimer = null;
    var atActiveIndex = -1;
    var atItems = [];
    var atVisible = false;

    function getAtQuery() {
        return PS.PanelState.getAtQuery(inputEl.value, inputEl.selectionStart);
    }

    function triggerAtSearch() {
        var result = getAtQuery();
        if (!result || result.query.length === 0) { hideAtDropdown(); return; }
        if (vscode) vscode.postMessage({ type: 'at-search', query: result.query });
    }

    function showAtDropdown(items) {
        atItems = items;
        atActiveIndex = -1;
        if (!items || items.length === 0) { hideAtDropdown(); return; }
        atDropdown.innerHTML = '';
        items.forEach(function (item, i) {
            var row = document.createElement('div');
            row.className = 'at-dropdown-item';
            row.dataset.index = i;
            var icon = document.createElement('span');
            icon.className = 'kind-icon';
            icon.textContent = item.kind === 'file' ? '\uD83D\uDCC4' : (item.kind === 'folder' ? '\uD83D\uDCC1' : '\uD83D\uDD23');
            var label = document.createElement('span');
            label.className = 'at-label';
            label.textContent = item.label;
            var detail = document.createElement('span');
            detail.className = 'at-detail';
            detail.textContent = item.detail;
            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(detail);
            row.addEventListener('click', function () { selectAtItem(i); });
            atDropdown.appendChild(row);
        });
        atDropdown.classList.add('visible');
        atVisible = true;
    }

    function hideAtDropdown() {
        atDropdown.classList.remove('visible');
        atVisible = false;
        atItems = [];
        atActiveIndex = -1;
    }

    function setAtActive(index) {
        var items = atDropdown.querySelectorAll('.at-dropdown-item');
        items.forEach(function (el) { el.classList.remove('active'); });
        if (index >= 0 && index < items.length) {
            atActiveIndex = index;
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    function selectAtItem(index) {
        var item = atItems[index];
        if (!item) return;
        var result = getAtQuery();
        if (!result) { hideAtDropdown(); return; }
        var before = inputEl.value.substring(0, result.start);
        var after = inputEl.value.substring(inputEl.selectionStart);
        var insert = '@' + item.insertText + ' ';
        inputEl.value = before + insert + after;
        var newPos = before.length + insert.length;
        inputEl.selectionStart = inputEl.selectionEnd = newPos;
        inputEl.focus();
        hideAtDropdown();
        if (item.kind === 'file' || item.kind === 'folder') {
            addPathsToLru([item.insertText]);
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveState, 500);
    }

    inputEl.addEventListener('input', function () {
        clearTimeout(atSearchTimer);
        var result = getAtQuery();
        if (result && result.query.length > 0) {
            atSearchTimer = setTimeout(triggerAtSearch, 150);
        } else {
            hideAtDropdown();
        }
    });

    inputEl.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'v' && extensionClipboardReady()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            requestClipboardPaste();
            return;
        }
        if (atVisible) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAtActive(atActiveIndex < atItems.length - 1 ? atActiveIndex + 1 : 0);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAtActive(atActiveIndex > 0 ? atActiveIndex - 1 : atItems.length - 1);
                return;
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && atActiveIndex >= 0) {
                e.preventDefault();
                selectAtItem(atActiveIndex);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                hideAtDropdown();
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            smartSend();
        }
    });

    // ── Transport (bridge primary, WebSocket fallback) ───

    function handleProtocolMessage(msg) {
        if (!msg || !msg.type) return;
        lastHubActivityAt = Date.now();
        if (msg.type === 'pong') {
            lastPongAt = lastHubActivityAt;
            if (msg.hub) applyHubSnapshot(msg.hub);
            finishUserPing(msg.body);
            exec(state.handleMessage(msg));
            renderConnectionHealth();
            return;
        }
        if (msg.type === 'connection_established') {
            if (useBridge) {
                if (bridgeGate.shouldInitFromConnectionEstablished()) onBridgeConnected(msg);
                return;
            }
            applyConnectionInfo(msg);
            if (msg.version) {
                var vl = document.getElementById('versionLabel');
                if (vl) vl.textContent = 'v' + msg.version;
            }
            requestStateSync();
            return;
        }
        exec(state.handleMessage(msg));
        if (msg.type === 'state_sync') {
            var hubPid = msg.hub && msg.hub.pid;
            if (hubPid && connectedHubPid && hubPid !== connectedHubPid) {
                debugLog('hub_pid_changed old=' + connectedHubPid + ' new=' + hubPid + ' re-hydrate');
                bootHydratedFromServer = false;
            }
            tryHydrateAfterStateSync();
            if (msg.hub) applyHubSnapshot(msg.hub);
            renderConnectionHealth();
        }
        if (msg.type === 'session_updated') {
            clearAgentResumeWatch();
            debugLog('session_updated received session=' + (msg.session_id || '(legacy)')
                + ' project=' + (msg.project_directory || '(none)'));
            if (msg.session_id && transportReady()) {
                transportSend({ type: 'session_displayed', session_id: msg.session_id });
                debugLog('session_displayed send session=' + msg.session_id);
            }
        }
        if (msg.type === 'feedback_submitted') {
            debugLog('event=feedback_submitted_received session=' + (msg.session_id || '(none)')
                + ' feedback_len=' + ((msg.feedback && msg.feedback.length) || 0)
                + ' waiting_cleared=true');
            startAgentResumeWatch(msg.session_id);
        }
        if (msg.type === 'feedback_undelivered') {
            debugLog('event=feedback_undelivered_received session=' + (msg.session_id || '(none)')
                + ' feedback_len=' + ((msg.feedback && msg.feedback.length) || 0)
                + ' detail=' + (msg.detail || '-'));
        }
        if (msg.type === 'agent_turn_status') {
            debugLog('event=agent_turn_status_received session=' + (msg.session_id || '(none)')
                + ' reason=' + (msg.reason || '-') + ' detail=' + (msg.detail || '-'));
        }
        if (msg.type === 'clipboard_write_ok') {
            window.__mcpPendingCopyText = null;
            showToast('Copied');
        } else if (msg.type === 'clipboard_write_err') {
            var pendingCopy = window.__mcpPendingCopyText || '';
            window.__mcpPendingCopyText = null;
            console.warn('mcp-feedback clipboard-write err:', msg.error || 'unknown');
            if (pendingCopy && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pendingCopy).then(function () {
                    showToast('Copied');
                }).catch(function () {
                    showToast('Copy failed');
                });
            } else {
                showToast('Copy failed');
            }
        } else if (msg.type === 'clipboard_paste_result' && msg.request_id === window.__mcpPendingPasteId) {
            window.__mcpPendingPasteId = null;
            window.__mcpWsPastePending = false;
            window.__mcpWsPasteAt = 0;
            if (!clipboardBridgeHealthy) debugLog('clipboard_paste_result: bridge recovered rid=' + msg.request_id);
            clipboardBridgeHealthy = true;
            if (msg.image) {
                addImage(msg.image);
                showToast('Pasted');
            } else if (msg.text) {
                insertAtCursor(msg.text);
                showToast('Pasted');
            } else {
                readImagesFromNavigatorClipboard().then(function (blobs) {
                    if (!blobs.length) {
                        console.warn('mcp-feedback clipboard-paste: no image or text');
                        return;
                    }
                    return Promise.all(blobs.map(pasteImageSource)).then(function () {
                        showToast('Pasted');
                    });
                }).catch(function (err) {
                    console.warn('mcp-feedback clipboard-paste fallback failed:', err && err.message ? err.message : err);
                });
            }
        }
    }

    function updateConnectionLabels(msg) {
        if (!msg) return;
        if (msg.version) {
            var vl = document.getElementById('versionLabel');
            if (vl) {
                vl.textContent = (msg.memoryVersion && msg.memoryVersion !== msg.version)
                    ? ('v' + msg.version + ' (mem ' + msg.memoryVersion + ')')
                    : ('v' + msg.version);
            }
        }
        applyDeployLabel(msg);
        showDeployReloadBanner(msg);
        applyQuickRepliesFromHost(msg);
        if (msg.port) {
            connectedHubPid = msg.pid || connectedHubPid;
            wsUrl = PS.PanelState.resolveWsUrl(wsUrl, msg.port);
            wsPortEl.textContent = ':' + msg.port;
            var label = 'Connected :' + msg.port;
            if (msg.pid) label += ' pid=' + msg.pid;
            setWsStatus('connected', label);
        }
    }

    function onBridgeConnected(msg) {
        var snap = bridgeGate.snapshot();
        if (!snap.initialized) {
            debugLog('onBridgeConnected port=' + (msg && msg.port) + ' v=' + (msg && msg.version)
                + ' init=' + snap.initialized);
        }
        var action = bridgeGate.onBridgeConnected();
        window.__mcpBootstrapped = true;
        reconnectAttempts = 0;
        if (!clipboardBridgeHealthy) debugLog('onBridgeConnected: clipboard bridge restored');
        clipboardBridgeHealthy = true;
        if (action.labels) updateConnectionLabels(msg);
        if (!action.register && !action.stateSync) {
            vscode.postMessage({ type: 'bridge-ack' });
            return;
        }
        if (action.register) {
            transportSend({ type: 'register', clientType: 'webview' });
        }
        flushOutboundQueue();
        if (action.stateSync) requestStateSync();
        vscode.postMessage({ type: 'bridge-ack' });
        if (msg && msg.versionWarnings && msg.versionWarnings.length) {
            lastExtensionDebugReport = lastExtensionDebugReport || {};
            lastExtensionDebugReport.versionSkew = msg.versionWarnings;
            showVersionSkewBanner(msg.versionWarnings);
        }
        renderConnectionHealth();
    }

    function requestStateSync() {
        debugLog('requestStateSync');
        exec(state.handleMessage({ type: 'connection_established' }));
    }

    function connect() {
        if (useBridge) {
            if (bridgeGate.isReady()) return;
            debugLog('connect hub-connect');
            setWsStatus('connecting');
            vscode.postMessage({ type: 'hub-connect' });
            return;
        }
        if (ws && ws.readyState === WebSocket.OPEN) return;
        if (!PS.PanelState.isValidWsUrl(wsUrl)) {
            setWsStatus('connecting', 'Waiting for server port...');
            return;
        }
        setWsStatus('connecting');
        try {
            ws = new WebSocket(wsUrl);
            ws.onopen = function () {
                reconnectAttempts = 0;
                var port = getWsPort();
                setWsStatus('connected', port ? 'Connected :' + port : 'Connected');
                transportSend({ type: 'register', clientType: 'webview' });
                flushOutboundQueue();
            };
            ws.onmessage = function (e) {
                try {
                    handleProtocolMessage(JSON.parse(e.data));
                } catch (err) { console.error(err); }
            };
            ws.onclose = function () {
                bridgeGate.resetForReconnect();
                setWsStatus('disconnected');
                scheduleReconnect();
            };
            ws.onerror = function () {
                console.warn('mcp-feedback ws error url=' + wsUrl);
                setWsStatus('disconnected');
            };
        } catch (err) {
            console.warn('mcp-feedback ws connect failed url=' + wsUrl, err);
            setWsStatus('disconnected');
            scheduleReconnect();
        }
    }

    var _reconnectTimerId = null;
    function scheduleReconnect() {
        if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
        if (useBridge) {
            _reconnectTimerId = setTimeout(function () { _reconnectTimerId = null; connect(); }, 1000);
            return;
        }
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        setWsStatus('connecting', 'Retry #' + reconnectAttempts + ' (' + (delay / 1000).toFixed(0) + 's)');
        _reconnectTimerId = setTimeout(function () { _reconnectTimerId = null; connect(); }, delay);
    }

    function applyServerInfo(msg) {
        if (!msg || !msg.port) return;
        if (useBridge) {
            updateConnectionLabels(msg);
            if (bridgeGate.shouldInitFromServerInfo()) onBridgeConnected(msg);
            return;
        }
        if (msg.version) {
            var vl = document.getElementById('versionLabel');
            if (vl) vl.textContent = 'v' + msg.version;
        }
        var synced = PS.PanelState.resolveWsUrl(wsUrl, msg.port);
        wsUrl = synced;
        window.__mcpBootstrapped = true;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connect();
        }
    }

    function bootstrapConnection() {
        connect();
    }

    // ── Extension Messages ──────────────────────────────

    window.addEventListener('message', function (event) {
        var msg = event.data;
        if (msg.type === 'reconnect' || msg.type === 'hub-connect') {
            forceReconnect();
        } else if (msg.type === 'please-reconnect') {
            debugLog('please-reconnect from extension');
            forceReconnect();
        } else if (msg.type === 'prune-test-registry-result') {
            var pr = msg.result || {};
            debugLog('prune-test-registry removed=' + (pr.removed || []).join(','));
            if (pr.skippedAlive && pr.skippedAlive.length) {
                debugLog('prune skipped alive test pids: ' + pr.skippedAlive.map(function (x) { return x.pid; }).join(','));
            }
            renderDebugPanel();
            renderConnectionHealth();
        } else if (msg.type === 'debug-report') {
            lastExtensionDebugReport = msg.report || null;
            debugLog('debug-report received');
            renderDebugPanel();
            renderConnectionHealth();
        } else if (msg.type === 'bridge-connected') {
            onBridgeConnected(msg);
        } else if (msg.type === 'hub-message') {
            handleProtocolMessage(msg.data);
        } else if (msg.type === 'server-info') {
            applyServerInfo(msg);
        } else if (msg.type === 'focus-input') {
            inputEl.focus();
        } else if (msg.type === 'clipboard-paste-result') {
            if (msg.requestId === window.__mcpPendingPasteId) {
                window.__mcpPendingPasteId = null;
                if (msg.image) addImage(msg.image);
                else if (msg.text) insertAtCursor(msg.text);
            }
        } else if (msg.type === 'at-results') {
            showAtDropdown(msg.items || []);
        }
    });

    var pendingHost = window.__mcpPendingHostMessages;
    if (pendingHost && pendingHost.length) {
        debugLog('drain pending host messages n=' + pendingHost.length);
        for (var pi = 0; pi < pendingHost.length; pi++) {
            var pending = pendingHost[pi];
            if (pending.type === 'bridge-connected') onBridgeConnected(pending);
            else if (pending.type === 'server-info') applyServerInfo(pending);
            else if (pending.type === 'please-reconnect') forceReconnect();
        }
        window.__mcpPendingHostMessages = [];
    }

    // ── Heartbeat ───────────────────────────────────────

    var _heartbeatId = setInterval(function () {
        if (transportReady()) {
            transportSend({ type: 'ping' });
        }
        renderConnectionHealth();
    }, 30000);

    window.addEventListener('pagehide', function () {
        clearInterval(_heartbeatId);
        if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
    });

    // ── Init ────────────────────────────────────────────

    if (window.McpThemeContrast) { window.McpThemeContrast.applyMcpTheme(); }
    bootstrapErudaPanel();
    try {
        pendingLocalRestore = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    var storedPaneH = null;
    try { storedPaneH = localStorage.getItem('mcp-feedback-input-pane-height'); } catch (_e) { /* ignore */ }
    applyInputPaneHeight(storedPaneH || state.inputPaneHeight || 220);
    setupPaneSplitter();
    renderQuickReplies();
    syncSettings();
    renderConnectionHealth();
    if (!vscode) {
        bootstrapConnection();
    }
})();
