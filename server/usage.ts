// 数据来源与 ~/.claude/skills/full-auto-mode/scripts/usage.sh 相同：
// Claude Code 的 statusline 插件每次渲染时把 rate_limits 写到 ~/.claude/usage/<session_id>.json：
//   {"updated_at": <epoch 秒>, "rate_limits": {"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}}}
// 配额属于账号，取所有会话里最新的一份。不碰任何凭证/token。
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Usage } from "../shared/usage";

const SOURCE_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "usage");
// 输出文件和 statusline 的源文件放在同一目录。注意：
// - 扫源数据时必须跳过它，别把输出当输入读回来；
// - 它不能有顶层 updated_at 字段，否则 full-auto-mode 的 usage.sh 会把它当最新源文件选中。
const OUTPUT_NAME = "claude-usage.json";
export const USAGE_FILE = join(SOURCE_DIR, OUTPUT_NAME);

type RawWindow = { used_percentage?: number; resets_at?: number } | undefined;
type Raw = { updated_at?: number; rate_limits?: { five_hour?: RawWindow; seven_day?: RawWindow } | null };

const iso = (sec: number) => new Date(sec * 1000).toISOString();

export function toWindow(w: RawWindow, nowSec: number) {
  if (!w || typeof w.used_percentage !== "number") return null;
  // 过了重置时间的窗口已经清零，不管文件里还是旧数（与 usage.sh 一致）。
  if (!w.resets_at || w.resets_at <= nowSec) return { usedPercent: 0, resetsAt: null };
  return { usedPercent: Math.floor(w.used_percentage), resetsAt: iso(w.resets_at) };
}

// 找 updated_at 最新、且 rate_limits 非空的那份（有的会话写的是 null，例如非订阅登录）。
async function readLatest(): Promise<Raw | null> {
  let best: Raw | null = null;
  for (const name of await readdir(SOURCE_DIR).catch(() => [] as string[])) {
    if (!name.endsWith(".json") || name === OUTPUT_NAME) continue;
    const raw: Raw | null = await readFile(join(SOURCE_DIR, name), "utf8")
      .then((t) => JSON.parse(t))
      .catch(() => null);
    if (raw?.rate_limits && (raw.updated_at ?? 0) > (best?.updated_at ?? 0)) best = raw;
  }
  return best;
}

// 读最新用量并原子地写入 USAGE_FILE，返回写入的内容。
export async function refresh(): Promise<Usage> {
  const raw = await readLatest();
  const now = Math.floor(Date.now() / 1000);
  const usage: Usage = {
    updatedAt: iso(now),
    sourceUpdatedAt: raw?.updated_at ? iso(raw.updated_at) : null,
    file: USAGE_FILE,
    fiveHour: toWindow(raw?.rate_limits?.five_hour, now),
    sevenDay: toWindow(raw?.rate_limits?.seven_day, now),
  };
  await writeFile(USAGE_FILE + ".tmp", JSON.stringify(usage, null, 2) + "\n");
  await rename(USAGE_FILE + ".tmp", USAGE_FILE);
  return usage;
}
