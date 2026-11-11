import type { PluginServerContext } from "@getpaseo/plugin/server";
import { refresh, USAGE_FILE } from "./server/usage";
import { getUsageRpc } from "./shared/usage";

export default function contribute(server: PluginServerContext) {
  const tick = () => refresh().catch((error) => console.error("刷新用量失败", error));
  void tick();
  // 不管界面开没开，每分钟把用量文件刷新一次，给 agent 读。
  const timer = setInterval(tick, 60_000);

  server.handle(getUsageRpc, () => refresh());

  // 每次打开 agent 会话都注入用量文件路径，agent 用 $CLAUDE_USAGE_FILE 找到它。
  const removeHook = server.addHook("agent.open.before", async ({ request }) => ({
    ...request,
    env: { ...request.env, CLAUDE_USAGE_FILE: USAGE_FILE },
  }));

  return () => {
    clearInterval(timer);
    removeHook();
  };
}
