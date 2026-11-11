import { type PluginClientContext, type PluginSidebarItemProps, useRpc } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { getUsageRpc, type Usage } from "./shared/usage";

// 今天的重置时间只显示 HH:mm，其他日子显示 M/D HH:mm。
function fmt(isoTime: string | null) {
  if (!isoTime) return "已重置";
  const d = new Date(isoTime);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function line(name: string, w: Usage["fiveHour"]) {
  return w ? `${name} ${w.usedPercent}% · 重置 ${fmt(w.resetsAt)}` : `${name} 无数据`;
}

// 侧边栏底部两行：5h 和 7d 各一行，点一下立即刷新。
function UsageItem(_: PluginSidebarItemProps) {
  const getUsage = useRpc(getUsageRpc);
  const { data, error, refetch } = useQuery({
    queryKey: ["claude-usage"],
    queryFn: () => getUsage({}),
    refetchInterval: 60_000,
  });
  const onPress = () => void refetch();
  if (!data) {
    return <SidebarRow icon="Gauge" label={error ? "Claude 用量读取失败" : "Claude 用量…"} onPress={onPress} />;
  }
  return (
    <>
      <SidebarRow id="5h" icon="Gauge" label={line("5h", data.fiveHour)} onPress={onPress} />
      <SidebarRow id="7d" icon="CalendarDays" label={line("7d", data.sevenDay)} onPress={onPress} />
    </>
  );
}

export default function contribute(client: PluginClientContext) {
  client.addSidebarFooterItem({ id: "claude-usage", title: "Claude 用量", Component: UsageItem });
  return () => {};
}
