// 数据来源与 ~/.claude/skills/full-auto-mode/scripts/usage.sh 相同：
// Claude Code 的 statusline 插件每次渲染时把 rate_limits 写到 ~/.claude/usage/<session_id>.json：
//   {"updated_at": <epoch 秒>, "rate_limits": {"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}}}
// 配额属于账号，取 rate_limits 非空的最新一份，原样复制到 USAGE_FILE。不碰任何凭证/token。
import { copyFile, readdir, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Usage } from "../shared/usage";

const SOURCE_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "usage");
const OUTPUT_NAME = "claude-usage.json";
export const USAGE_FILE = join(SOURCE_DIR, OUTPUT_NAME);

// 选中源文件，原样复制到 USAGE_FILE（先写 .tmp 再 rename，读的人不会看到半个文件），返回其内容。
export async function refresh(): Promise<Usage | null> {
  let best: { path: string; usage: Usage } | null = null;
  for (const name of await readdir(SOURCE_DIR).catch(() => [] as string[])) {
    // 必须跳过输出文件：它和源文件同目录、同格式、同 updated_at，不跳过就会把自己的副本当源读回来。
    if (!name.endsWith(".json") || name === OUTPUT_NAME) continue;
    const path = join(SOURCE_DIR, name);
    const usage: Usage | null = await readFile(path, "utf8")
      .then((t) => JSON.parse(t))
      .catch(() => null);
    // 有的会话写的 rate_limits 是 null（例如非订阅登录），跳过。
    if (usage?.rate_limits && usage.updated_at > (best?.usage.updated_at ?? 0)) best = { path, usage };
  }
  if (!best) return null;
  await copyFile(best.path, USAGE_FILE + ".tmp");
  await rename(USAGE_FILE + ".tmp", USAGE_FILE);
  return best.usage;
}
