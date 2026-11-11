import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { getUsageRpc, type UsageWindow } from "./shared/usage";

// 英文 24 小时制：今天的只写时分（04:20），其他日子写 "Nov 14, 11:00"。
function fmt(epochSec: number) {
  const d = new Date(epochSec * 1000);
  const time = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", time)
    : d.toLocaleString("en-US", { month: "short", day: "numeric", ...time });
}

// pill 按钮被 Paseo 限制为 maxWidth:160（label 单行、超出截断），只放得下两个百分比；
// 重置时间放进 title，桌面端鼠标悬停时以 tooltip 显示。
// 过了 resets_at 的窗口已经清零（源文件里还是旧数），显示为 0% / reset，与 usage.sh 的判断一致。
const expired = (w: NonNullable<UsageWindow>) => w.resets_at * 1000 <= Date.now();
const pct = (name: string, w: UsageWindow) =>
  `${name} ${w ? `${expired(w) ? 0 : Math.floor(w.used_percentage)}%` : "?"}`;
const resets = (name: string, w: UsageWindow) =>
  !w ? `${name} no data` : expired(w) ? `${name} reset` : `${name} resets ${fmt(w.resets_at)}`;

// 每个 agent 的输入框上方（Tasks / Subagents 那一排）放一个 pill，显示 5h / 7d 用量，点一下立即刷新。
// 只挂在 provider 为 "claude"（Claude Code）的 agent 上；pi 等其他 provider 不显示。
export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();
  const TITLE = "Claude Code usage · Click to refresh";
  let label = "Claude 用量…";
  let title = TITLE;

  const refresh = async () => {
    try {
      const u = await client.rpc(getUsageRpc, {});
      const { five_hour: h5, seven_day: d7 } = u?.rate_limits ?? {};
      label = `${pct("5h", h5)} · ${pct("7d", d7)}`;
      title = `${resets("5h", h5)} · ${resets("7d", d7)} · Click to refresh`;
    } catch (error) {
      label = "用量读取失败";
      title = TITLE;
      console.error("读取 Claude 用量失败", error);
    }
    for (const pill of pills.values()) pill.update({ label, title });
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
        button: { title, icon: "Gauge", label, behavior: { kind: "action", onPress: refresh } },
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
