import { z } from "zod";
import { LlmConfigSchema } from "@/llm/client";

/**
 * 本地设置:大模型配置 + 持仓。全部存在浏览器 localStorage,不上传任何服务器。
 */
const HoldingSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  costPct: z.number(), // 占总仓位百分比
});
export type Holding = z.infer<typeof HoldingSchema>;

const SettingsSchema = z.object({
  llm: LlmConfigSchema.partial().optional(),
  holdings: z.array(HoldingSchema).default([]),
});
export type Settings = z.infer<typeof SettingsSchema>;

const KEY = "stock-radar-settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { holdings: [] };
    return SettingsSchema.parse(JSON.parse(raw));
  } catch {
    return { holdings: [] };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
