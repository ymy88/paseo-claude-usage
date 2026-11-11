# Claude 用量（Paseo 本地插件）

让 Paseo 里的 Claude Code agent 像终端里的状态栏一样，把订阅的 5 小时 / 7 天用量写到
`~/.claude/usage/<session_id>.json`（`~/.claude/skills/full-auto-mode/scripts/usage.sh` 读的就是它），
并在 Claude agent 的输入框上方显示用量。

## 原理

- Claude Code 在 stream-json 输出里会发 `rate_limit_event`，`rate_limit_info.unifiedWindows` 带
  `five_hour` / `seven_day` 的 `utilization`（0–1）和 `resetsAt`（epoch 秒）。Paseo 自己会丢掉这条消息。
- 插件在 `agent.open.before` 钩子里，只给 provider 为 `claude` 的会话加环境变量
  `BUN_OPTIONS=--preload ~/.paseo/claude-usage-preload.js`（和已有的 `BUN_OPTIONS` 合并）。
  claude 是 Bun 编译的，会在启动时执行这段预加载脚本。
- 预加载脚本（源码 `server/preload.ts`，插件启动时生成到 `~/.paseo/claude-usage-preload.js`）只在
  claude 本体且是 stream-json 模式时生效：包一层 `process.stdout.write`，输出原样不动，
  旁路按行解析，遇到 `rate_limit_event` 就合并写用量文件。其他进程（比如 agent 在 Bash 里跑的 bun）里什么都不做。
- 用量文件格式与状态栏插件相同：

```json
{
  "updated_at": 1794430042,
  "context_used_percentage": null,
  "rate_limits": {
    "five_hour": { "used_percentage": 8, "resets_at": 1794446400 },
    "seven_day": { "used_percentage": 43, "resets_at": 1794625200 }
  }
}
```

  `used_percentage` 与状态栏同一算法 `min(round(utilization*1000)/10, 100)`；事件里没带的窗口保留旧值；
  `context_used_percentage` 拿不到，固定为 `null`。
- Claude Code 不是每次请求都发这条事件，只在某个窗口的整数百分比、重置时间或状态变了时才发
  （每个进程第一次请求一定会发）。数字没变时 `updated_at` 不刷新，但数字是对的。

## 界面

provider 为 `claude` 的 agent，输入框上方 pill 那一排显示 `5h 8% · 7d 43%`，每 60 秒刷新，点击立即刷新。
鼠标悬停显示重置时间：`5h resets 09:20 · 7d resets Nov 14, 11:00 · Click to refresh`。过了重置时间的窗口显示 `0%` / `reset`。
数据取 `~/.claude/usage/*.json` 里 `rate_limits` 非空、`updated_at` 最新的一份（与 `usage.sh` 同规则）。

## 安装

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"
```

已打开的 Claude agent 会在下一次空闲时自动重开并生效。不需要改 `~/.paseo/config.json`。

## 卸载

```bash
paseo plugin remove claude-usage
rm -f ~/.paseo/claude-usage-preload.js
```

卸载后新开的 Claude 会话不再带 `BUN_OPTIONS`。已写出的 `~/.claude/usage/*.json` 不会删除。

## 失效风险

这套做法依赖两件 Claude Code 的实现细节，升级后可能悄悄失效（失效时只是不再写文件，不会影响 agent 输出）：

1. claude 是 Bun 编译的，并且认 `BUN_OPTIONS=--preload`（2.1.322 实测可以；路径不认引号，空格要用反斜杠转义）。
2. stream-json 是通过 `process.stdout.write` 写出的，且 `rate_limit_event` 带 `unifiedWindows`。

验证方法：新开一个 Claude agent 发一句话，看 `~/.claude/usage/<session_id>.json` 是否出现。
