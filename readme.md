# MCP Feedback Enhanced（Hunter Fork）

基于 [mcp-feedback-enhanced-vscode](https://github.com/yuanmingchencn/mcp-feedback-enhanced-vscode) **v2.5.1** 的本地定制版，修复了多窗口连接、剪贴板、Tab 管理等实际问题，便于在 **Cursor 重装** 或 **换机器** 后快速恢复。

当前版本：`2.5.1-ji.1`

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

1. 将扩展部署到 `~/.cursor/extensions/mcp-feedback.mcp-feedback-enhanced-2.5.1-universal/`
2. 更新 `~/.cursor/mcp.json`，指向本仓库内的 `mcp-server/dist/index.js`

---

## 功能与修复摘要

### 1. 连接问题修复（多窗口 / 多项目路由）

**问题**：多个 Cursor 窗口同时打开时，MCP Server 可能连到错误窗口的 WebSocket，面板显示 `AWAITING SIGNAL` 或消息发错面板；多项目共享 `current-server.json` 导致路由混乱。

**修复**：

| 改动 | 说明 |
|------|------|
| 按工作区 hash 注册 | 每个项目写入 `current-server-{hash}.json`，避免全局抢端口 |
| `project_directory` 自动推断 | MCP 根据 cwd 过滤候选 Extension，连到正确窗口 |
| 默认禁用 browser fallback | 不再弹出 `127.0.0.1:随机端口` 浏览器页；需设置 `MCP_FEEDBACK_BROWSER_FALLBACK=1` 才启用 |
| 健康检查与重连 | 面板显示 `Connected :端口 pid=进程号`；点击状态栏或 ↻ 可强制重连 |

**日志**：

- Extension：`~/.config/mcp-feedback-enhanced/logs/extension.log`
- MCP Server：`~/.config/mcp-feedback-enhanced/logs/mcp-server.log`

---

### 2. 多 Tab 会话支持

**能力**：

- 每次 `interactive_feedback` 调用对应一个 **Chat Tab**（`session_id`）
- 绿点 / 橙点：等待回复 vs 已结束
- 可切换 Tab 任意顺序回复（非 FIFO）
- **关闭 Tab**：单击 `×`、右键菜单（Close / Close Others / Close to the Left / Close All Resolved）、工具栏「Close resolved」

**实现文件**：`out/webview/panelState.js`、`out/webview/panel.html`

---

### 3. MCP 连接状态与端口显示

面板顶部状态栏：

```
v2.5.1-ji.1   ● Connected :48201 pid=20071   ↻
```

- **Connected :端口**：当前 WebSocket 连到的 Extension 端口（48200–48300 范围）
- **pid**：Extension 进程号，便于与日志对照
- **↻**：强制断开并重连

`connection_established` 消息携带 `port`、`pid`、`workspaces` 信息。

---

### 4. 剪贴板（复制 / 粘贴图片）

**问题**：Webview 内复制无内容、粘贴双图、无法输入、截图 Cmd+V 无反应。

**修复**：

| 问题 | 根因 | 修复 |
|------|------|------|
| Copied 但剪贴板为空 | `Dp` 路由未转发 `onClipboardWrite` | 补全 WS 协议转发；成功后 `clipboard_write_ok` 再 toast |
| 无法输入 | `focus-webview` 抢焦点 | 移除输入框上的 `focus-webview` 调用 |
| 截图粘贴无反应 | `electron.clipboard` 在 Extension Host 不可用 | macOS：`pbpaste` + `NSPasteboard`（osascript JXA） |
| 误导性 No image 提示 | WS 与原生 paste 竞态 | 去重路径；去掉负面 toast |

---

## 目录结构

```
mcp_feedback_ji/
├── README.md                 # 本文档
├── install.sh                # 一键安装到 Cursor
├── package.json              # 扩展清单（version: 2.5.1-ji.1）
├── out/
│   ├── extension.js          # Extension + WebSocket Hub（含剪贴板、服务发现）
│   └── webview/
│       ├── panel.html        # 面板 UI（Tab、剪贴板、状态栏）
│       └── panelState.js     # 可测试的状态机
├── mcp-server/
│   └── dist/index.js         # MCP Server（stdio，含项目路由 patch）
├── scripts/hooks/            # Cursor Hooks 工具
├── tests/                    # 单元测试
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
| `MCP_FEEDBACK_DEV` | 未设置 | 开发时 webview 热重载 |

---

## 运行测试

```bash
cd mcp_feedback_ji
node --test tests/*.test.js
```

覆盖：多 Tab 状态机、剪贴板 helper、协议路由 `Dp` 转发、反馈队列等（14 项）。

---

## 故障排查

| 现象 | 检查 |
|------|------|
| 面板 Disconnected | 点击 ↻ 或 Reload Window；查 `extension.log` 是否有 `server started` |
| Agent 无反馈进面板 | 查 `mcp-server.log` 是否 `Feedback via extension port=...`；确认 `project_directory` 与当前工作区一致 |
| 复制无效 | 日志搜 `clipboard-write ok` |
| 截图粘贴失败 | 日志搜 `clipboard-paste ok image=true`；仅 macOS 支持 Extension 读图 |
| Tab 过多 | 右键 Tab → Close All Resolved，或点「Close resolved」 |

---

## 与上游的关系

- **上游**：Open VSX / GitHub `mcp-feedback-enhanced-vscode` v2.5.1
- **本 Fork**：在已安装扩展产物上直接 patch（无 TypeScript 源码），以 `out/` + `mcp-server/dist/` 为主
- **升级上游时**：重新安装原版后，用 `diff` 对比本仓库改动，或重新应用 patch

---

## 许可证

继承上游 MIT License，见 [LICENSE.txt](./LICENSE.txt)。
