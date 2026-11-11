# Claude 用量（Paseo 本地插件）

在 Paseo 侧边栏底部显示 Claude Code 订阅的 5 小时 / 7 天配额用量和重置时间，并把同一份数据写成文件给 agent 读。

## 界面

侧边栏底部（「Add project」下面）两行，每 60 秒刷新，点一下立即刷新：

```
5h 14% · 重置 04:20
7d 41% · 重置 11/14 11:00
```

可在 Settings → Sidebar 里调整位置或隐藏。

## 给 agent 读的文件

- 路径：`~/.paseo/claude-usage.json`（daemon 设了 `PASEO_HOME` 时在 `$PASEO_HOME/claude-usage.json`）
- 每个 agent 会话打开时都会注入环境变量 `CLAUDE_USAGE_FILE` 指向它（插件安装前已打开的会话要重开后才有）。
- daemon 侧每 60 秒重写一次，界面刷新时也会重写。

```json
{
  "updatedAt": "2026-11-11T19:43:32.000Z",
  "sourceUpdatedAt": "2026-11-11T19:33:39.000Z",
  "file": "/Users/you/.paseo/claude-usage.json",
  "fiveHour": { "usedPercent": 14, "resetsAt": "2026-11-11T20:20:00.000Z" },
  "sevenDay": { "usedPercent": 41, "resetsAt": "2026-11-14T03:00:00.000Z" }
}
```

- `updatedAt`：插件写文件的时间；`sourceUpdatedAt`：这组数实际被读到的时间。
- 窗口已过 `resetsAt` 时视为已清零：`usedPercent: 0, resetsAt: null`。
- 读不到数据时窗口为 `null`。

## 数据来源

与 `~/.claude/skills/full-auto-mode/scripts/usage.sh` 相同：Claude Code 的 statusline 插件每次渲染时把 `rate_limits` 写进 `~/.claude/usage/<session_id>.json`，插件取其中 `updated_at` 最新且 `rate_limits` 非空的一份。不读取任何凭证。

局限：statusline 只在 Claude Code 终端会话收到新消息时才渲染，没有终端会话活动时数字不会变（`sourceUpdatedAt` 会停住），但过了重置时间会自动按清零处理。

## 开发

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"    # 首次安装
paseo plugin reload claude-usage  # 改代码后
paseo plugin logs claude-usage
```
