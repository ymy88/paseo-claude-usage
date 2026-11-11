# Claude 用量（Paseo 本地插件）

在 Paseo 里每个 Claude Code agent 的输入框上方显示 5 小时 / 7 天配额用量和重置时间，并把同一份数据写成文件给 agent 读。

## 界面

provider 为 `claude` 的 agent，输入框上方 pill 那一排（和 Tasks、Subagents 同一排）有一个 pill，每 60 秒刷新，点一下立即刷新：

```
5h 14% · 7d 41%
```

鼠标悬停显示重置时间（tooltip）：`5h resets 04:20 · 7d resets Nov 14, 11:00 · Click to refresh`（当天重置的只写时分，24 小时制）。
Paseo 把 pill 限制在 160px 宽、label 单行超出截断，所以 pill 上只放百分比。pi 等其他 provider 的 agent 不显示。

## 给 agent 读的文件

- 路径：`~/.claude/usage/claude-usage.json`（设了 `CLAUDE_CONFIG_DIR` 时在 `$CLAUDE_CONFIG_DIR/usage/claude-usage.json`），和 statusline 写的 `<session_id>.json` 在同一目录、同一格式。
- 内容是 `rate_limits` 非空的最新一份源文件的**原样副本**，一字不改；`updated_at` 是源数据的真实时间，不是复制时间。
- 每个 agent 会话（任何 provider，包括 pi）打开时都会注入环境变量 `CLAUDE_USAGE_FILE` 指向它（插件安装前已打开的会话要重开后才有）。
- daemon 侧每 60 秒复制一次，界面刷新时也会复制；找不到任何有 `rate_limits` 的源文件时不写。

```json
{
  "updated_at": 1794425619,
  "context_used_percentage": 5,
  "rate_limits": {
    "five_hour": { "used_percentage": 14, "resets_at": 1794428400 },
    "seven_day": { "used_percentage": 41, "resets_at": 1794625200 }
  }
}
```

- 时间都是 epoch 秒。`resets_at` 已过的窗口已经清零，`used_percentage` 是旧数，读的人自己判断（`usage.sh` 和 pill 都这么做）。
- 插件读源数据时必须跳过 `claude-usage.json` 本身：它和源文件同目录、同格式、同 `updated_at`，不跳过会把自己的副本当源读回来。

## 数据来源

与 `~/.claude/skills/full-auto-mode/scripts/usage.sh` 相同：Claude Code 的 statusline 插件每次渲染时把 `rate_limits` 写进 `~/.claude/usage/<session_id>.json`，插件取其中 `updated_at` 最新且 `rate_limits` 非空的一份，原样复制。不读取任何凭证。

局限：statusline 只在 Claude Code 终端会话收到新消息时才渲染，没有终端会话活动时数字不会变（`sourceUpdatedAt` 会停住），但过了重置时间会自动按清零处理。

## 开发

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"    # 首次安装
paseo plugin reload claude-usage  # 改代码后
paseo plugin logs claude-usage
```
