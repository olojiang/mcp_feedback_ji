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
```

### keepalive 自动释放

```bash
rg 'cursor_keepalive_auto_resolve|keepalive auto-resolve|\[keepalive\]' \
  ~/.config/mcp-feedback-enhanced/logs/mcp-server-*.log
```

## 常见问题对照

| 现象 | 日志特征 | 根因 | 处理 |
|---|---|---|---|
| Panel 显示 AWAITING SIGNAL | `UNDELIVERED` 或 webview 无 `session_updated received` | bridge 断连 / 消息丢弃 | Reload Window |
| `MCP error -32001: Request timed out` | MCP 无 `cursor_keepalive_auto_resolve`，等待 >60min | Cursor 工具超时 | 50min 内回复；或依赖 keepalive |
| `[keepalive]` 自动返回 | `event=cursor_keepalive_auto_resolve` | 50min 无回复，主动释放 | Agent 会再调 interactive_feedback |
| 左右都在等 / 面板 PENDING 但 Agent 在等 | MCP 连 `48201` 面板在 `48202`；或 `feedback_request candidates=* (auto)` | Hub 重启时误路由到别的项目窗口 | Reload 两个窗口 + MCP 关开；ji.113+ 会拒绝错误 hub |
| Hub 重启后 pending 丢失 | 无 `pending_restore`；Hub `pending=0` 但 MCP 仍在等 | 内存 pending 未持久化 | ji.115+ 查 `pending_persist` / `pending_restore` 日志 |
| 面板陈旧 PENDING | `hydrateAfterStateSync` 后 waiting 但 hub pending=0 | localStorage 覆盖 server 状态 | ji.115+ 先 stateSync 再 merge；点 ↻ 手动刷新 |
| `Duplicate superseded` | `trace_duplicate_blocked` / `already_pending` | 同 trace 重复调用 | 正常，勿重试 |
| `mcp gone, queue pending` | `mcp_detach` + `feedbackDeliver` 缺失 | MCP 断开时用户已回复 | 下次 interactive_feedback 取回 |
| `4/50 waiting` 进度 | `cursor_progress_notification elapsed_min=N` | 正常等待心跳 | 非错误 |

## 日志字段说明

| 字段 | 含义 |
|---|---|
| `session=fb-xxx` | Feedback 会话 ID，跨三层关联 |
| `trace=xxx` | Cursor 对话 trace（CURSOR_TRACE_ID） |
| `mcpConnId=N` | MCP WebSocket 连接序号 |
| `changed=pending+hub` | stateSync 仅在状态变化时记录 |
| `detached=true` | MCP 已断开但 session 仍 pending |
| `elapsed_min=N total_min=50` | 等待进度（分钟） |

## 环境变量（mcp.json env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS` | 3000000 (50min) | 自动释放前等待时间 |
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
