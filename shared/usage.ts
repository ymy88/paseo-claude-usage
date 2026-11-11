import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// 与 statusline 写的 ~/.claude/usage/<session_id>.json 同一格式（插件输出就是源文件的原样副本）。
// resets_at / updated_at 都是 epoch 秒；过没过重置时间由读的人自己判断。
const window = z.object({ used_percentage: z.number(), resets_at: z.number() }).nullish();
export const usageSchema = z.object({
  updated_at: z.number(),
  rate_limits: z.object({ five_hour: window, seven_day: window }),
});
export type Usage = z.infer<typeof usageSchema>;
export type UsageWindow = Usage["rate_limits"]["five_hour"];

export const getUsageRpc = defineRpc({
  name: "usage.get",
  input: z.object({}),
  output: usageSchema.nullable(), // 找不到任何有 rate_limits 的源文件时为 null
});
