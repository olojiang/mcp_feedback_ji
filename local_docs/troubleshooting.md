# MCP Feedback Enhanced — 问题排查指南

日志目录：`~/.config/mcp-feedback-enhanced/logs/`

| 文件 | 层 | 内容 |
|---|---|---|
| `mcp-server-YYYY-MM-DD.log` | MCP Server | 工具调用、WS 连接、keepalive、session_bound |
| `extension-YYYY-MM-DD.log` | Extension Hub | pipeline、session 生命周期、断连 |
| `webview-YYYY-MM-DD.log` | Panel UI | 用户操作、bridge、session 收发 |
| `session-journal.jsonl` | Hub 审计 | 结构化 JSON，最佳关联源 |

## 数据链路（6 跳 + session 绑定）

```
Agent → MCP: interactive_feedback
  pipeline: mcp→hub:feedback_request          (extension.log)
  pipeline: hub:enqueue session=fb-xxx       (extension.log)
  pipeline: hub→mcp:session_bound            (extension.log + mcp-server.log)
Hub → UI: session_updated
  session_updated received                   (webview.log)
UI → Hub: session_displayed
  session_displayed send                     (webview.log)
UI → Hub: feedback_response
  pipeline: ui→hub:feedback_response         (extension.log)
  feedback_response send                     (webview.log)
Hub → MCP: feedback_result
  pipeline: hub→mcp:feedback_result          (extension.log)
  [requestFeedback] resolved session=fb-xxx  (mcp-server.log)
```

## 常用 grep 命令

### 按 session 追踪全链路

```bash
SESSION=fb-mr6ewur8-8em8pd
rg "$SESSION" ~/.config/mcp-feedback-enhanced/logs/{extension,mcp-server,webview}-*.log
jq -c "select(.feedbackSessionId==\"$SESSION\")" ~/.config/mcp-feedback-enhanced/logs/session-journal.jsonl
```

### 按 trace 追踪（Cursor 会话）

```bash
TRACE=d1c29e7d-d7ea-4dab-8f17-fd9156f55e25
rg "trace=$TRACE|cursorTrace=$TRACE" ~/.config/mcp-feedback-enhanced/logs/{extension,mcp-server}-*.log
```

### 连接/断连问题

```bash
rg 'mcp_detach|mcp disconnected|bridge dead|UNDELIVERED|protocol_error|WS closed' \
  ~/.config/mcp-feedback-enhanced/logs/extension-*.log

rg 'session_bound|feedback_request_sent|cursor_keepalive|stdio_keepalive' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log

rg 'connection_health|forceReconnect|queueOutbound|bridge_deliver_skipped' \
  ~/.config/mcp-feedback-enhanced/logs/webview-*.log

rg 'hydrateAfterStateSync|server_pending_snapshot|restored waiting_count|UI missing.*waiting tab' \
  ~/.config/mcp-feedback-enhanced/logs/webview-*.log
```

### 对照 Cursor Usage 账单

```bash
# 任何可能导致「自动扣 Request」的结束点
rg 'event=request_billing_risk|event=request_waste_guard' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log

# 试验：progress-only 等待（KEEPALIVE=0，每 10min progress）
rg 'wait_config|progress_send_ok|progress_send_fail|progress_over_total|wait_lifecycle|request_billing_risk' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log

# progress 是否真正送达 Cursor（ok=SDK接受, fail=被拒绝）
rg 'event=progress_send_ok|event=progress_send_fail|event=progress_send_skipped' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log

# 面板回复 → Hub → MCP（含等待时长、mcp_detached）
rg 'panel_submit_no_effect|panel_submit_delivered|panel_submit_attempt|wait_lifecycle.*resolve|agent_turn_status' \
  ~/.config/mcp-feedback-enhanced/logs/

# 「面板发了但没效果」专用（reason 见下表）
rg 'event=panel_submit_no_effect' ~/.config/mcp-feedback-enhanced/logs/

# Cursor 硬超时嫌疑（WS 在 ~35min+ 被关，未到我们 keepalive）
rg 'reason=cursor_hard_timeout_suspected' ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log
```

## Cursor request best-effort 保持策略

当前目标是尽量保持同一个 Cursor `interactive_feedback` tool call 等待用户回复，而不是主动结束旧 request 后再开新 Agent turn。它是 best-effort：如果 Cursor 自身仍关闭 MCP/tool call，插件只能感知并保留 pending session，不能复活已经断开的 Cursor request。

1. **MCP progress 保活**

   等用户反馈期间，MCP server 每 `25s` 发一次 `notifications/progress`。目标是让 Cursor 认为这个 tool call 仍在活跃，而不是空等超时。新请求日志应显示：

   ```text
   progress_interval_ms=25000 cursor_idle_risk=false
   event=progress_send_ok
   ```

   若看到 `progress_interval_ms=600000` 或 `cursor_idle_risk=true`，说明仍是旧运行时或旧配置，先 Reload Window + MCP 关开。

2. **不主动 auto-resolve**

   当前部署把 `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS` 设为 `0`。插件不会为了保活自己返回一个占位反馈来结束 request。策略是“尽量挂住当前 Cursor request”，不是“定时结束再开新 turn”。

3. **同 trace 去重和复用**

   如果 Cursor/规则又触发重复 `interactive_feedback`，Hub 会识别同一个 trace 下已有 pending session，返回 `already_pending` 或复用 transport。MCP 侧不会把它当作用户反馈结束当前等待，避免短时间内多发 Cursor request。

4. **active wait 防 stale sweep**

   Hub 的 WebSocket stale sweep 遇到“有 pending feedback 的 MCP 连接”会保护它，不按普通 idle 连接关闭。日志应显示：

   ```text
   event=stale_sweep action=skip protected=true detail=active_wait
   ```

   该日志会限频，并带 `time_to_zombie_ms`，用于判断离 zombie wait 强制关闭还有多久。

5. **断链后保留 pending session**

   如果 MCP 连接断了，Hub 不直接丢掉面板 session，而是标成 `detached/pending`，让界面还能显示这次等待和回复入口。不过这只是保留上下文，不能复活已经断开的 Cursor request。面板回复若无法送到 live MCP，会记录：

   ```text
   event=feedback_response_queued reason=mcp_detached
   ```

### 判断当前 request 是否还活着

```bash
# 新请求必须是 25s progress 且低 idle 风险
rg 'wait_config|progress_send_ok|progress_send_fail|cursor_idle_risk' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log

# 界面/Hub 是否已经感知断链
rg 'mcp disconnected|event=agent_turn_status|agent_turn_status_received|feedback_response_queued' \
  ~/.config/mcp-feedback-enhanced/logs/{extension,webview}-*.log

# stale sweep 是否保护 active wait
rg 'event=stale_sweep.*active_wait|zombie_wait|time_to_zombie_ms' \
  ~/.config/mcp-feedback-enhanced/logs/extension-*.log
```

| `request_billing_risk.reason` | 含义 | 预期扣 Request？ |
|---|---|---|
| `our_keepalive` | 旧策略或手动配置下主动结束工具 | 可能 1 次（工具完成），但 ji.116+ Agent 不再连环调 |
| `cursor_hard_timeout_suspected` | 等待 ≥35min 后 WS 被关 | 可能 1 次（Cursor 硬超时） |
| `extension_ws_close` | 较短等待时 WS 断开 | 视 Agent 是否重试 |
| `released_duplicate` / `superseded` | 旧版同 trace 重复调用会提前完成旧 MCP wait | 当前版本不应作为 live duplicate 正常路径；新日志应是 `skip_duplicate_active_wait` 或 `trace steal subscribed prior mcp` |

| `panel_submit_no_effect.reason` | 含义 | Cursor 会响应？ |
|---|---|---|
| `session_not_on_hub_queue` | 面板 tab 本地 waiting，Hub 无此 pending | 否（最常见误报断连） |
| `no_pending_session` | Hub 无任何 pending，进全局 queue | 否 |
| `mcp_detached` / `mcp_ws_not_open` | 回复到了 Hub 但 MCP 链路已断 | 否 |
| `transport_queued` | 面板 WS 未就绪，消息排队 | 可能延迟或丢失 |
| `server_pending_snapshot` | hydrate 前捕获到 Hub pending session | 正常；若无此行且随后 `UI missing` → snapshot 为空 |
| `restored waiting_count=0` | hydrate 后无 waiting tab | 异常；查 `pending_sessions_unchanged` 或 Hub pending |

环境变量试验：

| 变量 | 默认 (ji.116) | 说明 |
|---|---|---|
| `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS` | 当前部署为 `0` | `0` = 不主动 auto-resolve，尽量保持当前 Cursor request |
| `MCP_FEEDBACK_CURSOR_PROGRESS_MS` | 当前部署为 `25000` | 等待时每 25s 发送一次 MCP progress，降低 idle 断开概率 |
| `MCP_FEEDBACK_CURSOR_HARD_TIMEOUT_SUSPECT_MS` | `2100000` (35min) | 超过此等待时长且 WS 关闭 → 记为硬超时嫌疑 |

### keepalive 自动释放

```bash
rg 'request_waste_guard|cursor_keepalive_auto_resolve|released_duplicate|keepalive auto-resolve' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log
```

## 常见问题对照

| 现象 | 日志特征 | 根因 | 处理 |
|---|---|---|---|
| 面板显示等待、输入后 Cursor 无响应 | `event=panel_submit_no_effect` | 见下表 reason | Reload + MCP 关开；清理 stale tab |
| Panel 显示 AWAITING SIGNAL | `UNDELIVERED` 或 webview 无 `session_updated received` | bridge 断连 / 消息丢弃 | Reload Window |
| `MCP error -32001: Request timed out` | MCP 无 `cursor_keepalive_auto_resolve`，等待 >60min | Cursor 工具超时 | 50min 内回复；或依赖 keepalive |
| `[keepalive]` 自动返回 | `event=cursor_keepalive_auto_resolve` + `event=request_waste_guard reason=keepalive` | 50min 无回复主动释放；旧版会指示 Agent 再调 feedback **多扣 Request** | ji.116+ 改为 **End turn，勿再调**；grep `request_waste_guard` |
| Usage 莫名 +1 Request（无聊天输入） | `request_waste_guard` / `cursor_keepalive_auto_resolve` / 新版本部署后仍出现 `released_duplicate` | keepalive 完成工具 → Agent 续跑；或旧版 trace_steal 提前完成旧 WS | 当前部署将 `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS=0`，同 trace live duplicate 应 no-op/subscriber；若新日志仍出现 `released_duplicate`，先 Reload Window + MCP 关开 |
| 左右都在等 / 面板 PENDING 但 Agent 在等 | MCP 连 `48201` 面板在 `48202`；或 `feedback_request candidates=* (auto)` | Hub 重启时误路由到别的项目窗口 | Reload 两个窗口 + MCP 关开；ji.113+ 会拒绝错误 hub |
| 面板重连后 `UI missing N waiting tab` | `hydrateAfterStateSync localRestore=yes` 后 `connection_health issues=UI missing`；或 `restored waiting_count=0` | localStorage 覆盖了 Hub pending session | ji.128+ 先 snapshot 再 restore；点 ↻ 或 Reload |
| Hub 重启后 pending 丢失 | 无 `pending_restore`；Hub `pending=0` 但 MCP 仍在等 | 内存 pending 未持久化 | ji.115+ 查 `pending_persist` / `pending_restore` 日志 |
| 面板陈旧 PENDING | `hydrateAfterStateSync` 后 waiting 但 hub pending=0 | localStorage 覆盖 server 状态 | ji.115+ 先 stateSync 再 merge；点 ↻ 手动刷新 |
| `Duplicate superseded` | 旧日志：`released_duplicate` / `request_waste_guard reason=superseded`；新日志：`skip_duplicate_active_wait` / `trace steal subscribed prior mcp` | 同 trace 新 MCP 连接取代旧等待 | 当前版本保留旧 WS 为 subscriber，不应提前完成旧 request；若还有新 `released_duplicate`，说明运行中 extension/MCP 仍是旧版本 |
| `mcp gone, queue pending` | `mcp_detach` + `feedbackDeliver` 缺失 | MCP 断开时用户已回复 | 下次 interactive_feedback 取回 |
| `4/50 waiting` 进度 | `event=progress_send_ok elapsed_min=N` | 正常等待心跳 | 非错误 |

## 日志字段说明

| 字段 | 含义 |
|---|---|
| `session=fb-xxx` | Feedback 会话 ID，跨三层关联 |
| `trace=xxx` | Cursor 对话 trace（CURSOR_TRACE_ID） |
| `mcpConnId=N` | MCP WebSocket 连接序号 |
| `changed=pending+hub` | stateSync 仅在状态变化时记录 |
| `detached=true` | MCP 已断开但 session 仍 pending |
| `elapsed_min=N total_min=50` | 等待进度（分钟） |
| `event=feedback_submitted_broadcast` | Hub 已向面板广播提交确认（extension.log） |
| `event=feedback_submitted_received` | 面板收到提交确认（webview.log） |
| `event=hooks_feedback_tool` | Cursor hooks 放行 interactive_feedback（hooks.log） |
| `action=deny_duplicate_active_wait` | hooks 发现同 trace live wait 后阻断重复 `interactive_feedback`，避免再进入 Hub 形成第二个 MCP wait |
| `event=agent_resume_stall` | submitted 后 30s Agent 未续跑（webview 提示） |
| `event=agent_turn_status_received` | 面板收到 Agent 断开/结束通知（webview.log） |

## hooks ↔ MCP 关联排查

当 Usage 莫名 +1 或 Agent 自动调 feedback 时，用 trace 前 8 位对齐三层：

```bash
TRACE=0498f00a
rg "$TRACE|hooks_feedback_tool|skip_duplicate_active_wait|feedback_request start|trace steal subscribed|released_duplicate|feedback_submitted" \
  ~/.config/mcp-feedback-enhanced/logs/
```

| 只有 hooks、无 MCP `feedback_request start` | Agent 发起了工具但 MCP 仍在等旧 session（stdio 占用） |
| `action=skip_duplicate_active_wait` | hooks 已 no-op 重复 feedback，避免额外 deny/request 完成 |
| 新版本部署后仍有 `released_duplicate` 无 `feedback_submitted_received` | Cursor request 被旧运行时代码提前结束，面板仍显示等待；Reload Window + MCP 关开 |
| 有 `panel_submit_delivered trace=...` 无 Cursor 续跑 | 插件已送达，问题在 Cursor Agent 调度（日志无法观测） |
| 有 `panel_submit_delivered trace=-` | 旧版本可观测性缺口；当前版本应保留 resolve 快照里的 trace |

## 环境变量（mcp.json env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS` | 0 | 不主动 auto-resolve，尽量保持当前 Cursor request |
| `MCP_FEEDBACK_CURSOR_PROGRESS_MS` | 25000 (25s) | 等待用户反馈期间发送 MCP progress 的间隔 |
| `MCP_FEEDBACK_CURSOR_KEEPALIVE_MESSAGE` | `hello` | keepalive 占位文本（非用户输入） |
| `MCP_FEEDBACK_PENDING_MAX_AGE_MS` | 86400000 (24h) | 持久化 pending 过期时间 |

### 手动恢复（面板 ↻）

面板右上角 **↻**（或点击连接状态）触发 `forceReconnect`：
1. 重建 bridge
2. `requestStateSync` 从 Hub 拉最新 pending
3. 日志：`forceReconnect` → `requestStateSync` → `hydrateAfterStateSync`

若仍卡住：`Cmd+Shift+P → Developer: Reload Window` + MCP 关开。


```bash
node --test tests/pipelineLogging.test.js tests/cursorKeepalive.test.js tests/pipelineCoverageMatrix.test.js
```

覆盖矩阵见 `tests/pipelineCoverageMatrix.test.js`，包含 6 个 pipeline hop + keepalive + bridge stale sweep。
