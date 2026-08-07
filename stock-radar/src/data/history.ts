import {
  DailyReportSchema,
  HistoryIndexSchema,
  type AppearanceStat,
  type DailyReport,
} from "@/framework/types";

/**
 * 历史数据层:读取每日归档快照(history/<date>.json),
 * 按用户选择的周期聚合出「多空出现排名」。纯前端 fetch,零后端。
 */

/** 周期选项。trailing = 近 N 个交易日;calendar = 自然周/月/季至今 */
export type PeriodKey = "week" | "month" | "quarter" | "custom";

/** 读历史索引(所有已归档交易日,升序)。无历史时返回空。 */
export async function loadHistoryIndex(): Promise<string[]> {
  try {
    const r = await fetch("./data/history/index.json");
    if (!r.ok) return [];
    const idx = HistoryIndexSchema.parse(await r.json());
    return idx.dates;
  } catch {
    return [];
  }
}

/** 读单日快照 */
async function loadReport(date: string): Promise<DailyReport | null> {
  try {
    const r = await fetch(`./data/history/${date}.json`);
    if (!r.ok) return null;
    return DailyReportSchema.parse(await r.json());
  } catch {
    return null;
  }
}

/** 从升序日期数组里按周期筛出要统计的日期区间 */
export function pickDates(
  allDates: string[],
  period: PeriodKey,
  custom?: { from: string; to: string },
): string[] {
  if (allDates.length === 0) return [];
  if (period === "custom" && custom) {
    return allDates.filter((d) => d >= custom.from && d <= custom.to);
  }
  const n = period === "week" ? 5 : period === "month" ? 21 : 63;
  return allDates.slice(-n);
}

/** 聚合结果:看涨/看跌两侧的出现排名 */
export interface RankingResult {
  dates: string[]; // 实际参与统计的交易日
  bull: AppearanceStat[];
  bear: AppearanceStat[];
}
/** 单侧累加器 */
interface Acc {
  symbol: string;
  name: string;
  theme: AppearanceStat["theme"];
  count: number;
  sumChange: number;
  sumScore: number;
  dates: string[];
}

/**
 * 核心:拉取周期内所有快照,统计每只标的在看涨/看跌榜的出现次数、
 * 上榜当日涨跌幅均值、该侧评分均值。按出现次数降序、次数相同按评分降序。
 */
export async function aggregateRankings(
  allDates: string[],
  period: PeriodKey,
  custom?: { from: string; to: string },
): Promise<RankingResult> {
  const dates = pickDates(allDates, period, custom);
  const reports = await Promise.all(dates.map(loadReport));

  const bullMap = new Map<string, Acc>();
  const bearMap = new Map<string, Acc>();

  const tally = (
    map: Map<string, Acc>,
    list: DailyReport["topBull"],
    date: string,
    side: "bull" | "bear",
  ): void => {
    for (const s of list) {
      // 优先用归一化代码做 key;历史快照里 symbol 可能为空(旧数据源字段缺失),
      // 退回用股票名,避免不同标的因空 symbol 被错误合并成一行。
      const key = s.quote.symbol || s.quote.name;
      const prev = map.get(key) ?? {
        symbol: s.quote.symbol,
        name: s.quote.name,
        theme: s.quote.theme,
        count: 0,
        sumChange: 0,
        sumScore: 0,
        dates: [] as string[],
      };
      prev.count += 1;
      prev.sumChange += s.quote.changePct;
      prev.sumScore += side === "bull" ? s.bullScore : s.bearScore;
      prev.dates.push(date);
      map.set(key, prev);
    }
  };

  reports.forEach((rep, i) => {
    if (!rep) return;
    const date = dates[i]!;
    tally(bullMap, rep.topBull, date, "bull");
    tally(bearMap, rep.topBear, date, "bear");
  });

  const finalize = (map: Map<string, Acc>, side: "bull" | "bear"): AppearanceStat[] =>
    [...map.values()]
      .map((a) => ({
        symbol: a.symbol,
        name: a.name,
        theme: a.theme,
        side,
        count: a.count,
        avgChangePct: Number((a.sumChange / a.count).toFixed(2)),
        avgScore: Number((a.sumScore / a.count).toFixed(2)),
        dates: a.dates,
      }))
      .sort((x, y) => y.count - x.count || y.avgScore - x.avgScore);

  return {
    dates,
    bull: finalize(bullMap, "bull"),
    bear: finalize(bearMap, "bear"),
  };
}
