# Cursor Request 浪费对比分析

对比仓库: `shenghanqin/mcp-feedback-enhanced-vscode-good` (分支: `fix/cursor-single-feedback-session`)
本仓库: `mcp_feedback_ji` (版本: 2.5.1-ji.89)

## 核心结论

对方的实现通过 **单 session 模型 + `already_pending` 不完成工具调用 + 多 hook 拦截** 来避免浪费。
我方的实现通过 **多 session 队列 + trace 路由 + superseded 错误 + stdio keepalive** 来管理，但在某些边缘场景下会导致额外 request 消耗。

## 关键差异

### 1. `already_pending` 处理 — 最核心的差异

**对方 (extensionClient.ts):**
```js
if (msg.status === 'already_pending') {
    return; // 不 resolve，保持等待
}
```
当 Agent 重复调用 `interactive_feedback` 时，Hub 返回 `already_pending`，MCP client **不完成工具调用**，继续等待真正的用户回复。
- Cursor 看到工具仍在执行中 → 不启动新 Agent 轮次 → **不消耗 request**

**我方:**
重复调用 → Hub 发送 `sendError` (superseded) → MCP 工具调用以错误完成 → Cursor 启动新 Agent 轮次处理错误 → **消耗 1 个 request**

### 2. 多 Hook 事件注册

**对方 (hooks.ts):** 注册 5 个 hook 事件
- `preToolUse` — 标准工具调用拦截
- `stop` — Agent 结束前的安全网，使用 `followup_message` 注入
- `beforeShellExecution` — Shell 执行前无条件拦截
- `beforeMCPExecution` — MCP 调用前无条件拦截
- `subagentStart` — 子 Agent 启动前拦截

**我方:** 只注册 `preToolUse`，其他事件已退役

**影响:** 我方的 pending feedback 只在 `preToolUse` 时投递，其他执行路径上的 pending 无法拦截。

### 3. Session 模型

**对方:** 单 session (`pending: PendingFeedback | null`)
- 最多一个等待中的 session
- 重复调用时更新 transport，不创建新 session
- 简单，但不支持多 trace 并行

**我方:** 队列模型 + trace 路由
- 支持多 session 并行
- trace_id 精确路由
- 更灵活但更复杂

### 4. 超时处理

**对方:** Hub 端可配置超时 (从 MCP 传入 `timeout_ms`)
- 超时 → resolve 而非 reject
- 返回 `{ status: 'timeout' }` → toolHandlers 特殊处理不消耗用户 request

**我方:** MCP 端 24h 硬超时
- 超时 → reject → 错误完成 → Agent 处理错误 → 消耗 request
- 有 stdio keepalive 防止连接断开（对方没有）

### 5. `stop` hook 的 `followup_message`

**对方:** Agent 结束时通过 `followup_message` 注入消息
- 不使用 `permission: deny`
- 不消耗额外 request
- 有 `STOP_LOOP_LIMIT = 3` 防止无限循环

**我方:** 没有 `stop` hook（已退役，因为曾导致无限循环）

## 各自的优势

### 对方优势
1. `already_pending` 不完成工具 — 最大的 request 节省
2. 多 hook 覆盖 — pending 投递更及时
3. `stop` hook + followup_message — 不通过 deny 消耗 request
4. 超时 resolve 而非 reject — 不触发错误处理轮次
5. usage logging — 可观测性

### 我方优势
1. trace 路由 — 多 session 场景更精确
2. superseded MCP WS 释放 — 对方没有释放旧 WS，导致悬挂
3. stdio keepalive — 防止 MCP 连接断开
4. per-workspace feedback state — 多窗口不干扰
5. session journal — 可审计
6. sleep-resume 检测 — Power Nap 保护

## 应该吸收的改进

### 高优先级
1. **`already_pending` 忽略模式** — 在 extensionClient.ts 中，当收到 `already_pending` 时不 resolve，继续等待
2. **超时 resolve 而非 reject** — 避免错误触发新 Agent 轮次
3. **`stop` hook 重新启用** — 使用 `followup_message` 而非 `deny`，加上循环限制

### 中优先级
4. **多 hook 注册** — 增加 `beforeShellExecution`、`beforeMCPExecution`、`subagentStart`
5. **usage logging** — 添加使用日志模块

### 低优先级（已有替代方案）
6. 单 session 模型 — 我方的 trace 路由已足够
7. Hub 端超时 — 我方的 stdio keepalive 已解决连接断开问题

## 已实施的改进

### 第一批（基础优化）
1. enforcement 阈值: maxToolCalls 15→50, maxMinutes 5→15
2. MCP 重连: rediscovery 6→3, extensionAttempts 3→2
3. 清空 FEEDBACK_REMINDER（去掉冗余的"重新读 rules"提示）
4. 精简 hook fmtAgent 和 enforcement deny 消息
5. feedback-state.json 改为 per-workspace 独立计数
6. 同 WS 重复 interactive_feedback：改为 `already_pending` 状态
7. Power Nap 休眠恢复主动检测告警

### 第二批（吸收对比仓库经验）
8. extensionClient: `already_pending` 不完成工具调用，继续等待真正的用户回复
9. extensionClient: 超时 resolve 而非 reject，避免错误触发新 Agent 轮次
10. toolHandlers: 处理 already_pending/timeout 非正常状态，返回提示而非用户反馈
11. 重新启用 stop hook，使用 `followup_message` 投递 pending（不使用 deny，不消耗 request）
12. 重构 consumePending 为独立函数，复用于 stop 和 preToolUse
