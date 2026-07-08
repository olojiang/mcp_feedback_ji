# Changelog

All notable changes to this project will be documented in this file.

## [2.5.1-ji.155] - 2026-07-08

### Fix — 阻断重复 feedback live wait

- **重复 active wait 不再空返回** — hooks 发现同一 trace 已有 live `interactive_feedback` 等待时，不再只输出 `{}`；改为明确阻断重复 tool call，并提示 Agent 结束本轮、等待现有面板回复
- **账单风险定位** — 这对应 Cursor Usage 中同一时间段出现额外 request 的场景；日志会从 `action=skip_duplicate_active_wait` 变为 `action=deny_duplicate_active_wait`
- **回归测试** — 更新 consume-pending hook 集成测试，锁定重复 active wait 必须返回 deny 输出

### Fix — 图片粘贴入队与 Pending 计数

- **空对话图片粘贴可入队** — 无 active session 时，Cmd+V 粘贴图片不再只显示 `Pasted` toast；图片会进入全局 staged images，显示预览，并在点击 Queue 后写入 `queue-pending.images`
- **附件随下一次 live request 投递** — 当后续 Agent 请求到达时，pending 文本与图片会一起自动提交；日志中可见 `queuePending: comments=1 images=1` 与 `feedbackResponse ... image_count=1`
- **Pending 计数按回复而不是附件** — `PENDING (n)` 不再把图片附件单独算一条；一条文本回复带图片显示 `PENDING (1)`，纯图片 pending 也显示 `PENDING (1)`
- **回归测试** — 新增 panel state 覆盖空对话图片 staged/queue、空对话文字+截图一起入队、图片附件计数；全量 `npm test` 为 **503 pass**

### Docs — README 亮点与功能总览

- **README 首屏强化** — 新增“核心亮点”，把 Request 节省、IDE 面板、多 Tab、长等待恢复、多 workspace 隔离和结构化日志集中放到开头
- **功能地图** — 新增按模块划分的功能表，覆盖 Feedback 面板、Request 保护、会话恢复、多 workspace、连接韧性、剪贴板、可观测性和开发部署
- **定位更清晰** — README 保留后续安装、机制和排查细节，同时让首次阅读者先看到本 fork 相比上游的关键价值

## [2.5.1-ji.154] - 2026-07-07

### Fix — pending 回复刷新后不丢失

- **outbound queue 持久化** — `feedback_response` 在 bridge / WebSocket 未就绪时不只停留在内存队列，面板保存状态时会一并保存 outbound queue
- **刷新后恢复重发** — webview hydrate localStorage 时恢复 outbound queue，连接恢复后继续 flush，避免用户看到 pending 文本被清空但 Agent 没收到
- **Deploy 已同步** — `npm run deploy` 已构建并同步到本机 Cursor 扩展目录，版本更新为 `2.5.1-ji.154`
- **Codex remote_control 配置修正** — 本机 `~/.codex/config.toml` 的 custom/Azure provider 已改为 `requires_openai_auth = false`，避免 API-key auth 下反复触发 ChatGPT remote control auth 检查；相关 app-server 重启后生效
- **TDD** — 新增 `OutboundQueue` 回归测试，先复现 `snapshot is not a function` 的 RED，再实现 `snapshot()` / `restore()` 通过 GREEN

## [2.5.1-ji.151] - 2026-07-07

### Fix — detached tab 不再抢走 live request 回复

- **live session 自动恢复** — 面板 active tab 如果是 `link_lost` / `mcp_detached`，但同 workspace 还有 live waiting session，普通发送会自动切到 live session 并发送 `feedback_response`
- **Hub 聚合计数收窄** — `mcp_detached_count` 只在无法区分、且所有 pending 都 detached 时作为兜底；混合状态下不再把 live session 误标成 detached
- **提交后不跳回旧 tab** — live request 成功 `feedback_submitted` 后，后续 `state_sync` 只剩旧 detached pending 时不会把 active tab 抢回旧会话
- **按钮状态修正** — active tab 是 detached 但存在 live target 时按钮保持 Send；只有 detached pending 时显示 queue-lost，不再伪装成可直达的 Send
- **TDD** — 新增四个 panel state 回归测试，覆盖混合 detached/live pending session 的误投递、误标记、成功提交后 active 抢占，以及 detached-only 按钮误报

## [2.5.1-ji.149] - 2026-07-06

### Fix — 断网/长等待后避免 duplicate feedback 续跑浪费

- **stale duplicate release** — 同一 trace 的 duplicate `interactive_feedback` 如果已等待超过 35 分钟，不再返回 `already_pending` 继续订阅，而是返回 `released_duplicate`
- **End-turn no-op** — MCP 收到 `released_duplicate` 后走现有 no-op 文案，要求 Agent 立即结束本轮，不再继续调用 feedback
- **keepalive 默认恢复** — deploy 和 mcp config planner 都写入 `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS=3000000`，避免旧 progress-only 配置残留并撞 Cursor 后端硬超时
- **诊断日志** — Hub 记录 `feedbackRequest: stale_duplicate_release ... wait_ms=... threshold_ms=...`，MCP 侧继续记录 `event=request_billing_risk reason=released_duplicate`
- **TDD** — 新增回归测试覆盖 36 分钟 stale duplicate；更新 deploy mcpConfig 测试锁定 50min keepalive 默认

## [2.5.1-ji.147] - 2026-07-06

### Fix — 测试隔离 + 前端 health timeout 降噪

- **测试 Hub 隔离** — 新增 `tests/helpers/isolatedConfig.js`，所有启动 `WsHub` 的集成测试强制使用独立 `MCP_FEEDBACK_CONFIG_DIR`
- **隔离守卫测试** — 新增 `tests/testIsolation.test.js`，防止未来测试进程再次写入真实用户的 Hub registry / pending 状态
- **前端 health** — `panelConnection` 暴露最近 Hub protocol activity，`panelApp` 在判定 ping timeout 时同时参考真实消息活动，减少空闲或后台状态误报
- **单测** — 增加 health timeout 误报覆盖；全量 **487** pass

## [2.5.1-ji.146] - 2026-07-06

### Fix — Reload 后 workspace 状态不串台

- **陈旧 workspace 清理** — Extension reload / workspace 变化时清理不属于当前 workspace 的内存状态
- **`state_sync` 加固** — 同步 payload 带 workspace hash，面板收到不同 workspace 的旧 payload 时不合并
- **Panel storage key** — localStorage key 引入 workspace hash，避免不同 Cursor workspace 复用 drafts / pending / tab 状态
- **Registry lock** — 记录并校验 project path，减少旧 Hub pid 或旧 registry 文件误导新窗口
- **单测** — 覆盖 reload、workspace hash、panel state 隔离路径

## [2.5.1-ji.145] - 2026-07-06

### Fix — 多 Cursor workspace 运行时隔离

- **per-workspace runtime 文件** — registry lock、pending session store、feedback state 都按 workspace hash 分片
- **显式 project routing** — MCP discovery 更严格使用 `project_directory` / cwd / workspace hash 匹配目标 Hub，降低跨项目连错端口风险
- **pending 文件命名** — pending session 文件名包含完整 workspace hash，避免 hash 前缀或 basename 碰撞
- **测试覆盖** — 增加 server discovery、tool handler、pending store、架构约束测试

## [2.5.1-ji.144] - 2026-07-06

### Fix — Reload 后保持 live Cursor request 路由

- **stale detached 防抢占** — Hub snapshot 不再把 detached session 当作健康 waiting session
- **面板恢复顺序** — Webview restore 时保留 live Hub waiting tab，避免旧 detached tab 把按钮误导成 QUEUE
- **health 可观测性** — 增加 connection health 测试，覆盖 `UI missing waiting tab` 的 false positive 场景
- **目标** — 让用户在面板内继续反馈时尽量复用当前 live Cursor request，而不是被旧 pending 状态带偏

## [2.5.1-ji.136] - 2026-07-06

### Fix — 减少 Cursor Request 浪费 + zombie MCP 清理

- **hooks `consume-pending`** — `Rules refresh` checkpoint 与 pending 投递改用 **`followup_message`**（不再 `permission: deny` 触发新 Request）
- **`feedback-guard.buildFollowupMessage`** — 零成本 hook 注入辅助函数
- **`ClientRegistry.sweepStale`** — orphan MCP idle > 90s 关闭；active wait 保护至 35min；超时 zombie 强制 `close`
- **`FeedbackManager.activeMcpClients`** — 供 stale sweep 识别 live wait
- **单测** — stale / hooks followup 覆盖；全量 **465** pass

## [2.5.1-ji.135] - 2026-07-06

### Fix — hooks 拦截重复 feedback（减 Usage 浪费）

- **`GET /feedback-active?trace_id=`** — hub 查询当前 trace 是否有 live MCP 等待
- **`FeedbackManager.liveWaitForTrace`** — 供 hooks / HTTP 复用
- **hooks `consume-pending`** — pending 时 **deny** 重复 `interactive_feedback`；有 live wait 时跳过 rules refresh 强推 feedback
- **`feedback-guard.js`** — 纯函数 + 单测

## [2.5.1-ji.134] - 2026-07-06

### Fix — 容错兜底（MCP 断连 / 版本 skew / 重连）

- **MCP discover**：同版本 hub 优先，减少连到旧 ji.126 hub
- **MCP toolHandlers**：`Connection closed` / `extension_ws_close` 不再盲目 retry
- **OutboundQueue**：队列满时优先丢弃非 `feedback_response`
- **BridgeSessionGate**：重连后强制 `stateSync`
- **面板**：Hub pid 变化时重新 hydrate；`feedback_submitted` 后 30s 无续跑提示

## [2.5.1-ji.132] - 2026-07-06

### Fix — hello 进 PENDING 但 Agent 仍在等（重连竞态）

- **`getUIState`**：任一 tab `waiting` 时按钮显示 **Send**（不再误显示 Queue）
- **`feedback_submitted`**：清除 `globalPendingQueue` 中重复文本，避免送达后 PENDING 残留

## [2.5.1-ji.131] - 2026-07-06

### Fix — P1 健壮性

#### 面板
- **`submitInFlight`**：防止双击 Send 重复 `feedback_response`；按钮显示 Sending...
- **`snapshotServerGlobalPending` / `restoreServerGlobalPending`**：hydrate 时 server 全局 pending 优先于 localStorage

#### MCP
- **hard timeout 不 retry**：`cursor_hard_timeout_suspected` 时单次尝试即返回 End turn 文案
- **noOp billing**：`released_duplicate` / keepalive 记录真实 `elapsed_ms`

## [2.5.1-ji.130] - 2026-07-06

### Fix — P0 健壮性（MCP settle guard / 面板 link-lost UX）

#### MCP
- **`extensionClient.ts`**：`requestFeedback` 增加 `settled` 守卫；resolve 后忽略 `ws.close` 误 reject，减少 retry 与 billing 噪音
- **`toolHandlers.ts`**：每次 `requestFeedback` 后在 `finally` 关闭 WS，避免 orphan 连接引发 trace_steal 链

#### 面板
- **`panelState.js`**：`agent_turn_status` 刷新 `input` + `connection`；`cursor_ended` 不再误走 queue-pending；`_sessionLinkLost` 仅认 `mcpDetached`
- **`panelApp.js`**：`exec` 支持 `connection` render target

#### 日志
- **`panelSubmitOutcome.ts`**：`feedback_submitted_broadcast` / `feedback_undelivered_broadcast`
- **hooks**：`event=hooks_feedback_tool` + trace 字段；troubleshooting 增加 hooks↔MCP 关联 grep

## [2.5.1-ji.128] - 2026-07-06

### Fix — 面板重连后 waiting tab 被 localStorage 冲掉

修复面板 webview 重连时 `hydrateAfterStateSync` 用 localStorage 覆盖 Hub pending session，导致 **Send 变 QUEUE**、回复进 PENDING 但 Agent 收不到的问题。

#### 面板 hydrate（ji.127–ji.128）
- **`panelState.js`**：`snapshotServerPendingSessions` / `restoreServerPendingSessions`；`reconcileLocalAfterServerSync` 显式恢复 waiting；`_trackPendingSessionId` 跟踪 sessionReplay
- **`panelApp.js`**：hydrate 顺序改为 snapshot → deserialize → restore；新增 `server_pending_snapshot` / `restored waiting_count` 诊断日志

### Feature — Request 浪费防护与可观测性（ji.116+）

#### MCP 侧
- **`feedbackNoOp.ts`**：`[keepalive]` / `[released_duplicate]` / `[superseded]` 返回 **End turn** 文案，禁止 Agent 连环调 feedback
- **`requestBillingRisk.ts`**：`event=request_billing_risk` 记录 keepalive / 硬超时 / WS 断连，便于对照 Cursor Usage
- **`cursorKeepalive.ts`** / **`extensionClient.ts`**：支持 `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS=0` progress-only 等待；`progress_send_ok/fail` 日志

#### Hub / 面板
- **`panelSubmitOutcome.ts`**：`panel_submit_delivered` / `panel_submit_no_effect` 结构化 reason
- **`agentTurnStatus.ts`**：MCP 断连时广播 `agent_turn_status`，面板 toast 提示
- **`feedbackFlow.ts`** / **`feedbackManager.ts`**：投递路径细化 logging

#### Agent 规则
- **`deploy/rules.ts`**：同步 no-op 结束语义到 Cursor rules

### Docs
- **`troubleshooting.md`**：hydrate grep、`panel_submit_no_effect` / `request_billing_risk` reason 表
- **`readme.md`**：亮点表、死锁恢复、环境变量更新至 ji.128

### Test
- 新增 `feedbackNoOp.test.js`、`requestBillingRisk.test.js`、`panelSubmitOutcome.test.js`、`agentTurnStatus.test.js`
- 扩展 `panelState.test.js`（hydrate snapshot/restore）、`feedbackFlow.test.js`、`cursorKeepalive.test.js`

## [2.5.1-ji.115] - 2026-07-05

### Fix — 左右都在等的死锁恢复

修复 Hub 重启 / MCP 连错端口后面板 PENDING 与 Agent waiting 不同步的问题。

#### Pending 磁盘持久化
- **`pendingSessionStore.ts`**：pending session 写入 `~/.config/mcp-feedback-enhanced/pending-sessions/<hash>.json`
- **`wsHub.ts`**：enqueue / mcp_detach / hub_shutdown 时持久化；启动时 restore；空队列 cleanup 不再误删磁盘文件
- **`feedbackManager.restoreDetachedSession()`**：Hub 重启后恢复 detached pending
- **`feedbackManager.rejectAll()`**：已 detach 的 session 不 reject，避免 unhandledRejection

#### 面板 boot 顺序
- **`panelState.js`**：`ensureSession` 不再无条件 `waiting=true`；`reconcileLocalAfterServerSync()` 去陈旧 PENDING
- **`panelApp.js`**：先 `state_sync`，再 `hydrateAfterStateSync` 合并 localStorage

#### Hub 路由与重发现（ji.113–ji.114）
- **`serverDiscovery.ts`**：无 `project_directory` 时用 agent 隐式工作区过滤候选 Hub
- **`toolHandlers.ts`**：`extension_ws_close` 时 6×1s 重发现，等待 Hub 重启

#### MCP 长等待韧性
- **`cursorKeepalive.ts`**：默认 50min 自动 resolve，避免 Cursor ~60min 工具硬超时
- **`extensionClient.ts`**：等待期间打印 `session_bound` / `session_id`；支持 progress 通知（`MCP_FEEDBACK_CURSOR_PROGRESS_MS`）

### Docs
- 新增 `local_docs/troubleshooting.md`：死锁排查、grep 命令、手动 ↻ 恢复
- 更新 `readme.md`：亮点表、死锁恢复专节、409 测试

### Test
- 新增 `pendingSessionStore.test.js`、`pendingRestore.integration.test.js`、`cursorKeepalive.test.js`、`pipelineLogging.test.js`
- 扩展 `feedbackManager.test.js`、`panelState.test.js`
- **409 测试全部通过**

## [2.5.1-ji.101] - 2026-07-04

### Fix — 断网重连韧性

修复断网重连场景下的两个关键问题。

#### Steal Cascade 防护（意外 Cursor Request）
- **问题**：断网重连后 Cursor 以同一 `traceId` 重新调用 `interactive_feedback`，导致新旧 MCP 进程互相 supersede，形成重试级联，消耗额外 Cursor Request
- **修复 `toolHandlers.ts`**：检测到 `superseded` 错误时立即返回提示信息，不再重试；明确告知 Agent 不要再次调用
- **修复 `extensionClient.ts`**：收到 `feedback_error` 后立即 `ws.close()` 关闭连接，防止旧连接残留

#### 粘贴韧性（Bridge 异常时 Cmd+V 失效）
- **问题**：WebSocket bridge 断开或超时后，`extensionClipboardReady()` 仍返回 `true`，拦截了原生粘贴事件，导致无法粘贴文本和图片
- **修复 `panelApp.js`**：引入 `clipboardBridgeHealthy` 状态跟踪 bridge 剪贴板健康度
  - 粘贴请求超时 3s → 标记 `clipboardBridgeHealthy = false` → 自动回退原生粘贴
  - 粘贴成功或 bridge 重连 → 恢复 `clipboardBridgeHealthy = true`

### Test
- 383 测试全部通过（3 个预存失败与本次修改无关）

## [2.5.1-ji.98] - 2026-07-04

### Fix — 架构审查修复

深度架构审查发现并修复 4 个问题。

#### 内存泄漏修复
- **Bridge broadcast timer leak**: `onDidDispose` 未清理 `_bridgeBroadcastTimer`，webview 关闭后定时器继续执行
- **Heartbeat interval leak**: `panelApp.js` 30s heartbeat interval 在 `pagehide` 时清理

#### 性能优化
- **Clipboard handlers 缓存**: `wsHub._routeMessage` 每条消息重复创建 `clipboardHandlers`，改为懒加载单例
- **Discovery 并行 health check**: `serverDiscovery.ts` 串行 `fetchHealth` 改为 `Promise.all` 并行，减少 MCP 工具调用延迟
- **WsHub 支持注入 `readImageBase64`**: 解决测试中系统剪贴板干扰导致的 flaky test

### Test
- 新增 bridge broadcast timer dispose 测试
- 修复 clipboard_paste 测试（mock `readImageBase64` 避免系统剪贴板干扰）
- 测试总数 375→376，全部通过

## [2.5.1-ji.95] - 2026-07-04

### Feature — 日志可观测性优化

全面改善四大日志子系统（extension / mcp-server / webview / hooks）的信噪比，消除三大日志噪声源。

#### Bridge 广播风暴修复
- **`_broadcastBridgeConnected` 最大重试 30→6**: 配合 `bridge-ack` 立即停止，最差 3 秒内结束（原 15 秒）
- webview 日志 `onBridgeConnected` 行数预期 ~372 行/天 → ~10 行/天

#### Discovery 噪声过滤
- **`listJSONFiles` 过滤 `_` 前缀**: `_instance.lock.json` 等内部文件不再被当作服务注册处理
- 消除每次请求 ~96 条无用日志

#### Hooks 日志静默 passthrough 工具
- **识别 passthrough 工具**（Read/Grep/Glob/SemanticSearch 等）跳过 header + allowlisted + output 日志
- 仅保留计数器更新（enforcement 机制不受影响）
- hooks.log 预期 ~32K 行/天 → ~5K 行/天

### Test
- 新增 `toolHandlers.test.js`：10 个测试覆盖 MCP 工具核心路径（依赖注入、tool definitions、state handling）
- 新增 `hookUtils.test.js`：12 个测试覆盖 hook 工具函数（findServer、readFeedbackState、log rotation）
- 测试总数 312→374（+62），全部通过

### 文档
- 新增 `local_docs/fix_log_0704.md`：日志可观测性优化完整文档（含 3 个 Mermaid 图）

## [2.5.1-ji.90] - 2026-07-04

### Feature — Cursor Request 零浪费保护

全面消除插件自身可能导致的 Cursor Request 浪费，参考 `shenghanqin/mcp-feedback-enhanced-vscode-good` 分支经验并结合自身架构改进。

#### Request 节省
- **`already_pending` 忽略**: extensionClient 收到 `already_pending` 时不完成工具调用，继续等待真正的用户回复，避免 Cursor 启动新 Agent 轮次
- **超时 resolve 而非 reject**: MCP 24h 超时返回 `{ status: 'timeout' }` 而非抛错，不触发 Agent 错误处理循环
- **`stop` hook 重新启用**: 使用 `followup_message` 零成本提醒 Agent 调用 `interactive_feedback`（`STOP_LOOP_LIMIT=3` 防止无限循环）
- **enforcement 阈值大幅提高**: `maxToolCalls` 15→50, `maxMinutes` 5→15, 正常使用不触发 deny
- **精简提示文本**: 去掉冗余 `FEEDBACK_REMINDER`，缩短 `fmtAgent` 和 enforcement 消息

#### 连接优化
- **MCP 重连减速**: `rediscovery` 6→3 轮, `extensionAttempts` 3→2, 失败时更快放弃
- **toolHandlers 状态处理**: `already_pending` / `timeout` 等非正常状态返回提示文本而非用户反馈

#### 多窗口隔离
- **per-workspace feedback state**: `feedback-state.json` 改为 `{ workspacePath: state }` 嵌套结构，多窗口独立计数
- **平滑迁移**: 旧的平面 `feedback-state.json` 自动迁移到嵌套格式

#### 系统保护
- **Sleep 检测**: WS Hub 心跳检测系统休眠（gap > 2min），合盖恢复时弹出 VS Code 警告
- **PASSTHROUGH_TOOLS 扩展**: 新增 `websearch`, `webfetch`, `fetchmcpresource` 为只读直通工具

### Fix
- **Textarea 输入越来越矮**: `autoGrowTextareaHeight` 测量 `scrollHeight` 前先重置 `height=0`，消除反馈循环；`input` 事件中增加 maxPx 回退

### Test
- 修复 `sessionDedupe` 断言（`duplicate ignored` → `already_pending`）并增强 `sendResult` 行为验证
- 修复 `p569Refactor` 断言（stop hook 已重新启用，非退役）
- 新增 `cursorRequestWaste.test.js`：timeout/status 处理、already_pending sendResult、workspaceKey、stop 注册

### 文档
- `local_docs/compare_implement_for_waste_cursor_request.md`: 完整的对比分析文档
- `local_docs/fix_cursor_req_1.md`: 问题分析文档（含 Mermaid 架构图和时序图）

## [2.5.1-ji.89] - 2026-07-03

### Fix
- **Duplicate MCP wait waste**: trace_steal/reuse now `sendError` on superseded MCP WebSocket (releases hung tool call instead of 24h timeout).
- **Same ws duplicate request**: ignored (`trace_duplicate_blocked`) — no second fb- tab.
- **Tests**: `sessionDedupe.test.js` covers 5-call storm, supersede error, parallel traces, resolve-then-new.

## [2.5.1-ji.88] - 2026-07-03

### Feature
- **Session audit journal**: `~/.config/mcp-feedback-enhanced/logs/session-journal.jsonl` records cursorTrace, workspaces, hub port/pid, continuation vs new tab, timestamps.
- **Richer sessionLifecycle logs**: `cursorTrace`, `workspaces`, `hubPort`, `continuation`, `summary` preview.

## [2.5.1-ji.87] - 2026-07-03

### Fix
- **Duplicate feedback tabs**: same `trace_id` with parallel MCP WebSockets now **trace_steal** (reuse tab) instead of spawning extra sessions.
- **Session lifecycle logging**: grep `sessionLifecycle:` in extension.log for create / transport_reuse / trace_steal / mcp_detach / resolve.

## [2.5.1-ji.86] - 2026-07-03

### Fix
- **Staged image delete ghost UI**: tab switch / `state_sync` now re-renders `staged_images`; delete targets correct session.
- Clear `stagedImages` when server marks session resolved.

## [2.5.1-ji.85] - 2026-07-03

> **Release highlight (ji.57 → ji.85)**：修复 Panel Disconnected / 空面板（ji.79 sanitize 回归）、Reload 后 stale webview、bridge 重复初始化；新增按天轮转 panel 日志、Pending/Draft UX、输入区 splitter 伸缩；312+ 单测与 deploy 工作流。

### Fix
- **Input area flex**: dragging pane splitter resizes textarea to fill bottom pane.
- **Textarea resize**: restored `resize: vertical` on input; syncs on pending show/hide.

## [2.5.1-ji.84] - 2026-07-03

### Fix
- **Pending UX**: Send now merges + clears session `pendingQueue`; PENDING bar hides after submit.
- Chat badge `queued` renamed to `draft` (saved locally, not yet sent to agent).

## [2.5.1-ji.81] - 2026-07-03

### Feature
- **Panel log daily rotation**: `webview-YYYY-MM-DD.log`, keep 7 days; `webview.log` symlink to today.
- **Truncate today's panel log**: command `MCP Feedback Enhanced: Clear Today's Panel Log` or DBG → **Clear panel log**.

## [2.5.1-ji.80] - 2026-07-03

### Fix
- **Single panel init**: one `webview-ready` per page load (dedupe early/late + extension ack).
- **inline bridge** only when panelApp fails (`ps=false`), not on every bridge-connected.
- Log webview html reload reason (port-change / recreate).

## [2.5.1-ji.79] - 2026-07-03

### Fix
- **Root cause (ji.71 regression)**: `_loadWebviewHtml` sanitized script tags before URI injection, stripping all panel JS — only inline bridge fallback ran (Connected but empty panel).
- Moved sanitize to run only after `_injectWebviewResources` replaces script URIs.

## [2.5.1-ji.77] - 2026-07-03

### Fix
- **Inline bridge fallback**: update Connected UI + register webview even when `panelApp` fails to load.
- **bootReport**: log script load status to webview.log after page load.
- **webview-ready** phase logged on extension side.

## [2.5.1-ji.75] - 2026-07-03

### Fix
- **Stale webview after Reload**: force `retainContextWhenHidden: false`; bust panel html on each resolve.
- **Early boot**: acquire VS Code API + `webview-ready` before `panelApp`; queue bridge messages until panelApp drains them.
- **Diagnostics**: log `resolveWebviewView` to webview.log; bridge broadcast extended to 15s.

## [2.5.1-ji.74] - 2026-07-03

### Fix
- Same as ji.73 (deploy auto-bump) + ErudaPanel stub.

## [2.5.1-ji.73] - 2026-07-03

### Fix
- **Panel Disconnected**: `panelApp` no longer aborts when `ErudaPanelModule` fails to load; uses height stub instead.
- **Bridge handshake race**: repost `bridge-connected` for 5s until `webview-ready` ack.

## [2.5.1-ji.72] - 2026-07-03

### Fix
- **Bridge on panel open**: connect bridge immediately when webview is visible (not only on `webview-ready`).
- **panelState transport fallback**: panel loads even if split module scripts fail.

## [2.5.1-ji.71] - 2026-07-03

### Fix
- **Deploy without Reload**: strip unreplaced `{{PLACEHOLDER}}` script tags so old extension memory + new panel.html does not brick the panel.
- **panelState**: graceful fallback when split modules fail to load.

## [2.5.1-ji.70] - 2026-07-03

### Refactor (items 1–8)
- **panelStateMarkdown.js / panelStateUx.js**: further split from `panelState.js`.
- **webviewDiagnoseHandlers**: `buildDebugReport` with trace-filtered MCP log tail.
- **hooks command drift**: rewrite hooks.json when node/hook path changes.
- **createTestClipboard**: shared test double for WsHub integration tests.
- **postDeployReload** command + **retainContextWhenHidden** setting.
- **message_patch** incremental timeline sync + `hubTimeline` on panel.
- **Tests**: `p570Features.test.js` (297 total).

## [2.5.1-ji.69] - 2026-07-03

### Refactor (P5–P7)
- **wsHub decoupled from vscode**: `ClipboardPort` + `createClipboardHandlers`; extension injects `createVscodeClipboard()`.
- **deploy/hooks, rules, pendingMigration**: pure planning + TDD (`p569Refactor.test.js`).
- **panelStateTransport.js**: split transport/connection classes from `panelState.js`.
- **stateSyncPayload**: incremental sync skips unchanged `pending_sessions` / `hub` (fingerprints per WS).
- **extensionHelpers + feedbackReminders**: workspaces, webview placeholders, reminder scheduling smoke tests.

## [2.5.1-ji.68] - 2026-07-03

### Refactor (recommendations 1–4)
- **panelApp.js**: extract ~1650 lines from `panel.html` (HTML now ~733 lines).
- **deploy/mcpConfig + nodeBin**: pure MCP config planning; lazy node resolve.
- **structuredFileLog + extensionFileLog**: batched hub logging (100ms flush).
- **stateSyncPayload**: incremental sync omits unused timeline after gen 0.
- **webviewMessageRouter**: table-driven panel message handlers + `_hostPayload` dedup.
- **Tests**: `refactor168.test.js`.

## [2.5.1-ji.67] - 2026-07-03

### Added (P4 架构)
- **Bridge vs WS 指标**：hub `transportMetrics`（bridge/tcp webview 比例）+ panel `TransportMetrics`（出站消息统计）。
- **Registry 单实例锁**：`_instance.lock.json` + `writeServersBatch` 多根 workspace 原子写入，避免竞态覆盖。

## [2.5.1-ji.66] - 2026-07-03

### Added (P0–P3)
- Deploy reload banner (memory vs disk version), MCP reconnect hints in ConnectionHealth.
- Disconnect reason tags in logs/errors; DBG MCP log tail (50 lines).
- `mcpFeedback.quickReplies` setting; agent handoff JSON export.
- Tests: `p0p3Features`, `mcpStdioKeepalive.integration`, `multiWorkspaceRouting`.
- CI: `publish.yml` VSIX packaging on version tags.

## [2.5.1-ji.65] - 2026-07-03

### Fixed
- **MCP ~30s Connection closed**: while `interactive_feedback` waits for user input, send MCP `notifications/message` logging keepalive every 10s so Cursor does not drop idle stdio transport.

### Added
- **`stdioKeepalive.ts`**, `tests/mcpStdioKeepalive.test.js`.

## [2.5.1-ji.64] - 2026-07-03

### Added
- **Nightly CI** (`.github/workflows/nightly.yml`): MCP stays connected 95s real-time (`test:nightly`).
- **`feedbackWait.ts`**: injectable heartbeat log in `requestFeedback`; unit test with mock timers.
- **E2E**: DBG Prune / Export MD buttons (`panel-dbg-buttons.spec.cjs`).

### Changed
- `run-tests.js` excludes `*.nightly.*` from default `npm test`.

## [2.5.1-ji.63] - 2026-07-03

### Added
- **DBG Prune test hubs**: remove dead `/tmp/*` test registry entries; skip alive pids with log.
- **Export MD**: DBG **Export MD** copies session transcript as Markdown.
- **Input auto-grow**: textarea grows with content up to pane max.
- **`panelConnection.js`**: connection health render extracted from panel.html.

### Tests
- `pruneTestRegistry`, `sessionsMarkdown`, `panelConnection.module`.

## [2.5.1-ji.62] - 2026-07-03

### Fixed
- **Test registry isolation**: `npm test` uses `MCP_FEEDBACK_CONFIG_DIR` temp dir — no more test hubs polluting `~/.config`.
- **Version skew noise**: banners ignore test hub versions (`full-pipeline`, `/tmp/*` workspaces).
- **Status bar**: port shown once (`:48201`); label is `Connected pid=…` without duplicate port.
- **Panel perf (#11)**: `renderConnectionHealth` skips DOM updates when health signature unchanged.

### Added
- **Observability (P4)**: structured `event=` logs for mcp stale sweep skip + MCP `feedback_wait_heartbeat`; deploy stamp in panel; DBG **Copy diagnose** bundle.
- **Tests**: `configPaths`, `structuredLog`, `registrySkewFilter`, `fileStore.registry`, `clientRegistry.staleLog`, E2E `panel-health`.
- **verify-install**: warns if user registry contains test hub entries.

## [2.5.1-ji.61] - 2026-07-03

### Fixed
- **Input pane resize**: dragging the splitter now stretches the textarea (`align-items:stretch`, `height:100%`).

### Added
- **Tests**: `mcpStaleWait.integration` (hub-level MCP survives 120s idle sweep).

## [2.5.1-ji.60] - 2026-07-03

### Fixed
- **MCP `Connection closed` (~90s)**: hub `sweepStale` no longer disconnects idle `mcp-server` clients while waiting for user feedback.
- **Deploy stability**: `deploy.js` skips killing MCP processes by default (`MCP_FEEDBACK_KILL_MCP_ON_DEPLOY=1` to force).
- **MCP UX**: `formatExtensionCloseError` gives actionable close messages; `toolHandlers` keeps WS open after feedback.

### Added
- **Tests**: `clientRegistry.mcpStale`, `deployPolicy`, `mcpConnectionClosed`.

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
