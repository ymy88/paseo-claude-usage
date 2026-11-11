# paseo-claude-usage

A local Paseo plugin that shows your Claude subscription usage (5-hour and 7-day windows) for Claude Code agents running in Paseo, and writes it to disk so scripts and agents can read it.

- **In the UI**: a pill above the composer of every Claude agent shows `5h 8% · 7d 43%`. Hover to see reset times: `5h resets 09:20 · 7d resets Nov 14, 11:00`. Not shown for other providers (e.g. pi).
- **On disk**: `~/.claude/usage/<session_id>.json`, in the same format Claude Code statusline scripts commonly write, so existing quota-check scripts keep working without changes.

## Why

When you run Claude Code in a terminal, the statusline receives `rate_limits` on every render. Agents inside Paseo run Claude Code through the Claude Agent SDK, which has no statusline. Claude Code does emit a `rate_limit_event` message in its `stream-json` output, but Paseo drops it, and plugins cannot see raw SDK messages. Paseo's built-in usage source also finds no account when Claude Code is logged in with `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`).

## How it works

1. In the `agent.open.before` hook, the plugin adds `BUN_OPTIONS=--preload ~/.paseo/claude-usage-preload.js` to sessions whose provider is `claude`. Any existing `BUN_OPTIONS` is kept.
2. The `claude` binary is compiled with Bun, so it runs the preload script on startup. The script (source: `server/preload.ts`, written to `~/.paseo/claude-usage-preload.js` when the plugin starts) only activates inside the Claude Code binary in `stream-json` mode. It does nothing in other Bun processes, such as `bun` run from an agent's shell.
3. The script wraps `process.stdout.write`. Output passes through byte-for-byte; a side parser reads complete lines, and on `rate_limit_event` takes `rate_limit_info.unifiedWindows` and merges it into the usage file. All errors are swallowed so they can never break the agent's output.

Usage file format:

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

- `updated_at` and `resets_at` are epoch seconds. `used_percentage` is `min(round(utilization * 1000) / 10, 100)`.
- A window missing from an event keeps its previous value. `context_used_percentage` is not available and is always `null`.
- `$CLAUDE_CONFIG_DIR` is honored instead of `~/.claude` when set.
- Claude Code only emits `rate_limit_event` when a window's integer percentage, reset time or status changes (and always on a process's first request). So `updated_at` can lag while the numbers stay correct.

The pill reads the newest file in `~/.claude/usage/` that has non-null `rate_limits`, every 60 seconds. Windows past their reset time show `0%` / `reset`.

## Requirements

- Paseo >= 0.15.4
- Claude Code with `unifiedWindows` in `rate_limit_event` (verified on 2.1.322)
- Node.js and npm (for type checking only)

## Install

```bash
git clone https://github.com/ymy88/paseo-claude-usage.git
cd paseo-claude-usage
npm install
npm run typecheck
paseo plugin install "$PWD"
```

Open Claude agents restart with the preload on their next idle. No change to `~/.paseo/config.json` is needed.

## Uninstall

```bash
paseo plugin remove claude-usage
rm -f ~/.paseo/claude-usage-preload.js
```

New Claude sessions no longer get `BUN_OPTIONS`. Existing files in `~/.claude/usage/` are left in place.

## Known risks

This relies on two Claude Code implementation details and may silently stop working after an upgrade. When it does, the usage file just stops updating; agent output is unaffected.

1. `claude` is a Bun-compiled binary that honors `BUN_OPTIONS=--preload`. The path cannot be quoted; spaces must be backslash-escaped.
2. `stream-json` is written via `process.stdout.write`, and `rate_limit_event` carries `unifiedWindows`.

To check: open a new Claude agent, send one message, and confirm `~/.claude/usage/<session_id>.json` appears.
