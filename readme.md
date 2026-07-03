# MCP Feedback Enhanced（Hunter Fork）

基于 [mcp-feedback-enhanced-vscode](https://github.com/yuanmingchencn/mcp-feedback-enhanced-vscode) **v2.5.1** 的本地定制版。面向 **Cursor / VS Code** 中运行的 AI Agent：在对话过程中弹出 **MCP Feedback 面板**，让用户直接回复，而无需额外浏览器窗口。

**当前版本：`2.5.1-ji.85`**

---

## 亮点

| 能力 | 说明 |
|------|------|
| **IDE 内嵌面板** | Agent 调用 `interactive_feedback` 时，消息进入底部 **MCP Feedback Enhanced** 面板，默认不弹浏览器 |
| **多 Tab 并发会话** | 多个 Agent 同时等待反馈时，每个 `session_id` 独立 Tab，可任意顺序回复 |
| **多窗口 / 多项目路由** | 按 workspace hash 注册端口，支持子目录匹配；MCP 自动 discovery + 有限重试 |
| **连接状态可见** | 顶部显示 `v版本 ● Connected :端口 pid=进程号`；版本 skew 横幅提示 Reload |
| **剪贴板与截图** | 面板内复制/粘贴；macOS 支持截图 Cmd+V 读图（Extension Host 侧 `pbpaste` + NSPasteboard） |
| **Pending / Draft** | 无等待会话时可先攒草稿；Send 时合并 pending 队列并清空 PENDING 条 |
| **按天轮转日志** | `webview-YYYY-MM-DD.log` 保留 7 天；`webview.log` 为当天别名；支持一键清空 |
| **Deploy 工作流** | `npm run deploy` 自动 bump、编译、同步到 `~/.cursor/extensions/` 并更新 `mcp.json` |
| **312+ 单测** | 协议路由、剪贴板、多 Tab、pipeline、E2E 等全覆盖 |

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
v2.5.1-ji.85   ● Connected :48201 pid=20071   ↻
Chat fb-abc123  |  Chat fb-def456
─────────────────────────────────────────────
  AI  请确认是否继续…
  You  Continue
─────────────────────────────────────────────
  [输入框 — 可拖拽 splitter 伸缩]     [Send]
```

- **绿点 / 橙点**：Tab 等待回复 vs 已结束
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
| cwd 推断 | 未传 `project_directory` 时从 MCP cwd 匹配已注册 workspace |
| Rediscovery | 扩展重启时同一次调用内最多 6 轮 discovery |
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

### 4. 日志与诊断

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
        "MCP_FEEDBACK_VERSION": "2.5.1-ji.85"
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

---

## 测试

```bash
npm test                  # 全量（313 tests）
npm run test:coverage     # 覆盖率 gate
npm run test:e2e          # Playwright
```

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 面板 Disconnected | **Reload Window** 或点 ↻；查 `extension.log` |
| Connected 但 Panel 空 | 多为旧 webview 缓存；Reload；查 `webview.log` 的 `bootReport` |
| 版本号不更新 | ↻ 不够；需 **Developer: Reload Window**；多窗口各 Reload 一次 |
| Deploy 横幅 | 磁盘新版本已 deploy，Extension Host 内存仍是旧版 → Reload |
| Agent 无反馈进面板 | 查 MCP 日志 `Feedback via extension port=`；检查 `project_mismatch` |
| 多窗口 Extension unavailable | Agent 应传 `project_directory` 或设 `MCP_FEEDBACK_PROJECT_DIRECTORY` |
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
