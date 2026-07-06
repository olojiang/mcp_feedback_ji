# MCP Feedback Enhanced（Hunter Fork）

基于 [mcp-feedback-enhanced-vscode](https://github.com/yuanmingchencn/mcp-feedback-enhanced-vscode) **v2.5.1** 的本地定制版。面向 **Cursor / VS Code** 中运行的 AI Agent：在对话过程中弹出 **MCP Feedback 面板**，让用户直接回复，而无需额外浏览器窗口。

**当前版本：`2.5.1-ji.147`**

> **一句话**：让 Cursor Agent 在 IDE 里等你回复——**面板回复免费**，插件自身**不偷吃 Request**，多 workspace、断线重连、Hub 重启都尽量保持同一个 live request 的交互链路。

---

## 为什么选择这个 Fork

| 痛点 | 本 Fork 的解法 |
|------|----------------|
| 每条聊天消息都扣 Request | 用 `interactive_feedback` 面板回复，**不消耗 Cursor Request** |
| Agent 结束就丢上下文 | `stop` hook 零成本提醒再调一次 feedback，不用 `deny` |
| 多窗口 MCP 连错 Hub | 隐式工作区路由 + 6×1s 重发现，避免连到别的项目端口 |
| Hub 重启后左右都在等 | Pending **磁盘持久化**，启动自动 restore + 面板 hydrate |
| 面板重连后 Send 变 QUEUE | **server pending snapshot/restore**，localStorage 不再冲掉 Hub waiting tab |
| 莫名多扣 Cursor Request | **Request waste guard**：keepalive / supersede 完成工具后 **End turn**，禁止连环调 feedback |
| Reload 后重连到旧 session | **live session reattach**，拒绝 stale detached tab 抢占当前 request |
| 第二个 workspace 污染第一个 | **per-workspace storage/lock/registry**，pending、state、runtime 文件按 workspace hash 隔离 |
| 前端误报掉线 | health 检查同时参考 Hub protocol activity，减少空闲 ping timeout 假阳性 |
| 面板发了 Agent 没反应 | **`panel_submit_no_effect`** 结构化日志 + reason 对照表，秒级定位断点 |
| 断网重连级联重试 | Supersede 熔断 + `already_pending` 忽略重复调用 |
| 排查困难 | 统一日轮转日志 + [`troubleshooting.md`](local_docs/troubleshooting.md) |

---

## 亮点

| 能力 | 说明 |
|------|------|
| **零浪费 Request 保护** | 用户通过面板回复 = 免费；多重机制防止插件自身消耗额外 Cursor Request（详见下方） |
| **IDE 内嵌面板** | Agent 调用 `interactive_feedback` 时，消息进入底部 **MCP Feedback Enhanced** 面板，默认不弹浏览器 |
| **多 Tab 并发会话** | 多个 Agent 同时等待反馈时，每个 `session_id` 独立 Tab，可任意顺序回复 |
| **多窗口 / 多项目路由** | 按 workspace hash 注册端口，支持子目录匹配；MCP 自动 discovery + 有限重试 |
| **连接状态可见** | 顶部显示 `v版本 ● Connected :端口 pid=进程号`；版本 skew 横幅提示 Reload |
| **剪贴板与截图** | 面板内复制/粘贴；macOS 支持截图 Cmd+V 读图（Extension Host 侧 `pbpaste` + NSPasteboard） |
| **Pending / Draft** | 无等待会话时可先攒草稿；Send 时合并 pending 队列并清空 PENDING 条 |
| **Pending 磁盘恢复** | Hub 重启后从 `pending-sessions/` 恢复未决 session；面板 boot 先 `state_sync` 再合并 localStorage，避免陈旧 PENDING |
| **Hydrate 防覆盖** | `snapshotServerPendingSessions` → localStorage restore → `restoreServerPendingSessions`；重连后 waiting tab 不丢失 |
| **Live request 复用 (ji.144+)** | stale detached session 不再被当成健康 waiting；面板优先绑定当前 live MCP request |
| **Workspace 强隔离 (ji.145+)** | registry lock、pending 文件、feedback state、localStorage key 全部按 workspace hash 隔离 |
| **Reload 状态隔离 (ji.146+)** | workspace 变更时清理陈旧内存状态，`state_sync` 带 workspace hash 防止旧 payload 污染新 UI |
| **Health 误报抑制 (ji.147)** | 前端 health timeout 不只看 ping，也看最近 Hub protocol message，降低空闲或后台状态误报 |
| **Request waste guard (ji.116+)** | `[keepalive]` / `[released_duplicate]` / `[superseded]` 返回明确 **End turn** 文案，Agent 规则同步，避免多扣 Request |
| **面板投递可观测** | `panel_submit_delivered` / `panel_submit_no_effect`（含 `session_not_on_hub_queue`、`mcp_detached` 等 reason） |
| **账单风险关联** | `event=request_billing_risk` 记录 keepalive / 硬超时 / WS 断连等结束原因，便于对照 Cursor Usage |
| **Agent 链路状态** | `agent_turn_status` 广播 link_lost / cursor_ended；面板 toast 提示回复将入队 |
| **Hub 路由加固** | 无 `project_directory` 时用 agent 隐式工作区过滤，避免连错端口（多窗口死锁） |
| **排查文档** | [`local_docs/troubleshooting.md`](local_docs/troubleshooting.md)：死锁、pending 持久化、↻ 手动恢复、grep 命令 |
| **统一日轮转日志** | extension / mcp-server / webview / hooks 四大子系统统一按天轮转 + 7 天清理；heartbeat 对数节流；passthrough 工具静默 |
| **Deploy 工作流** | `npm run deploy` 自动 bump、编译、同步到 `~/.cursor/extensions/` 并更新 `mcp.json` |
| **487 单测** | 协议路由、pending 恢复、剪贴板、多 Tab、pipeline、workspace 隔离、health timeout、测试隔离等覆盖 |

### Cursor Request 节省机制

本插件的核心价值是**减少 Cursor Request 消耗**——用户通过 MCP 面板回复是免费的（不消耗 Request），而在聊天框输入每条消息都消耗 1 个 Request。

同时，插件自身采用多重保护，避免引入额外消耗：

| 保护机制 | 原理 |
|----------|------|
| **`already_pending` 忽略** | 重复的 `interactive_feedback` 调用不完成工具调用，Cursor 不启动新 Agent 轮次 |
| **`stop` hook + followup_message** | Agent 结束前零成本提醒调用 `interactive_feedback`，不使用 `deny`（deny 会消耗 1 request） |
| **No-op End turn (ji.116+)** | `[keepalive]` / `[released_duplicate]` / `[superseded]` 完成工具后禁止 Agent 再调 feedback |
| **超时 resolve** | MCP 等待超时返回结果而非抛错，避免 Agent 进入错误处理循环 |
| **高阈值 enforcement** | 安全网阈值 50 次工具调用 / 15 分钟，正常使用不触发 |
| **per-workspace 计数** | 多窗口独立计数，互不干扰 |
| **Supersede 防护** | 断网重连时旧 MCP 进程检测到 `superseded` 立即退出，不触发重试级联 |
| **Detached session 防抢占** | 断线后恢复的旧 tab 标记为 detached，不会覆盖当前 live waiting tab |
| **测试 Hub 隔离** | 集成测试强制使用独立 `MCP_FEEDBACK_CONFIG_DIR`，避免测试进程污染真实 Cursor Hub |
| **粘贴韧性** | Bridge 异常时自动降级原生粘贴（Cmd+V），3s 超时检测 + 重连恢复 |
| **Sleep 检测** | macOS 合盖恢复时检测并警告用户 |
| **Cursor keepalive** | 默认 50min 自动释放；可设 `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS=0` 仅靠 progress 撑到硬超时；`request_billing_risk` 记日志 |
| **Session 可追踪** | MCP 日志打印 `session_bound` / `session_id`，便于按 session 或 trace grep |

### 断网 / 合盖 / 到家后还能继续吗？

结论：**短时间断网后，插件会尽力复用原来的 pending session；但 Cursor 后端是否继续同一个 request 取决于 Cursor 自己的长连接与模型服务超时。**

| 场景 | 预期 |
|------|------|
| 短暂断网或 Wi-Fi 切换 | MCP / Hub 会重发现；旧 session 标记 detached，恢复后优先复用 live session |
| 面板还显示 waiting，MCP WS `readyState=1` | 面板回复应直接送达，不会因为插件自己新建 Cursor request |
| Agent 已结束、Cursor 后端已断开 | 回复会进入 pending/QUEUE；需要新的 Cursor 回合继续，是否计入 request 由 Cursor 决定 |
| 长时间合盖、断网回家后再打开 | 可能超过 Cursor 工具调用硬超时；插件会记录 `request_billing_risk` / `panel_submit_no_effect` 方便判断 |

实用判断：看日志里是否有 `panel_submit_delivered ... mcp_ws_ready_state=1`。有这条通常表示插件链路还活着；如果是 `mcp_detached` / `session_not_on_hub_queue`，说明 Cursor 那侧已经不再等当前 session。

---

## 快速安装

### 方式 A：GitHub Release（推荐）

1. 打开 [Releases](https://github.com/olojiang/mcp_feedback_ji/releases)，下载最新 `.vsix`
2. Cursor → Extensions → `...` → **Install from VSIX**
3. 配置 `~/.cursor/mcp.json`（见下方示例），**Developer: Reload Window**

### 方式 B：源码安装

```bash
git clone https://github.com/olojiang/mcp_feedback_ji.git
cd mcp_feedback_ji
chmod +x install.sh
./install.sh          # 复制到 ~/.cursor/extensions/
# 或
./install.sh --link   # 开发时用符号链接，改代码即时生效
```

然后在 Cursor 执行：**Developer: Reload Window**

安装脚本会自动：

1. **`npm install && npm run compile`** 从源码构建 `out/` 与 `mcp-server/dist/`
2. 将扩展部署到 `~/.cursor/extensions/mcp-feedback.mcp-feedback-enhanced-2.5.1-universal/`
3. 更新 `~/.cursor/mcp.json`，指向 `mcp-server/dist/index.js`

> **注意**：面板左上角 **↻** 仅重连 WebSocket；升级版本后必须 **Reload Window**（每个 Cursor 窗口各做一次）。

### 开发

```bash
git clone https://github.com/olojiang/mcp_feedback_ji.git
cd mcp_feedback_ji
npm install
npm run compile
npm run verify:install    # 不 Reload 即可验证编译产物
./install.sh              # 自动 verify → 安装 → 再 verify
npm run deploy            # bump 版本 + 编译 + 同步到已安装扩展
```

`verify-install.js` 会检查：版本号、CSP、HTML 占位符注入、单测、已运行 Extension 的 `/health` + WebSocket（无需 Cursor Reload）。

---

## 面板一览

```
v2.5.1-ji.147  ● Connected :48202 pid=44671   ↻
Chat fb-abc123  |  Chat fb-def456
─────────────────────────────────────────────
  AI  请确认是否继续…
  You  Continue
─────────────────────────────────────────────
  [输入框 — 可拖拽 splitter 伸缩]     [Send]
```

- **绿点 / 橙点**：Tab 等待回复 vs 已结束
- **Degraded**：点击状态栏查看 `UI missing waiting tab` / `Agent disconnected` 等 reason
- **Close resolved**：批量关闭已回复 Tab
- **DBG**：导出 debug report；含 MCP 日志 tail、trace 过滤
- **Quick replies**：Continue / Looks good / Fix / Finished 等（可通过设置覆盖文案）

---

## 核心功能

### 1. 连接与多项目路由

**问题**：多 Cursor 窗口时 MCP 连错端口、面板 `Disconnected` 或 `AWAITING SIGNAL`。

**修复要点**：

| 改动 | 说明 |
|------|------|
| 按 workspace hash 注册 | `~/.config/mcp-feedback-enhanced/servers/{hash}.json` |
| 目录匹配 | `exact / ancestor / descendant` 项目路径 |
| cwd 推断 | 未传 `project_directory` 时从 MCP cwd + agent 隐式工作区匹配已注册 Hub |
| Rediscovery | 扩展 WS 断连时 6×1s 重发现，等待 Hub 重启 |
| Pending 持久化 | Hub shutdown / enqueue / mcp_detach 写入磁盘；启动时 restore 并 replay 到面板 |
| 面板 hydrate | boot 先 `state_sync`，再 snapshot → localStorage → restore；`server_pending_snapshot` / `restored waiting_count` 可 grep 验证 |
| Workspace 隔离 | pending / registry / feedback state / panel storage 使用 workspace hash，多个 Cursor workspace 不共享运行状态 |
| Health timeout 降噪 | 最近收到 Hub protocol message 时不把单次 ping timeout 当作断线 |
| 禁用 browser fallback | 默认不弹浏览器；需 `MCP_FEEDBACK_BROWSER_FALLBACK=1` |
| Stale webview 修复 | Reload 后强制刷新 panel HTML；early boot + bridge 广播 dedupe |

### 2. 多 Tab 会话

- 每次并发 `interactive_feedback` → 新 Chat Tab（`session_id`）
- MCP WebSocket 重连复用 pending session，不覆盖旧 Tab
- 关闭 Tab：单击 ×、右键菜单、Close resolved
- 已 resolved 的 Tab 上 Send → 自动路由到最新 waiting session

### 3. 剪贴板

| 问题 | 修复 |
|------|------|
| 复制无内容 | WS `clipboard_write` + toast 确认 |
| 无法输入 | 移除抢焦点的 `focus-webview` |
| 截图粘贴 | macOS Extension 读图；paste 去重 |
| 链接粘贴两遍 | 单路径 keydown → WS |

### 5. 死锁、断连与多 workspace 隔离（ji.115–ji.147）

当 Agent 显示 `waiting for user feedback`、面板却卡在 `PENDING` 或按钮变成 **QUEUE** 时，通常是 **Hub 连错端口**、**Hub 重启丢内存**、**面板重连冲掉 waiting tab** 或 **MCP 断连**。

| 机制 | 行为 |
|------|------|
| `pending-sessions/*.json` | enqueue / mcp_detach / shutdown 时落盘 |
| Hub `start()` restore | 重启后 `pending_restore` 回放 `session_updated` 到面板 |
| 面板 hydrate | `state_sync` → `server_pending_snapshot` → localStorage → `restored waiting_count` |
| Workspace hash 隔离 | registry lock、pending 文件、feedback state、panel storage 不跨 workspace 复用 |
| Live session reattach | 旧 detached session 不抢占当前 live request；避免 Reload 后误把 Send 变 Queue |
| `agent_turn_status` | MCP 断连时面板 toast「Agent link lost」，回复进队列 |
| `panel_submit_no_effect` | 结构化 reason，对照 troubleshooting 表 |
| 手动 ↻ | 触发 `forceReconnect` + `requestStateSync` |
| 排查 | 见 [`local_docs/troubleshooting.md`](local_docs/troubleshooting.md) |

### 6. 日志与诊断

| 文件 | 内容 |
|------|------|
| `logs/extension.log` | WS Hub、feedback 入队/出队 |
| `logs/mcp-server.log` | discovery、project 匹配 |
| `logs/webview-YYYY-MM-DD.log` | 面板 boot、bridge、resolve（保留 7 天） |
| `logs/webview.log` | 当天日志别名（symlink） |
| `logs/hooks.log` | Cursor hooks pending 注入 |

命令：**MCP Feedback Enhanced: Clear Today's Panel Log**

HTTP：`http://127.0.0.1:<port>/health`、`/docs`、`/openapi.json`

---

## 目录结构

```
mcp_feedback_ji/
├── readme.md
├── changelog.md
├── install.sh
├── src/                      # Extension TypeScript
│   ├── server/wsHub.ts       # WS Hub
│   ├── feedbackViewProvider.ts
│   └── dailyRotatingLog.ts
├── static/                   # 面板 UI 源码
│   ├── panel.html
│   ├── panelApp.js
│   └── panelState.js
├── mcp-server/src/           # MCP Server
├── out/                      # compile 产物
├── tests/
└── resources/icon.svg
```

---

## MCP 配置

`install.sh` / `deploy` 会自动写入 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "mcp-feedback-enhanced": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "MCP_FEEDBACK_VERSION": "2.5.1-ji.147"
      }
    }
  }
}
```

### 环境变量（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `MCP_FEEDBACK_BROWSER_FALLBACK` | 禁用 | 设为 `1` 启用浏览器 fallback |
| `MCP_FEEDBACK_PROJECT_DIRECTORY` | 未设置 | MCP 侧显式项目目录 |
| `MCP_FEEDBACK_VERSION` | deploy 写入 | 启动日志打印版本 |
| `MCP_FEEDBACK_KILL_MCP_ON_DEPLOY` | 未设置 | deploy 时 SIGTERM 旧 MCP 进程 |
| `MCP_FEEDBACK_CURSOR_KEEPALIVE_MS` | 3000000 (50min) | 设为 `0` = 仅靠 progress 等待；否则超时自动 resolve |
| `MCP_FEEDBACK_CURSOR_HARD_TIMEOUT_SUSPECT_MS` | 2100000 (35min) | 等待超过此值且 WS 关闭 → 记为硬超时嫌疑 |
| `MCP_FEEDBACK_CURSOR_PROGRESS_MS` | 600000 (10min) | MCP 等待期间 progress 通知间隔 |
| `MCP_FEEDBACK_PENDING_MAX_AGE_MS` | 86400000 (24h) | 磁盘 pending session 过期时间 |

---

## 测试

```bash
npm test                  # 全量单测
npm run test:coverage     # 覆盖率 gate
npm run test:e2e          # Playwright
```

---

## 故障排查

完整指南见 **[`local_docs/troubleshooting.md`](local_docs/troubleshooting.md)**（死锁、版本 skew、pending 恢复、grep 命令）。

| 现象 | 处理 |
|------|------|
| 左右都在等（Agent waiting + 面板 PENDING/QUEUE） | 查 `hydrateAfterStateSync` / `UI missing waiting tab`；**Reload Window** + ↻；ji.147 已覆盖 hydrate、workspace 隔离、health 降噪 |
| 面板发了 Cursor 无响应 | grep `panel_submit_no_effect` 看 reason |
| 面板 Disconnected | **Reload Window** 或点 ↻；查 `extension.log` |
| Connected 但 Panel 空 | 多为旧 webview 缓存；Reload；查 `webview.log` 的 `bootReport` |
| 版本号不更新 | ↻ 不够；需 **Developer: Reload Window**；多窗口各 Reload 一次 |
| Deploy 横幅 | 磁盘新版本已 deploy，Extension Host 内存仍是旧版 → Reload |
| Agent 无反馈进面板 | 查 MCP 日志 `Feedback via extension port=`；检查 `project_mismatch` |
| 多窗口 Extension unavailable | Agent 应传 `project_directory` 或设 `MCP_FEEDBACK_PROJECT_DIRECTORY` |
| 多 workspace 状态串台 | 确认状态栏 workspace 名称 / hash；ji.145+ 按 workspace hash 隔离 registry、pending、state |
| Health 显示 Degraded 但能发送 | 先看是否 `panel_submit_delivered`；可能是 health timeout 假阳性，ji.147 已降低误报 |
| 面板内无法粘贴 | Bridge 异常时自动降级为原生粘贴；若仍失败可 Reload Window |
| 截图粘贴失败 | 仅 macOS Extension 读图；查 `clipboard-paste ok image=true` |

**一次完整调用对照**：MCP `feedback_request start` → `discover: accept` → Extension `enqueued session=fb-...` → 面板新 Tab。

---

## 换机器清单

1. 克隆仓库或安装 Release VSIX
2. Node.js >= 18
3. `./install.sh` 或 VSIX 安装
4. **Developer: Reload Window**
5. 底部面板确认 `Connected :端口`
6. Agent 触发 `interactive_feedback` 验证

---

## 与上游的关系

- **上游**：Open VSX / GitHub `mcp-feedback-enhanced-vscode` v2.5.1
- **本 Fork**：完整 TS 源码，`npm run compile` 生成产物
- **升级上游**：合并 `src/` / `static/` / `mcp-server/src/` 后跑全量测试

---

## 许可证

MIT License，见 [LICENSE.txt](./LICENSE.txt)。
