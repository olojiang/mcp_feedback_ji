# Changelog

All notable changes to this project will be documented in this file.

## [2.5.1-ji.57] - 2026-07-03

### Added
- **Quick replies**: `Test Verify` button; `LGTM` renamed to **Looks Good**; Settings textarea to customize `label|text` lines.
- **Draggable split bar** between messages and input pane (persisted to localStorage; double-click reset).
- **Shift+click** quick reply fills input; **Ctrl+Enter** send; **Finished** confirm dialog.
- **Scroll to bottom** floating button when messages scrolled up.
- **Version skew banner** when DBG registry reports other windows on old builds.
- **DBG Session traceId map** for open sessions.
- E2E: `quick-ux.spec.cjs`; tests: `panelUx.test.js`.

## [2.5.1-ji.56] - 2026-07-03

### Added
- **trace_id 回程**: `feedbackResponse` 日志带 `trace=`；`session_displayed` ack 带 trace。
- **Tests (TDD)**: `traceResponse`, `clipboardImage`, `wsHub.handlers.integration`, provider 错误分支, E2E `trace-session.spec.cjs`。
- **CI**: `npm run test:coverage` with c8 thresholds (80/80/70/75).

### Changed
- `.gitignore` 忽略 `coverage/`、`test-results/`；`readme.md` 版本同步。

## [2.5.1-ji.54] - 2026-07-03

### Added
- **`trace_id` end-to-end**: MCP `feedback_request` → hub `session_updated` → panel session `traceId`; log lines include `trace=`.
- **`src/traceContext.ts`**: `resolveTraceId`, `traceLogSuffix`.
- **Tests**: `traceContext`, `tracePipeline.integration`, `toolHandlers.integration`, `feedbackViewProvider.messages` (table-driven).
- **GitHub Actions CI** (`.github/workflows/ci.yml`): `npm test` + Playwright E2E.

### Changed
- **`toolHandlers`**: injectable `readAgentContext`; passes trace into `requestFeedback`.
- **`FeedbackManager.pendingSessions`**: omits `traceId` when unset.

## [2.5.1-ji.53] - 2026-07-03

### Added
- Cross-window registry, agent-context viewer, MCP Output/Export, tab project badge, routing banner, session search, feedback chime, deploy reload prompt.

## [2.5.1-ji.52] - 2026-07-03

### Added
- **Cross-window registry** in DBG panel (all `servers/*.json` with port/pid/version).
- **agent-context.json** viewer in DBG; **MCP Output** + **Export** session JSON buttons.
- **Tab project badge**; **routing mismatch** banner; **session search** in Settings.
- **Feedback chime** + waiting count badge on new `session_updated`.
- **Reload prompt** when package version on disk changes between activations; `deploy-stamp.json` on deploy.

## [2.5.1-ji.50] - 2026-07-03

### Added
- **Debug panel log shortcuts**: Ext log / MCP log / Panel log buttons open `extension.log`, `mcp-server.log`, `webview.log` in editor.
- **`logPaths.ts`**: shared log path resolver + `formatAgentLinkStatus`.

### Changed
- Status bar **`MCP:0`** → **`Agent: idle`** when no active call (normal); **`Agent: offline`** only when pending feedback exists.
- Unified **`.mcp-toolbar-btn`** (24px height) for DBG, settings, reconnect, debug actions, Close resolved.

## [2.5.1-ji.49] - 2026-07-03

### Added
- **`fullPipelineChain.integration.test.js`**: end-to-end MCP wire → hub → panel → MCP with `project_directory` and multi-session matching.
- **`pipelineCoverageMatrix.test.js`**: asserts every `PipelineHop` has dedicated test files.

### Removed
- Unused `panelBootstrapAction` (duplicate of `BridgeSessionGate` in panelState).

## [2.5.1-ji.48] - 2026-07-03

### Added
- **`activateSyncPolicy`**: single 800ms deferred `syncWebview` schedule (testable).
- **Panel `forceReconnect` debounce** (1200ms) to absorb duplicate `please-reconnect`.
- **Tests**: `panelTiming`, `timingE2E.integration`, `feedbackViewProvider` sync timing, Playwright `e2e/panel-timing.spec.cjs`.
- **Workspace isolation** (`project_directory`), pipeline contracts, connection health, 167 unit tests.

### Changed
- Extension panel-focus delays extracted to `EXTENSION_PANEL_FOCUS_DELAYS_MS`.
- `syncServer` soft path pushes `server-info` when bridge already active (no reconnect storm).

## [2.5.1-ji.30] - 2026-07-02

### Added
- **Subfolder workspace routing**: MCP server discovery matches parent/child workspace paths (e.g. workspace root `llm-gateway` + agent `project_directory` `llm-gateway/provider_mock`).
- **New session tab per live MCP call**: `updateTransport` only reuses a pending session when the previous MCP WebSocket is closed (reconnect). Concurrent calls each get a new panel tab.
- **`pickServerForImplicitProject`**: When `project_directory` is omitted, infer target Extension from MCP process cwd if it falls inside a registered workspace.
- **Ambiguous routing log**: `feedback_request candidates=none reason=ambiguous_no_project` when multiple Extensions exist and cwd cannot disambiguate.

### Changed
- **README**: Synced to ji.30 — subfolder routing, rediscovery, env vars, troubleshooting matrix, test count.

## [2.5.1-ji.31] - 2026-07-02

### Added
- **Agent context routing**: preToolUse hook writes `agent-context.json` (workspace roots + trace id); MCP uses it when `project_directory` is omitted to route across multiple Cursor windows.
- **Discovery logging**: Always log `feedback_request start project=(none)` when project directory is missing.

### Fixed
- **Webview bridge duplicate registration**: Single bridge attach per panel lifecycle; panel init no longer double-fires `hub-connect` with `webview-ready`.

## [2.5.1-ji.46] - 2026-07-03

### Added
- **`feedback_response.project_directory`** wire field (panel echoes session project on submit).
- Hub rejects panel `feedback_response` with foreign `project_directory`.
- Logs: `feedbackRequest: accepted session=... project=...`, `sessionDisplayed: ack ... project=...`.
- TDD: panel submit carries project, response mismatch rejection, `session_updated` broadcast project tag.

## [2.5.1-ji.45] - 2026-07-03

### Added
- **`project_directory` end-to-end**: `state_sync.pending_sessions` wire field, filtered `state_sync` on panel, project in `sessionUpdated`/`sessionReplay`/`feedbackResponse` logs, webview.log prefixed by hub workspace.
- **TDD** `projectDirectory.pipeline.test.js` — discovery routing, wire payload, state_sync filter, extensionClient payload.

### Changed
- **`feedbackDelivery` log lines** include `project=` when available for traceability across hops.

## [2.5.1-ji.44] - 2026-07-03

### Fixed
- **Double panel reconnect on load**: Extension no longer fires `please-reconnect` at 0/500/1500/3000ms; single deferred sync at 800ms. `syncServer` skips reconnect when bridge is already active (same port).
- **Cross-workspace feedback bleed**: Hub rejects `feedback_request` when `project_directory` does not match hub workspaces (`project_mismatch`). Panel ignores foreign `session_updated` and shows Degraded routing warning.
- **Removed global agent-context pollution** from `feedbackFlow` (was overwriting `agent-context.json` with MCP target project).

### Added
- **`workspaceMatch.ts`** — hub/panel project path isolation (TDD: `workspaceMatch.test.js`, `panelState` routing test, pipeline integration mismatch case).
- **`session_updated.project_directory`** on broadcast and replay for panel-side filtering.

## [2.5.1-ji.43] - 2026-07-03

### Added
- **Pipeline hop contracts** (`pipelineContracts.ts`): explicit Agent→MCP→Hub→UI hop IDs, client-type guards, `pipeline:` trace log lines.
- **Message router isolation**: `feedback_request` rejected from webview; `feedback_response` rejected from mcp-server (protocol_error with `pipeline_reject:`).
- **E2E integration tests** `feedbackPipeline.integration.test.js` — full round-trip, hop isolation, late replay, stale session_id fallback.
- **Unit tests** `messageRouter.test.js`, `pipelineContracts.test.js`; expanded `feedbackFlow.test.js` pipeline trace coverage.
- **`npm run test:coverage`** — c8 branch/line summary for `out/` modules exercised by tests.

## [2.5.1-ji.42] - 2026-07-03

### Fixed
- **Undelivered session_updated logging**: Hub logs `UNDELIVERED` when no webview is connected; logs `delivered` with webview count when successful.
- **Late webview replay**: On webview `register`, hub replays `session_updated` for all pending sessions (fixes Agent waiting while UI empty).
- **UI sync mismatch detection**: Status shows Degraded when server has pending feedback but panel has fewer waiting tabs.
- **session_displayed ack**: Panel acknowledges rendered sessions; logged as `sessionDisplayed: ack` for traceability.

### Added
- **Integration test** `feedbackDelivery.integration.test.js` — MCP request → webview delivery + late connect replay.
- **Unit tests** `feedbackDelivery.test.js` — delivery evaluation and UI mismatch detection.

## [2.5.1-ji.41] - 2026-07-03

### Added
- **Connection health UI**: Status bar shows `Connected` / `Degraded` / `Disconnected` with workspace (`WS:`), MCP count, pending count, and detached agents. Hover for issue list.
- **Hub snapshot on state_sync and pong**: Each workspace hub reports isolated port/pid/workspaces/MCP/webview counts for truthful end-to-end status.
- **TDD**: `connectionHealth.test.js`, `hubSnapshot.test.js` for cross-session/workspace isolation signals.

## [2.5.1-ji.40] - 2026-07-03

### Added
- **Webview log file**: Panel `debugLog` events append to `~/.config/mcp-feedback-enhanced/logs/webview.log` (also listed in Debug panel).
- **TDD transport tests**: `BridgeSessionGate`, `transportSendWithQueue`, and webview log unit tests cover init idempotency, reconnect, queue flush, and FIFO ordering.

### Changed
- **BridgeSessionGate** extracted to `panelState.js` (testable pure module used by panel.html).

## [2.5.1-ji.39] - 2026-07-03

### Fixed
- **Panel single init per page load**: Bridge mode now sends only `webview-ready` on boot (not hub-connect + webview-ready). `onBridgeConnected` is idempotent — one `register` + one `state_sync` per session unless explicit reconnect.

## [2.5.1-ji.38] - 2026-07-03

### Fixed
- **Lost session_updated on bridge attach**: Webview bridge clients are marked `webview` immediately so feedback broadcasts are not dropped before `register` arrives.
- **Stale localStorage session tabs**: Restored tabs no longer keep `waiting=true`; `state_sync` reconciles against server pending sessions and activates the latest one.
- **Continue on resolved tab**: Quick-reply / Send now targets the latest waiting session when the active tab is already resolved.
- **Stale session_id delivery**: When exactly one MCP request is pending, panel responses with an unknown `session_id` fall back to that session instead of being silently queued.

## [2.5.1-ji.37] - 2026-07-03

### Fixed
- **AWAITING SIGNAL after reconnect**: Bridge mode skipped `get_state` on connect; pending feedback sessions are now restored via `requestStateSync()` when the panel reconnects.

## [2.5.1-ji.36] - 2026-07-03

### Fixed
- **Panel Continue lost during reconnect**: Queue `feedback_response` (and other outbound WS messages) when the webview bridge is briefly down instead of silently dropping them.
- **Repeated webview reload on same port**: `syncServer` now soft-reconnects when the hub port is unchanged; full HTML reload only when the port changes.

## Unreleased

## [2.4.0] - 2026-03-26

### Silent Rules Refresh & Power Nap Warning

- **Silent rules refresh**: The preToolUse hook periodically re-injects rules into the agent's context (after N tool calls or M minutes). The reminder is invisible to the agent — it simply refreshes the rules without exposing the enforcement mechanism, so agents call `interactive_feedback` naturally rather than out of fear of being blocked.
- **Power Nap warning** (macOS): On activation, warns if Power Nap is enabled. When on, macOS periodically wakes during sleep — active agent sessions keep consuming API requests unattended. Offers a one-click disable option.
- **Natural rules wording**: The `.mdc` rule now uses natural guidance instead of threats. Agents use their judgment on when to call `interactive_feedback`, with the hard rule being: always use it as the final action before ending a turn.
- **Configurable**: Thresholds configurable via `~/.config/mcp-feedback-enhanced/enforcement-config.json` (`maxToolCalls`, `maxMinutes`).

## [2.3.3] - 2026-03-25

### Subagent Exclusion

- Added rule 4: subagents (dispatched via Task tool) are explicitly told NOT to call `interactive_feedback`. Only the parent agent should call it.
- Fixes browser fallback spam when subagents try to call `interactive_feedback` and fall back to opening browser windows.

## [2.3.2] - 2026-03-25

### User-Level Rules Deployment

- Rules file (`mcp-feedback-enhanced.mdc`) is now deployed to `~/.cursor/rules/` (user-level) instead of per-workspace `.cursor/rules/`. This avoids polluting each project's git-tracked directory.
- Old workspace-level rule files are automatically cleaned up on activation.

## [2.3.1] - 2026-03-25

### Feedback Error Notification

- Show a Cursor warning notification (`vscode.window.showWarningMessage`) when a feedback session fails internally (e.g., enqueue rejected, server shutting down).
- Improved MCP server error logging: logs browser fallback failures separately.

## [2.3.0] - 2026-03-25

### Migrate USAGE RULES from Hook to Cursor Rules

Replaced the `sessionStart` hook with a native `.cursor/rules/mcp-feedback-enhanced.mdc` file for injecting USAGE RULES. This is more reliable because Cursor rules are system-level directives that persist through context compression, whereas hook-injected `additional_context` was a one-shot injection vulnerable to being lost.

### Added
- **`deployCursorRules()`**: Writes an `alwaysApply: true` `.mdc` rule file to each workspace's `.cursor/rules/` directory on activation.

### Changed
- **Hook count reduced from 2 to 1**: Only `preToolUse` (`consume-pending.js`) remains active. `sessionStart` hook is retired.
- **USAGE RULES delivery**: Moved from `sessionStart` hook `additional_context` to `.cursor/rules/mcp-feedback-enhanced.mdc`.

### Removed
- **`session-start.js` hook**: No longer needed — rules are now delivered via `.mdc` file.
- **`sessionStart` hook registration**: Removed from `hooks.json` config and added to `RETIRED_HOOKS` for automatic cleanup.

## [2.1.4] - 2026-03-19

### HTTP-Based Pending System & Hook Refactor

Complete replacement of file-based pending message system with HTTP endpoints and in-memory storage. Hooks refactored into modular scripts with shared utilities.

### Added
- **HTTP Endpoints**: `GET /pending/:id` and `GET /health` on the existing WebSocket server for pending message retrieval.
- **preToolUse Hook** (`consume-pending.js`): Dedicated hook that intercepts tool calls to deliver queued pending messages mid-conversation. Supports allowlisted/passthrough tools.
- **Shared Hook Utilities** (`hook-utils.js`): Extracted common functions (`log`, `output`, `readStdin`, `httpGet`, `getServerPort`, `findServer`) to reduce duplication across hook scripts.
- **Feedback Reminder**: All `interactive_feedback` responses and pending deliveries now include a trailing reminder to call `interactive_feedback` before ending.
- **Server Discovery Fallback**: `preToolUse` hook falls back to workspace-based server discovery when `MCP_FEEDBACK_SERVER_PID` is stale or missing.
- **Legacy Cleanup**: Extension auto-migrates old `pending/` directory and removes retired hook entries (`stop`, `check-pending.js`) on activation.

### Changed
- **Pending Storage**: Moved from file-based (`pending/<id>.json`) to in-memory `Map<string, PendingEntry>` — eliminates file I/O, polling, and race conditions.
- **Pending Delivery**: Hooks now consume pending via `HTTP GET /pending/:id?consume=1` instead of file reads and deletes.
- **Hook Architecture**: Split monolithic `check-pending.js` into `session-start.js` (sessionStart only) + `consume-pending.js` (preToolUse only) + `hook-utils.js` (shared).
- **Hook Registration**: Uses object format for per-hook options (e.g., `loop_limit`). Retired hooks are auto-cleaned from `hooks.json`.
- **Active Hooks**: Reduced from 6 to 2 — `sessionStart` and `preToolUse`. Removed `beforeShellExecution`, `beforeMCPExecution`, `subagentStart`, and `stop` (redundant with `preToolUse`).

### Removed
- **File-based pending**: `readPending`, `writePending`, `deletePending`, `getPendingDir`, `cleanupStalePending`, `cleanupLegacyPending` from `fileStore.ts`.
- **`PendingData` type**: No longer needed (in-memory entries use `PendingEntry`).
- **`stop` hook**: `followup_message` creates an infinite agent loop — removed entirely.
- **`check-pending.js`**: Replaced by `session-start.js` + `consume-pending.js`.

## [2.1.2] - 2026-03-18

### Session Queue & Hook Cleanup

- **Session Queue**: Concurrent feedback requests are queued per conversation instead of rejecting duplicates.
- **Disabled Hooks**: Removed `stop`, `preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, and `subagentStart` hook handlers from `check-pending.js` (redundant with new architecture).
- **Test Cleanup**: Removed tests for disabled hooks (`stop`, `preToolUse`, `subagentStart`).

## [2.0.0] - 2026-03-09

### Full Rewrite — Multi-Session Architecture

Complete rewrite from scratch with `conversation_id` (Cursor UUID) as the single source of truth for all state isolation.

### Added
- **Multi-Session Tabs**: Each Cursor agent conversation gets its own isolated tab with independent chat history, pending queue, and images.
- **Chat Bubble UI**: Messages displayed in left/right bubble format (AI left, user right) with futuristic styling, gradients, and glow effects.
- **Image Input**: Paste (Cmd+V), drag-drop, and file picker support. Images displayed in chat, included in pending messages, and returned to the LLM via MCP image responses.
- **Image Lightbox**: Click any image in chat for a full-size preview overlay.
- **Pending Delivered as User Bubbles**: Pending messages delivered by hooks are displayed as user message bubbles with a `📤 pending` hint badge, preserving images.
- **Auto-Focus**: Bottom panel automatically activates on extension startup and when the agent requests feedback, with multi-retry logic.
- **Quick Replies**: Styled quick reply buttons with gradient hover effects.
- **Settings Panel**: Floating card with distinct styling (rounded corners, shadow, purple gradient header), separate from the message list.
- **Input Draft Persistence**: Typed text preserved per tab across switches and restarts via debounced localStorage saves.
- **Conversation Persistence**: Conversations survive extension/Cursor restarts via file-based storage in `~/.config/mcp-feedback-enhanced/`.
- **IME Composition Handling**: Proper handling of IME input (CJK, etc.) — Enter during composition doesn't send.
- **Cross-Panel Sync**: Tab close, pending queue changes, and user replies broadcast to all connected webview panels.

### Changed
- **Architecture**: Replaced PID-based routing with `conversation_id`-based isolation. Extension acts as WebSocket hub; MCP server and webviews connect as clients.
- **Webview**: Single self-contained `static/panel.html` with inline CSS/JS (no generated HTML).
- **Hooks**: All 6 hook points use direct `conversation_id` matching for pending lookup — no fallback scanning. `beforeMCPExecution` unconditionally denies all tools when pending exists.
- **`retainContextWhenHidden: true`**: Webview state preserved when panel is hidden (previously `false`).
- **Removed console.log**: All console output removed from extension startup/deactivation paths to prevent Output panel stealing focus.

### Removed
- Sidebar panel (bottom panel only).
- SQLite/history.db storage (replaced with JSON files).
- `generate-webview.js` HTML generator (replaced with static `panel.html`).
- Fallback/scan logic in hooks (`getPending`, `consumePending` — direct match only).
- Browser fallback mode.

### Fixed
- **Deadlock Bug**: `consumePending` fallback only checked `comments`, not `images`. Image-only pending files were never deleted, causing infinite tool blocking.
- **Cross-Session Contamination**: `_resolveConversationId` no longer guesses — only matches existing conversation/session files.
- **Tab Labels**: Use incremental chat numbers (`#1 | HH:MM`) initially, updated to agent's summary when available.
- **Hook Output Fields**: Aligned with official Cursor API (`permission` instead of `decision`, etc.).

### Hook Design (6 points)
- `sessionStart`: Inject `conversation_id` + USAGE RULES via `additional_context`.
- `preToolUse`: Deny non-allowlisted tools + inject pending as `user_message`.
- `beforeShellExecution`: Block + inject pending.
- `beforeMCPExecution`: Unconditionally deny all MCP tools when pending exists.
- `subagentStart`: Block subagent creation + inject pending.
- `stop`: Deliver pending as `followup_message` or remind to call `interactive_feedback`.

## [1.2.23] - 2026-03-04

### Fixed
- **Removed `subagentStop` hook**: Its `followup_message` was disrupting the parent agent's normal processing of subagent results.

## [1.2.15] - 2026-03-03

### Re-added
- **Cursor Hooks integration** re-implemented with simplified architecture.

### Fixed
- **Critical path mismatch**: Hook was reading from wrong path.
- **Race condition**: `preToolUse` deny was overridden by `beforeShellExecution` allow for Shell tools.

## [1.2.5] - 2026-02-10

### Removed
- **Removed Cursor Hooks integration** to simplify the extension architecture.

## [1.2.0] - Previous Releases

### Added
- WebSocket-based architecture.
- Auto-configuration for MCP server.
- Initial Cursor hooks integration.
