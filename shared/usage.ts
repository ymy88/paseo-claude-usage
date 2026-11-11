import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// 一个配额窗口：已用百分比 + 重置时间（ISO 字符串）。
// 窗口已过重置时间时，旧读数作废：usedPercent=0，resetsAt=null。
const window = z.object({ usedPercent: z.number(), resetsAt: z.string().nullable() });

// 写进用量文件、也通过 RPC 返回给界面的完整结构。
export const usageSchema = z.object({
  updatedAt: z.string(), // 插件写这份文件的时间
  sourceUpdatedAt: z.string().nullable(), // statusline 最后一次拿到这组数的时间
  file: z.string(), // 用量文件自身的绝对路径
  fiveHour: window.nullable(),
  sevenDay: window.nullable(),
});
export type Usage = z.infer<typeof usageSchema>;

export const getUsageRpc = defineRpc({
  name: "usage.get",
  input: z.object({}),
  output: usageSchema,
});
