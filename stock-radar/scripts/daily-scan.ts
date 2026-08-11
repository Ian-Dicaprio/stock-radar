/**
 * 每日扫描脚本。由 GitHub Actions 每天收盘后运行:
 *   全市场取数 → 初筛 → 补技术指标 → 打分 → 取Top10 → (可选)大模型点评 → 写 public/data/latest.json
 *
 * 环境变量(在 GitHub 仓库 Secrets 配置,可选):
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL —— 缺省则跳过点评,只出打分榜单。
 *
 * 本地手动跑:  npm run scan
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fetchAllCN, fetchUS, enrichWithIndicators } from "@/data/market";
import { US_SYMBOLS } from "@/config/us-symbols";
import { scoreQuote, pickTop } from "@/framework/score";
import { DEFAULT_QUADRANT, quadrantFromMacro } from "@/framework/clock";
import { LlmConfigSchema } from "@/llm/client";
import { commentOnRankings } from "@/llm/analyst";
import { HistoryIndexSchema, MacroSchema, type DailyReport, type HistoryIndex, type Macro, type Quote, type Scored } from "@/framework/types";

/** 读宏观数据文件 macro.json;读不到则返回空(判定时回退默认象限)。 */
async function loadMacro(): Promise<Macro> {
  try {
    const raw = await readFile("public/data/macro.json", "utf-8");
    return MacroSchema.parse(JSON.parse(raw));
  } catch {
    return MacroSchema.parse({ cn: {}, us: {} });
  }
}

/** 北京日期 YYYY-MM-DD。扫描在北京 16:30 收盘后跑,用东八区日期归档。 */
function beijingDate(): string {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

/** 把当天报告写入 history/<date>.json 并更新 index.json(去重、升序) */
async function archiveHistory(report: DailyReport, date: string): Promise<void> {
  await mkdir("public/data/history", { recursive: true });
  await writeFile(`public/data/history/${date}.json`, JSON.stringify(report, null, 2), "utf-8");

  let index: HistoryIndex = { dates: [], updatedAt: "" };
  try {
    const raw = await readFile("public/data/history/index.json", "utf-8");
    index = HistoryIndexSchema.parse(JSON.parse(raw));
  } catch {
    // 首次运行无索引,用空索引起步
  }
  const dates = Array.from(new Set([...index.dates, date])).sort();
  const next: HistoryIndex = { dates, updatedAt: new Date().toISOString() };
  await writeFile("public/data/history/index.json", JSON.stringify(next, null, 2), "utf-8");
  console.log(`[scan] 已归档历史 ${date}, 累计 ${dates.length} 个交易日`);
}

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

  // 读宏观数据,按 PMI×PPI 规则算出当前象限(缺数据则回退默认象限)
  const macro = await loadMacro();
  const cnQ = quadrantFromMacro(macro.cn.pmi, macro.cn.ppi, DEFAULT_QUADRANT.CN);
  const usQ = quadrantFromMacro(macro.us.pmi, macro.us.ppi, DEFAULT_QUADRANT.US);
  console.log(`[scan] 象限判定 A股=${cnQ.quadrant}(${cnQ.note}) 美股=${usQ.quadrant}(${usQ.note})`);

  const scoredCN = await scoreMarket(cn, cnQ.quadrant);
  const scoredUS = await scoreMarket(us, usQ.quadrant);
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
      commentary = await commentOnRankings(parsed.data, { cn: cnQ.quadrant, us: usQ.quadrant }, bull, bear);
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
      cn: cnQ.quadrant,
      us: usQ.quadrant,
      note: `A股: ${cnQ.note}；美股: ${usQ.note}`,
    },
    topBull: bull,
    topBear: bear,
    commentary,
    disclaimer: DISCLAIMER,
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/latest.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("[scan] 已写入 public/data/latest.json");

  // 归档为带日期的历史快照,供「复盘」页做周期统计
  await archiveHistory(report, beijingDate());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
