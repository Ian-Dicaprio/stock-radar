/**
 * 把 GitHub Actions 表单填的宏观数字写入 public/data/macro.json。
 * 由 workflow 在扫描前调用;读环境变量,留空的字段沿用文件里的旧值。
 *
 * 环境变量(均可选,来自 workflow inputs):
 *   CN_PMI CN_PPI CN_CPI CN_NOTE
 *   US_PMI US_PPI US_CPI US_NOTE
 *
 * 本地手动跑:  CN_PMI=49.2 npm run set-macro
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { MacroSchema, type Macro, type MacroMarket } from "@/framework/types";

const FILE = "public/data/macro.json";

/** 解析环境变量里的数字:空串/未设=不改(undefined);其余按数字解析 */
function envNum(key: string): number | null | undefined {
  const v = process.env[key];
  if (v === undefined || v.trim() === "") return undefined; // 不改
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析环境变量里的文本:空串/未设=不改 */
function envStr(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v.trim() === "") return undefined;
  return v.trim();
}

/** 用表单值覆盖单个市场,undefined 表示保留旧值 */
function merge(
  old: MacroMarket,
  patch: { pmi?: number | null; ppi?: number | null; cpi?: number | null; note?: string },
): MacroMarket {
  return {
    pmi: patch.pmi !== undefined ? patch.pmi : old.pmi,
    ppi: patch.ppi !== undefined ? patch.ppi : old.ppi,
    cpi: patch.cpi !== undefined ? patch.cpi : old.cpi,
    note: patch.note !== undefined ? patch.note : old.note,
  };
}

async function main(): Promise<void> {
  let current: Macro;
  try {
    current = MacroSchema.parse(JSON.parse(await readFile(FILE, "utf-8")));
  } catch {
    current = MacroSchema.parse({ cn: {}, us: {} });
  }

  const next: Macro = {
    cn: merge(current.cn, {
      pmi: envNum("CN_PMI"),
      ppi: envNum("CN_PPI"),
      cpi: envNum("CN_CPI"),
      note: envStr("CN_NOTE"),
    }),
    us: merge(current.us, {
      pmi: envNum("US_PMI"),
      ppi: envNum("US_PPI"),
      cpi: envNum("US_CPI"),
      note: envStr("US_NOTE"),
    }),
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  await mkdir("public/data", { recursive: true });
  await writeFile(FILE, JSON.stringify(next, null, 2), "utf-8");
  console.log("[set-macro] 已更新 macro.json:", JSON.stringify(next));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
