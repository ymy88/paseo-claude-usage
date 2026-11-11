import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { getUsageRpc, type Usage } from "./shared/usage";

// 今天的重置时间只显示 HH:mm，其他日子显示 M/D HH:mm。
function fmt(isoTime: string | null) {
  if (!isoTime) return "已重置";
  const d = new Date(isoTime);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

const part = (name: string, w: Usage["fiveHour"]) =>
  w ? `${name} ${w.usedPercent}% (${fmt(w.resetsAt)})` : `${name} 无数据`;

// 每个 agent 的输入框上方（Tasks / Subagents 那一排）放一个 pill，显示 5h / 7d 用量，点一下立即刷新。
// 只挂在 provider 为 "claude"（Claude Code）的 agent 上；pi 等其他 provider 不显示。
export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();
  let label = "Claude 用量…";

  const refresh = async () => {
    try {
      const u = await client.rpc(getUsageRpc, {});
      label = `${part("5h", u.fiveHour)} · ${part("7d", u.sevenDay)}`;
    } catch (error) {
      label = "Claude 用量读取失败";
      console.error("读取 Claude 用量失败", error);
    }
    for (const pill of pills.values()) pill.update({ label });
  };

  const register = (agent: { id: string; provider: string; workspaceId?: string | null }) => {
    pills.get(agent.id)?.remove();
    pills.delete(agent.id);
    if (lifetime.signal.aborted || !agent.workspaceId || agent.provider !== "claude") return;
    pills.set(
      agent.id,
      client.addComposerPill({
        id: "claude-usage",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: { title: "Claude Code 用量（点击刷新）", icon: "Gauge", label, behavior: { kind: "action", onPress: refresh } },
      }),
    );
  };
  const removeAll = () => {
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };

  // 订阅 agent 列表：先收到现有 agent 的快照，之后增量更新，重连后会再给一份快照。
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          removeAll();
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return register(update.agent);
          pills.get(update.agentId)?.remove();
          pills.delete(update.agentId);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("订阅 agent 列表失败", error);
    });

  void refresh();
  const timer = setInterval(refresh, 60_000);

  return () => {
    lifetime.abort();
    clearInterval(timer);
    removeAll();
  };
}
