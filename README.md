# claude-usage-wrapper

给 Paseo 里的 Claude agent 套一层 `claude`，把 Claude Code 订阅的 5 小时 / 7 天用量写成和状态栏插件一样的文件，让 `~/.claude/skills/full-auto-mode/scripts/usage.sh` 在纯 Paseo（SDK）会话里也能读到最新用量。

## 原理

Paseo 通过 Claude Agent SDK 启动 `claude`，从它的 stdout 读 stream-json。Claude Code 2.1.322 会在其中输出
`rate_limit_event`，`rate_limit_info.unifiedWindows` 里带 `five_hour` / `seven_day` 的 `utilization`（0–1）和 `resetsAt`（epoch 秒）。
Paseo 自己会丢掉这条消息，wrapper 在它之前截下来：

- 参数、stdin、stderr、退出码、信号全部透传，stdout 逐块原样转发（不加缓冲，不改字节）。
- 遇到 `rate_limit_event` 就合并写 `~/.claude/usage/<session_id>.json`（尊重 `CLAUDE_CONFIG_DIR`），格式与状态栏插件相同：

```json
{
  "updated_at": 1794429386,
  "context_used_percentage": null,
  "rate_limits": {
    "five_hour": { "used_percentage": 3, "resets_at": 1794446400 },
    "seven_day": { "used_percentage": 42, "resets_at": 1794625200 }
  }
}
```

- `used_percentage` 与状态栏同一算法：`min(round(utilization*1000)/10, 100)`。事件里没带的窗口保留旧值。先写唯一名的临时文件再 rename。
- `context_used_percentage` wrapper 拿不到，固定为 `null`。

注意：Claude Code 不是每次请求都发这条事件，只在某个窗口的整数百分比、重置时间或状态变了时才发（每个进程的第一次响应一定会发）。所以数字没变时 `updated_at` 不会刷新，但数字本身是对的。

## 安装

前提：`node` 在 Paseo daemon 的 PATH 里；真正的 claude 在 `~/.local/bin/claude`（否则设环境变量 `CLAUDE_REAL_BIN`）。

在 `~/.paseo/config.json` 的 `agents.providers.claude` 下加：

```json
"command": ["/Users/ymy/Projects/paseo-claude-usage/claude-usage-wrapper"]
```

然后执行 `paseo reload`。已打开的 Claude agent 重开后生效。

## 回滚

删掉 `agents.providers.claude.command` 这一行，再执行 `paseo reload`。

## 测试

```bash
# 假数据：透传与写文件（不碰真实目录）
CLAUDE_REAL_BIN=/path/to/fake-claude CLAUDE_CONFIG_DIR=/tmp/cfg ./claude-usage-wrapper -p hi
# 真实调用（需要已登录的 claude）
./claude-usage-wrapper -p "reply with: ok" --model haiku --output-format stream-json --verbose
~/.claude/skills/full-auto-mode/scripts/usage.sh
```
