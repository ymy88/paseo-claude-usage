import type { PluginServerContext } from "@getpaseo/plugin/server";
import { bunOptionsWithPreload, latestUsage, writePreload } from "./server/usage";
import { getUsageRpc } from "./shared/usage";

export default function contribute(server: PluginServerContext) {
  const ready = writePreload().catch((error) => console.error("写预加载脚本失败", error));

  server.handle(getUsageRpc, () => latestUsage());

  // 只给 Claude Code 会话注入预加载脚本；和已有的 BUN_OPTIONS 合并，不覆盖。
  const removeHook = server.addHook("agent.open.before", async ({ request }) => {
    if (request.provider !== "claude") return;
    await ready;
    return {
      ...request,
      env: { ...request.env, BUN_OPTIONS: bunOptionsWithPreload(request.env.BUN_OPTIONS ?? process.env.BUN_OPTIONS) },
    };
  });

  return () => removeHook();
}
