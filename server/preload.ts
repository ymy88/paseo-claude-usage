// 这段代码不在插件进程里跑：插件启动时把 preload 函数序列化写成一个 .js 文件，
// 再通过 BUN_OPTIONS=--preload 注入 Paseo 启动的每个 claude 进程（claude 是 Bun 编译的）。
// 所以函数必须完全自包含：不能引用函数外的任何变量或 import。
//
// 它在 claude 进程里包一层 process.stdout.write：原样写出，同时旁路按行解析 stream-json，
// 遇到 rate_limit_event 就把 unifiedWindows 的 5h / 7d 用量按状态栏插件的格式合并写到
// ~/.claude/usage/<session_id>.json（尊重 CLAUDE_CONFIG_DIR）。任何异常都吞掉，绝不影响原 stdout。
export function preload() {
  try {
    // BUN_OPTIONS 会被 claude 启动的子进程继承（比如 agent 在 Bash 里跑 bun）；只在 claude 本体里生效。
    const fs = require("node:fs");
    if (!/\/claude\/versions\/[^/]+$/.test(fs.realpathSync(process.execPath))) return;
    if (!process.argv.includes("stream-json")) return;

    const os = require("node:os");
    const path = require("node:path");
    const { StringDecoder } = require("node:string_decoder");
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "usage");
    // 和 Claude Code 状态栏一致：jPe(u) = Math.min(Math.round(u * 1000) / 10, 100)
    const pct = (u: number) => Math.min(Math.round(u * 1000) / 10, 100);

    const record = (event: any) => {
      const windows = event.rate_limit_info?.unifiedWindows;
      if (!event.session_id || !windows) return;
      const file = path.join(dir, `${event.session_id}.json`);
      let old: any = {};
      try {
        old = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {}
      const rate_limits = { ...old.rate_limits }; // 事件里没带的窗口保留旧值
      for (const key of ["five_hour", "seven_day"]) {
        const w = windows[key];
        if (w) rate_limits[key] = { used_percentage: pct(w.utilization), resets_at: w.resetsAt };
      }
      const out = {
        updated_at: Math.floor(Date.now() / 1000),
        context_used_percentage: old.context_used_percentage ?? null, // 拿不到上下文占比，保留状态栏的字段
        rate_limits,
      };
      const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + "\n");
      fs.renameSync(tmp, file);
    };

    let pending = "";
    const decoder = new StringDecoder("utf8");
    const sniff = (chunk: unknown, encoding: unknown) => {
      if (typeof chunk === "string") {
        if (encoding && !/^utf-?8$/i.test(encoding as string)) return; // 非文本编码的写入不解析
        pending += chunk;
      } else pending += decoder.write(Buffer.from(chunk as Uint8Array)); // 多字节字符跨块时不拆坏
      let nl;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        if (!line.includes('"rate_limit_event"')) continue;
        const event = JSON.parse(line);
        if (event.type === "rate_limit_event") record(event);
      }
      if (pending.length > 4 * 1024 * 1024) pending = ""; // 防御：一行超长就丢掉解析缓冲（不影响输出）
    };

    const original = process.stdout.write;
    process.stdout.write = function (this: unknown, chunk: unknown, ...rest: unknown[]) {
      try {
        sniff(chunk, typeof rest[0] === "string" ? rest[0] : undefined);
      } catch {}
      return (original as Function).call(this, chunk, ...rest);
    } as typeof process.stdout.write;
  } catch {}
}
