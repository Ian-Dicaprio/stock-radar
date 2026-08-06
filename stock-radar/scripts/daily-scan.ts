/**
 * 每日扫描脚本。由 GitHub Actions 每天收盘后运行:
 *   全市场取数 → 初筛 → 补技术指标 → 打分 → 取Top10 → (可选)大模型点评 → 写 public/data/latest.json
 *
 * 环境变量(在 GitHub 仓库 Secrets 配置,可选):
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL —— 缺省则跳过点评,只出打分榜单。
 *
 * 本地手动跑:  npm run scan
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fetchAllCN, fetchUS, enrichWithIndicators } from "@/data/market";
import { US_SYMBOLS } from "@/config/us-symbols";
import { scoreQuote, pickTop } from "@/framework/score";
import { DEFAULT_QUADRANT } from "@/framework/clock";
import { LlmConfigSchema } from "@/llm/client";
import { commentOnRankings } from "@/llm/analyst";
import type { DailyReport, Quote, Scored } from "@/framework/types";

const TOP_N = 10;
const PRESCREEN_N = 60; // 初筛保留数(按|涨跌幅|排序),再补指标,控制请求量
const DISCLAIMER = "本榜单为量化打分的线索性输出,不构成投资建议,实盘决策与盈亏自负。";

/** 初筛:全市场按当日振幅取最活跃的一批,避免对 5000 只逐个拉 K 线 */
function prescreen(quotes: Quote[], n: number): Quote[] {
  return [...quotes]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, n);
}

async function scoreMarket(quotes: Quote[], quadrant: DailyReport["quadrant"]["cn"], concurrency = 5): Promise<Scored[]> {
  const candidates = prescreen(quotes, PRESCREEN_N);
  const enriched: Quote[] = [];
  // 简单并发控制,分批补指标
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const done = await Promise.all(batch.map((q) => enrichWithIndicators(q)));
    enriched.push(...done);
  }
  return enriched.map((q) => scoreQuote(q, quadrant));
}

async function main(): Promise<void> {
  console.log("[scan] 开始取数...");
  const [cn, us] = await Promise.all([
    fetchAllCN().catch((e) => {
      console.error("A股取数失败:", e);
      return [] as Quote[];
    }),
    fetchUS(US_SYMBOLS).catch((e) => {
      console.error("美股取数失败:", e);
      return [] as Quote[];
    }),
  ]);
  console.log(`[scan] A股 ${cn.length} 只, 美股 ${us.length} 只`);

  const scoredCN = await scoreMarket(cn, DEFAULT_QUADRANT.CN);
  const scoredUS = await scoreMarket(us, DEFAULT_QUADRANT.US);
  const all = [...scoredCN, ...scoredUS];

  const { bull, bear } = pickTop(all, TOP_N);
  console.log(`[scan] 打分完成, 看涨${bull.length} 看跌${bear.length}`);

  let commentary = "";
  const llmEnv = {
    baseURL: process.env["LLM_BASE_URL"],
    apiKey: process.env["LLM_API_KEY"],
    model: process.env["LLM_MODEL"],
  };
  const parsed = LlmConfigSchema.safeParse(llmEnv);
  if (parsed.success) {
    try {
      commentary = await commentOnRankings(parsed.data, { cn: DEFAULT_QUADRANT.CN, us: DEFAULT_QUADRANT.US }, bull, bear);
      console.log("[scan] 大模型点评完成");
    } catch (e) {
      console.error("大模型点评失败(不影响榜单):", e);
    }
  } else {
    console.log("[scan] 未配置大模型,跳过点评");
  }

  const report: DailyReport = {
    generatedAt: new Date().toISOString(),
    quadrant: {
      cn: DEFAULT_QUADRANT.CN,
      us: DEFAULT_QUADRANT.US,
      note: "象限为框架默认值,复盘时在 src/framework/clock.ts 调整",
    },
    topBull: bull,
    topBear: bear,
    commentary,
    disclaimer: DISCLAIMER,
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/latest.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("[scan] 已写入 public/data/latest.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
