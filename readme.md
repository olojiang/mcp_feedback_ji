# MCP Feedback Enhanced（Hunter Fork）

基于 [mcp-feedback-enhanced-vscode](https://github.com/yuanmingchencn/mcp-feedback-enhanced-vscode) **v2.5.1** 的本地定制版，修复了多窗口连接、剪贴板、Tab 管理等实际问题，便于在 **Cursor 重装** 或 **换机器** 后快速恢复。

当前版本：`2.5.1-ji.57`

基于上游源码开发：`src/`（TypeScript）+ `static/`（面板 UI）+ `mcp-server/src/`。

---

## 快速安装

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

### 开发

```bash
git clone https://github.com/olojiang/mcp_feedback_ji.git
cd mcp_feedback_ji
npm install
npm run compile
npm run verify:install    # 不 Reload 即可验证编译产物
./install.sh              # 自动 verify → 安装 → 再 verify
```

`verify-install.js` 会检查：版本号、CSP、HTML 占位符注入、单测、已运行 Extension 的 `/health` + WebSocket（无需 Cursor Reload）。

---

## 功能与修复摘要

### 1. 连接问题修复（多窗口 / 多项目路由）

**问题**：多个 Cursor 窗口同时打开时，MCP Server 可能连到错误窗口的 WebSocket，面板显示 `AWAITING SIGNAL` 或消息发错面板；多项目共享 `current-server.json` 导致路由混乱。

**修复**：

| 改动 | 说明 |
|------|------|
| 按工作区 hash 注册 | 每个项目写入 `~/.config/mcp-feedback-enhanced/servers/{hash}.json`，避免全局抢端口 |
| 子目录 / 父目录匹配 | `project_directory` 支持 `exact / ancestor / descendant`（如 workspace 根 `llm-gateway`，Agent 指向 `llm-gateway/provider_mock`） |
| 无 `project_directory` 时的 cwd 推断 | 多窗口下不随机路由；若 MCP cwd 落在某一已注册 workspace 内，则自动选中该 Extension |
| 有限 rediscovery | 扩展重启或 registry 短暂为空时，同一次 `interactive_feedback` 内最多重试 6 轮 discovery |
| 默认禁用 browser fallback | 不再弹出 `127.0.0.1:随机端口` 浏览器页；需设置 `MCP_FEEDBACK_BROWSER_FALLBACK=1` 才启用 |
| 健康检查与重连 | 面板显示 `Connected :端口 pid=进程号`；点击状态栏或 ↻ 可强制重连 |

**日志**：

- Extension：`~/.config/mcp-feedback-enhanced/logs/extension.log`
- MCP Server：`~/.config/mcp-feedback-enhanced/logs/mcp-server.log`

---

### 2. 多 Tab 会话支持

**能力**：

- 每次**并发** `interactive_feedback` 调用对应一个 **Chat Tab**（`session_id`）；MCP WebSocket 重连时复用 pending session，不覆盖旧 Tab
- 绿点 / 橙点：等待回复 vs 已结束
- 可切换 Tab 任意顺序回复（非 FIFO）
- **关闭 Tab**：单击 `×`、右键菜单（Close / Close Others / Close to the Left / Close All Resolved）、工具栏「Close resolved」

**实现文件**：`out/webview/panelState.js`、`out/webview/panel.html`

---

### 3. MCP 连接状态与端口显示

面板顶部状态栏：

```
v2.5.1-ji.30   ● Connected :48201 pid=20071   ↻
```

- **Connected :端口**：当前 WebSocket 连到的 Extension 端口（48200–48300 范围）
- **pid**：Extension 进程号，便于与日志对照
- **↻**：强制断开并重连

`connection_established` 消息携带 `port`、`pid`、`workspaces` 信息。

---

### 4. 剪贴板（复制 / 粘贴图片 / 链接去重）

**问题**：Webview 内复制无内容、粘贴双图、无法输入、截图 Cmd+V 无反应。

**修复**：

| 问题 | 根因 | 修复 |
|------|------|------|
| Copied 但剪贴板为空 | `Dp` 路由未转发 `onClipboardWrite` | 补全 WS 协议转发；成功后 `clipboard_write_ok` 再 toast |
| 无法输入 | `focus-webview` 抢焦点 | 移除输入框上的 `focus-webview` 调用 |
| 截图粘贴无反应 | `electron.clipboard` 在 Extension Host 不可用 | macOS：`pbpaste` + `NSPasteboard`（osascript JXA） |
| 链接粘贴两遍 | WS + 原生 paste 竞态 | `shouldBlockDuplicatePaste`；文本仅 keydown→WS 单路径 |
| Reload 后假连接 / 彻底断开 | Webview 缓存旧端口；注册表 stale PID | `syncServer` 刷新 HTML；`/health` 校验；MCP 3 次重试发现 |

---

## 目录结构

```
mcp_feedback_ji/
├── README.md
├── install.sh
├── src/                      # Extension TypeScript 源码
│   ├── server/wsHub.ts       # WS Hub + 剪贴板 handler
│   └── utils/clipboardImage.ts
├── static/                   # 面板源码（generate-webview 构建入口）
│   ├── panel.html
│   └── panelState.js
├── mcp-server/src/           # MCP Server TypeScript 源码
├── out/                      # npm run compile 产物
├── tests/
└── resources/icon.svg
```

---

## 换机器 / 重装 Cursor 清单

1. 克隆本仓库到目标机器
2. 确保已安装 **Node.js >= 18**
3. 运行 `./install.sh`
4. **Developer: Reload Window**
5. 打开底部面板 **MCP Feedback Enhanced**，确认 `Connected :端口`
6. 在 Agent 中触发 `interactive_feedback` 验证 Tab 与反馈流程

### MCP 配置示例（`~/.cursor/mcp.json`）

`install.sh` 会自动写入，手动配置时参考：

```json
{
  "mcpServers": {
    "mcp-feedback-enhanced": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp_feedback_ji/mcp-server/dist/index.js"]
    }
  }
}
```

### 环境变量（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `MCP_FEEDBACK_BROWSER_FALLBACK` | 未设置（禁用） | 设为 `1` 启用浏览器 fallback |
| `MCP_FEEDBACK_PROJECT_DIRECTORY` | 未设置 | 显式指定 MCP 侧项目目录；未传 `project_directory` 时用于 cwd 推断 |
| `MCP_FEEDBACK_VERSION` | 未设置 | 由 `install.sh` / `deploy.js` 写入，启动日志打印实际版本 |
| `MCP_FEEDBACK_DEV` | 未设置 | 开发时 webview 热重载 |

---

## 运行测试

```bash
cd mcp_feedback_ji
node --test tests/*.test.js
```

覆盖：多 Tab、剪贴板、协议路由、粘贴去重、反馈队列、workspace discovery、MCP 重连等（76 项）。

---

## 故障排查

| 现象 | 检查 |
|------|------|
| 面板 Disconnected | 点击 ↻ 或 Reload Window；查 `extension.log` 是否有 `server started` |
| 面板 Connected 但对话报未连接 | 多窗口端口错乱或 stale registry | 点击 ↻；查 MCP 输出或 `mcp-server.log` 的 `discover:` 行 |
| Agent 无反馈进面板 | 查 MCP 日志是否 `Feedback via extension port=...`；若见 `project_mismatch`，检查 `have=` / `want=` 是否应为 ancestor/descendant 关系 |
| `Extension unavailable` 且 rediscover 6 次 | 多为**未传 `project_directory` 且同时开了多个 Cursor 窗口**；Agent 应传 workspace 路径，或在 `mcp.json` 设置 `MCP_FEEDBACK_PROJECT_DIRECTORY` |
| `feedbackRequest failed: Server shutting down` | 通常发生在 deploy / Reload Window 窗口期；重试或等扩展重启后再调用 |
| 匹配成功但只更新旧 Tab、无新会话 | 查 `extension.log`：并发调用应见 `enqueued session=fb-...`；仅 MCP 重连复用 transport 时才见 `transport updated session=...` |
| 复制无效 | 日志搜 `clipboard-write ok` |
| 截图粘贴失败 | 日志搜 `clipboard-paste ok image=true`；仅 macOS 支持 Extension 读图 |
| Tab 过多 | 右键 Tab → Close All Resolved，或点「Close resolved」 |

### 日志位置与关联排查

| 层级 | 文件 / 位置 | 关键日志 |
|------|-------------|----------|
| **MCP Server**（后端路由） | Cursor → Output → `MCP: user-mcp-feedback-enhanced`；或 `~/.config/mcp-feedback-enhanced/logs/mcp-server.log` | `feedback_request start project=...` → `discover: accept/skip ... have=... want=...` → `feedback_request candidates=port:pid` → `Feedback via extension port=...` |
| **Extension**（WS Hub） | `~/.config/mcp-feedback-enhanced/logs/extension.log` | `server started: port=... ws=[...]` → `feedbackRequest: project=...` → `enqueued session=fb-...`（新 Tab）或 `transport updated session=...`（MCP 重连复用） |
| **注册表**（目录↔端口） | `~/.config/mcp-feedback-enhanced/servers/*.json` | `projectPath` + `port` + `pid`，与 MCP 日志里的 `candidates=` 对照 |
| **Hooks** | `~/.config/mcp-feedback-enhanced/logs/hooks.log` | preToolUse pending 注入、rules refresh |
| **HTTP 诊断** | `http://127.0.0.1:<port>/health`、`/docs`、`/openapi.json` | 本地 OpenAPI 与 curl 示例，绑定 127.0.0.1 |

**一次完整调用的对照顺序**：

1. MCP：`feedback_request start project=/path/to/workspace`
2. MCP：`discover: accept port=48200 pid=...`（或 `skip ... project_mismatch have=... want=...`）
3. MCP：`feedback_request candidates=48200:pid(hash.json)`
4. MCP：`Feedback via extension port=48200 pid=...`
5. Extension：`feedbackRequest: project=/path/to/workspace`
6. Extension：`feedbackRequest: enqueued session=fb-xxxxx`（应出现新 Tab）

面板顶部 `Connected :48200 pid=96795` 中的 port/pid 应与注册表 JSON 及 MCP `candidates=` 一致。

---

## 与上游的关系

- **上游**：Open VSX / GitHub `mcp-feedback-enhanced-vscode` v2.5.1
- **本 Fork**：完整 TypeScript 源码（`src/` + `mcp-server/src/` + `static/`），`npm run compile` 生成 `out/` 与 `mcp-server/dist/`
- **升级上游时**：对比上游 tag，合并 `src/` / `static/` / `mcp-server/src/` 改动后跑全量测试

---

## 许可证

继承上游 MIT License，见 [LICENSE.txt](./LICENSE.txt)。
