import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Usage } from "../shared/usage";
import { preload } from "./preload";

const USAGE_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "usage");
// 插件代码是 Paseo 打包后 eval 执行的，拿不到插件目录，所以把预加载脚本生成到固定位置。
export const PRELOAD_FILE = join(homedir(), ".paseo", "claude-usage-preload.js");

export async function writePreload() {
  const tmp = `${PRELOAD_FILE}.${process.pid}.tmp`;
  await mkdir(join(homedir(), ".paseo"), { recursive: true });
  await writeFile(tmp, `// 由 Paseo 插件 claude-usage 生成，勿手改。\n(${preload.toString()})();\n`);
  await rename(tmp, PRELOAD_FILE);
}

// BUN_OPTIONS 不认引号，路径里的空格等字符用反斜杠转义（实测 Bun 1.x 如此）。
export const bunOptionsWithPreload = (existing: string | undefined) =>
  [existing?.trim(), `--preload ${PRELOAD_FILE.replace(/([\\\s"'])/g, "\\$1")}`].filter(Boolean).join(" ");

// 与 full-auto-mode 的 usage.sh 同规则：rate_limits 非空、updated_at 最新的一份。
export async function latestUsage(): Promise<Usage | null> {
  let best: Usage | null = null;
  for (const name of await readdir(USAGE_DIR).catch(() => [] as string[])) {
    if (!name.endsWith(".json")) continue;
    const usage: Usage | null = await readFile(join(USAGE_DIR, name), "utf8")
      .then((t) => JSON.parse(t))
      .catch(() => null);
    if (usage?.rate_limits && usage.updated_at > (best?.updated_at ?? 0)) best = usage;
  }
  return best;
}
