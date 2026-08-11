/**
 * 每日扫描脚本。由 GitHub Actions 每天收盘后运行:
 *   全市场取数 → (A股)收盘价缓存算指标全市场打分 / (美股)逐只拉K线 → 取Top10
 *   → (可选)大模型点评 → 写 public/data/latest.json + 归档 history/<date>.json
 *
 * A股不再按当日振幅初筛,而是用自建的收盘价滚动缓存(public/data/kline-cache.json)
 * 自己算均线/RSI,对全市场约5000只一视同仁打分。缓存每天追加今日收盘价,
 * 并每天补种一批(SEED_BUDGET)股票的历史K线,约2-3周补满全市场。
 *
 * 环境变量(在 GitHub 仓库 Secrets 配置,可选):
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL —— 缺省则跳过点评,只出打分榜单。
 *
 * 本地手动跑:  npm run scan
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fetchAllCN, fetchUS, enrichWithIndicators, fetchClosesHistory } from "@/data/market";
import { US_SYMBOLS } from "@/config/us-symbols";
import { scoreQuote, pickTop } from "@/framework/score";
import { DEFAULT_QUADRANT, quadrantFromMacro } from "@/framework/clock";
import { sma, rsi, volumeMa } from "@/framework/indicators";
import { LlmConfigSchema } from "@/llm/client";
import { commentOnRankings } from "@/llm/analyst";
import {
  HistoryIndexSchema,
  MacroSchema,
  KlineCacheSchema,
  type CacheEntry,
  type DailyReport,
  type HistoryIndex,
  type KlineCache,
  type Macro,
  type Quadrant,
  type Quote,
  type Scored,
} from "@/framework/types";

const TOP_N = 10;
const PRESCREEN_N = 60; // 美股初筛保留数(美股仅35只,基本全过)
const KEEP_CLOSES = 65; // 缓存保留的收盘价根数(够算 MA60)
const KEEP_VOLUMES = 6; // 缓存保留的成交量根数(够算 5 日均量)
const SEED_BUDGET = 300; // 每天最多拉多少只K线(补种+自愈合计),控制请求量
const SEED_CONCURRENCY = 12; // 补种并发
const SPLIT_DEVIATION = 0.05; // 涨跌幅交叉校验偏差阈值,超过判为除权→重新补种
const CACHE_FILE = "public/data/kline-cache.json";
const DISCLAIMER = "本榜单为量化打分的线索性输出,不构成投资建议,实盘决策与盈亏自负。";

/** 北京日期 YYYY-MM-DD。扫描在北京收盘后跑,用东八区日期。 */
function beijingDate(): string {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

/** 读宏观数据 macro.json;读不到则空(判定时回退默认象限)。 */
async function loadMacro(): Promise<Macro> {
  try {
    return MacroSchema.parse(JSON.parse(await readFile("public/data/macro.json", "utf-8")));
  } catch {
    return MacroSchema.parse({ cn: {}, us: {} });
  }
}

/** 读收盘价滚动缓存;读不到则空。 */
async function loadCache(): Promise<KlineCache> {
  try {
    return KlineCacheSchema.parse(JSON.parse(await readFile(CACHE_FILE, "utf-8")));
  } catch {
    return KlineCacheSchema.parse({ cn: {} });
  }
}

/** 写缓存。不缩进以控制体积。 */
async function saveCache(cache: KlineCache): Promise<void> {
  cache.updatedAt = new Date().toISOString();
  await mkdir("public/data", { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
}

/**
 * 交易日守卫:全市场若极少数股票有涨跌(<20%),判为休市。
 * 休市日不追加缓存、不归档,避免陈价污染均线窗口与复盘统计。
 * 注:这是无节假日表时的启发式,已知残余风险(数据源在休市日返回非零涨跌则会误判)。
 */
function isTradingDay(quotes: Quote[]): boolean {
  if (quotes.length === 0) return false;
  const nonzero = quotes.filter((q) => q.changePct !== 0).length;
  return nonzero / quotes.length >= 0.2;
}

/** 从缓存条目算指标 */
function computeIndicators(entry: CacheEntry): Pick<Quote, "ma5" | "ma20" | "ma60" | "rsi14" | "volumeMa5"> {
  return {
    ma5: sma(entry.closes, 5),
    ma20: sma(entry.closes, 20),
    ma60: sma(entry.closes, 60),
    rsi14: rsi(entry.closes, 14),
    volumeMa5: volumeMa(entry.volumes, 5),
  };
}

/**
 * 选出今天要拉K线的股票:优先补"历史不足60根"的(冷启动补种),
 * 有余量再按 seededAt 最老的做自愈(修正除权),合计不超过 SEED_BUDGET。
 */
function pickSeedTargets(cache: KlineCache, symbols: string[], today: string): string[] {
  const incomplete: string[] = [];
  const seeded: Array<{ sym: string; at: string }> = [];
  for (const sym of symbols) {
    const e = cache.cn[sym];
    if (!e || e.closes.length < 60) incomplete.push(sym);
    else seeded.push({ sym, at: e.seededAt || "" });
  }
  const targets = incomplete.slice(0, SEED_BUDGET);
  if (targets.length < SEED_BUDGET) {
    seeded.sort((a, b) => a.at.localeCompare(b.at));
    for (const s of seeded) {
      if (targets.length >= SEED_BUDGET) break;
      if (s.at === today) continue;
      targets.push(s.sym);
    }
  }
  return targets;
}

/** 拉目标股票的历史K线写入缓存(补种/自愈)。返回成功数。 */
async function seedTargets(cache: KlineCache, targets: string[], today: string): Promise<number> {
  let done = 0;
  for (let i = 0; i < targets.length; i += SEED_CONCURRENCY) {
    const batch = targets.slice(i, i + SEED_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sym) => ({ sym, h: await fetchClosesHistory(sym, KEEP_CLOSES) })),
    );
    for (const { sym, h } of results) {
      if (h.closes.length === 0) continue;
      cache.cn[sym] = {
        closes: h.closes,
        volumes: h.volumes.slice(-KEEP_VOLUMES),
        lastDate: today, // 补种已含今日,防 appendToday 二次追加
        seededAt: today,
      };
      done++;
    }
  }
  return done;
}

/**
 * 把今日收盘价/成交量追加进缓存。仅交易日调用。
 * 已含今日的跳过;除权交叉校验:实际收盘偏离"昨收×(1+涨跌%)"过大→清空待重种。
 */
function appendToday(cache: KlineCache, quotes: Quote[], today: string): void {
  for (const q of quotes) {
    if (!q.symbol || q.price <= 0) continue;
    const e: CacheEntry = cache.cn[q.symbol] ?? { closes: [], volumes: [], lastDate: "", seededAt: "" };
    if (e.lastDate === today) continue;
    const prev = e.closes[e.closes.length - 1];
    if (prev !== undefined && prev > 0) {
      const expected = prev * (1 + q.changePct / 100);
      if (expected > 0 && Math.abs(q.price - expected) / expected > SPLIT_DEVIATION) {
        e.closes = [];
        e.volumes = [];
        e.seededAt = ""; // 疑似除权/跳变,清空历史,下次补种自愈
      }
    }
    e.closes.push(Number(q.price.toFixed(2)));
    e.volumes.push(Math.round(q.volume));
    if (e.closes.length > KEEP_CLOSES) e.closes = e.closes.slice(-KEEP_CLOSES);
    if (e.volumes.length > KEEP_VOLUMES) e.volumes = e.volumes.slice(-KEEP_VOLUMES);
    e.lastDate = today;
    cache.cn[q.symbol] = e;
  }
}

/** A股打分:全市场,用缓存算的指标,无当日振幅初筛。 */
function scoreMarketCN(quotes: Quote[], cache: KlineCache, quadrant: Quadrant): Scored[] {
  return quotes
    .filter((q) => q.symbol)
    .map((q) => {
      const e = cache.cn[q.symbol];
      const ind = e
        ? computeIndicators(e)
        : { ma5: null, ma20: null, ma60: null, rsi14: null, volumeMa5: null };
      return scoreQuote({ ...q, ...ind }, quadrant);
    });
}

/** 美股打分:原路径,初筛后逐只拉K线补指标(美股仅35只)。 */
async function scoreMarketUS(quotes: Quote[], quadrant: Quadrant, concurrency = 5): Promise<Scored[]> {
  const candidates = [...quotes]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, PRESCREEN_N);
  const enriched: Quote[] = [];
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    enriched.push(...(await Promise.all(batch.map((q) => enrichWithIndicators(q)))));
  }
  return enriched.map((q) => scoreQuote(q, quadrant));
}

/** 把当天报告写入 history/<date>.json 并更新 index.json(去重、升序) */
async function archiveHistory(report: DailyReport, date: string): Promise<void> {
  await mkdir("public/data/history", { recursive: true });
  await writeFile(`public/data/history/${date}.json`, JSON.stringify(report, null, 2), "utf-8");

  let index: HistoryIndex = { dates: [], updatedAt: "" };
  try {
    index = HistoryIndexSchema.parse(JSON.parse(await readFile("public/data/history/index.json", "utf-8")));
  } catch {
    // 首次运行无索引
  }
  const dates = Array.from(new Set([...index.dates, date])).sort();
  await writeFile(
    "public/data/history/index.json",
    JSON.stringify({ dates, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
  console.log(`[scan] 已归档历史 ${date}, 累计 ${dates.length} 个交易日`);
}

async function main(): Promise<void> {
  const today = beijingDate();
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

  const macro = await loadMacro();
  const cnQ = quadrantFromMacro(macro.cn.pmi, macro.cn.ppi, DEFAULT_QUADRANT.CN);
  const usQ = quadrantFromMacro(macro.us.pmi, macro.us.ppi, DEFAULT_QUADRANT.US);
  console.log(`[scan] 象限 A股=${cnQ.quadrant} 美股=${usQ.quadrant}`);

  const cache = await loadCache();
  const tradingDay = isTradingDay(cn);

  // 补种/自愈:每天拉一批K线补历史(冷启动约2-3周补满);非交易日也补,补的是历史
  const symbols = cn.map((q) => q.symbol).filter((s) => s.length > 0);
  const targets = pickSeedTargets(cache, symbols, today);
  const seeded = await seedTargets(cache, targets, today);
  const total = Object.keys(cache.cn).length;
  console.log(`[scan] 补种/自愈 ${seeded}/${targets.length} 只, 缓存累计 ${total} 只`);

  if (!tradingDay) {
    console.log("[scan] 非交易日(全市场涨跌近乎全0),跳过缓存追加/归档,仅保存补种进度");
    await saveCache(cache);
    return;
  }

  appendToday(cache, cn, today);

  const scoredCN = scoreMarketCN(cn, cache, cnQ.quadrant);
  const scoredUS = await scoreMarketUS(us, usQ.quadrant);
  const { bull, bear } = pickTop([...scoredCN, ...scoredUS], TOP_N);
  console.log(`[scan] 打分完成, 参与A股${scoredCN.length} 美股${scoredUS.length}, 看涨${bull.length} 看跌${bear.length}`);

  let commentary = "";
  const parsed = LlmConfigSchema.safeParse({
    baseURL: process.env["LLM_BASE_URL"],
    apiKey: process.env["LLM_API_KEY"],
    model: process.env["LLM_MODEL"],
  });
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
    quadrant: { cn: cnQ.quadrant, us: usQ.quadrant, note: `A股: ${cnQ.note}；美股: ${usQ.note}` },
    topBull: bull,
    topBear: bear,
    commentary,
    disclaimer: DISCLAIMER,
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/latest.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("[scan] 已写入 public/data/latest.json");

  await saveCache(cache);
  await archiveHistory(report, today);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
