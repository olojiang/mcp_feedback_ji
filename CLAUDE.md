# MCP Feedback Enhanced (Hunter Fork) — Project Guide

## 日志排查指南

### 日志文件位置

所有日志在 `~/.config/mcp-feedback-enhanced/logs/`：

| 日志文件 | 说明 | 关键关键词 |
|---|---|---|
| `webview-YYYY-MM-DD.log` (`webview.log`) | 前端面板日志（webview JS → extension host 转写） | `drag`, `drop`, `browse-paths`, `addPathsToLru`, `savePathLru`, `showLruDropdown`, `at-search`, `connection_health`, `bootReport`, `resolveWebviewView` |
| `mcp-server-YYYY-MM-DD.log` (`mcp-server.log`) | MCP 服务端日志（stdio, feedback wait, progress） | `feedbackRequest`, `feedback_wait`, `progress_send`, `wait_lifecycle`, `request_billing_risk`, `Server started` |
| `hooks-YYYY-MM-DD.log` (`hooks.log`) | Cursor hooks 日志（duplicate wait deny, consume pending） | `action=deny_duplicate`, `action=skip_duplicate`, `consume_pending` |
| `session-journal.jsonl` | 会话生命周期结构化日志 | `session_displayed`, `session_updated`, `feedback_submitted` |

### 排查步骤

1. **确认版本生效**
   ```bash
   grep "resolveWebviewView" ~/.config/mcp-feedback-enhanced/logs/webview.log | tail -3
   ```
   看 `v=2.5.1-ji.NNN` 是否是刚部署的版本号。如果不是 → Reload Window (Cmd+Shift+P → Developer: Reload Window)。

2. **确认脚本加载**
   ```bash
   grep "bootReport" ~/.config/mcp-feedback-enhanced/logs/webview.log | tail -1
   ```
   `scripts.errors` 必须为空数组 `"errors":[]`。`panelApp:true` 等必须全 true。

3. **前端交互问题（拖拽、按钮、@ 引用）**
   ```bash
   grep -E "drag|drop|browse-paths|addPathsToLru|savePathLru|showLruDropdown|at-search" ~/.config/mcp-feedback-enhanced/logs/webview.log | tail -20
   ```
   - 拖拽不工作 → 找 `dragenter@win` / `drop@win`。如果没有 → Cursor webview 宿主层拦截了 DnD 事件，前端无法修复，用 📁 按钮替代。
   - LRU 不显示 → 找 `addPathsToLru`（确认在写入）和 `showLruDropdown`（确认 🕐 按钮点击生效）。如果只有 `addPathsToLru` 没有 `showLruDropdown` → 检查 `var lruBtn` 是否在 `if (lruBtn)` 之前声明（hoisting bug）。
   - @ 找不到目录 → 找 `at-search query=` 和 `at-search dir_glob`。如果没有 → extension host 未重载，需 Reload Window。

4. **MCP 服务端问题**
   ```bash
   grep -E "feedbackRequest|wait_lifecycle|request_billing_risk|Server started" ~/.config/mcp-feedback-enhanced/logs/mcp-server.log | tail -20
   ```

5. **Hooks 问题**
   ```bash
   grep -E "deny_duplicate|skip_duplicate|consume_pending" ~/.config/mcp-feedback-enhanced/logs/hooks.log | tail -20
   ```

### 部署流程

```bash
npm run deploy
```
- 自动 bump 版本号
- 编译 TypeScript → esbuild → generate-webview
- 同步 `out/` + `static/` + `mcp-server/` 到 `~/.cursor/extensions/mcp-feedback.mcp-feedback-enhanced-2.5.1-universal/`
- 更新 `~/.cursor/mcp.json` 中的 `MCP_FEEDBACK_VERSION`
- 部署后必须 **Reload Window** 让 extension host 加载新 `extension.js`

### 验证部署

```bash
EXTDIR=~/.cursor/extensions/mcp-feedback.mcp-feedback-enhanced-2.5.1-universal
grep '"version"' "$EXTDIR/package.json"
diff <(md5 -q static/panelApp.js) <(md5 -q "$EXTDIR/out/webview/panelApp.js") && echo "MATCH"
```

## 代码结构

- `static/panelApp.js` — 前端主逻辑（DOM 操作、事件绑定、LRU、拖拽、@ 引用）
- `static/panelState.js` — 纯状态模型（可测试，`PS.PanelState.*` 函数）
- `static/panel.html` — 面板 HTML + CSS
- `src/feedbackViewProvider.ts` — VSCode WebviewView Provider（消息路由、@ 搜索、文件选择器）
- `src/webviewMessageRouter.ts` — webview 消息路由器（browse-paths、at-search 等）
- `src/extension.ts` — 扩展入口
- `tests/panelState.test.js` — panelState 纯函数 + panelApp.js 结构回归测试

## 关键约束

- `static/panelApp.js` 中的 DOM 元素变量（`var lruBtn`, `var browseBtn` 等）必须在**使用前**声明赋值，否则 `var` hoisting 导致 `undefined`，`if (lruBtn)` 为 false，handler 不绑定。回归测试 `panelApp.js LRU wiring regression` 防护此问题。
- Cursor webview iframe **不支持 OS/explorer 拖拽**（drag-and-drop 事件被宿主层拦截），不要在前端 DnD 上浪费时间，用 `vscode.window.showOpenDialog`（📁 按钮）替代。
- 部署后必须 Reload Window，仅重开面板不会重载 extension host。
