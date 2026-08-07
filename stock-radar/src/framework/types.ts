import { z } from "zod";

/**
 * 美林时钟四象限。增长×通胀的组合决定当下超配什么资产。
 * recovery 复苏 / overheat 过热 / stagflation 滞胀 / recession 衰退
 */
export const QuadrantSchema = z.enum([
  "recovery",
  "overheat",
  "stagflation",
  "recession",
]);
export type Quadrant = z.infer<typeof QuadrantSchema>;

/** 市场归属 */
export const MarketSchema = z.enum(["CN", "US"]);
export type Market = z.infer<typeof MarketSchema>;

/**
 * 康波第六波主线赛道。命中主线的标的在打分时获得加分。
 */
export const ThemeSchema = z.enum([
  "ai_compute", // AI 算力/半导体
  "green_power", // 绿电/新能源
  "self_control", // 自主可控/国产替代
  "biotech", // 生物科技
  "grain", // 粮食/农业(抗通胀防御)
  "utility", // 电力公用事业(防御+算力用电)
  "other",
]);
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * 单只标的的原始行情输入。来自数据层(stock-sdk)。
 * 所有百分比字段单位为"个百分点"(如 5.2 表示 5.2%)。
 */
export const QuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  market: MarketSchema,
  price: z.number(),
  changePct: z.number(), // 当日涨跌幅 %
  ma5: z.number().nullable(),
  ma20: z.number().nullable(),
  ma60: z.number().nullable(),
  volume: z.number(), // 当日成交量
  volumeMa5: z.number().nullable(), // 5 日均量,用于判断放量
  rsi14: z.number().nullable(), // 相对强弱,判断超买超卖
  turnoverRate: z.number().nullable(), // 换手率 %
  theme: ThemeSchema.default("other"),
  northboundInflow: z.number().nullable().default(null), // 北向净流入(仅 A 股)
});
export type Quote = z.infer<typeof QuoteSchema>;

/** 打分明细,拆开每个因子便于前端展示"为什么上榜" */
export const ScoreBreakdownSchema = z.object({
  momentum: z.number(), // 动量
  volume: z.number(), // 量能
  theme: z.number(), // 赛道契合
  quadrant: z.number(), // 象限契合
  flow: z.number(), // 资金面(北向/估值)
  overbought: z.number(), // 超买惩罚(看跌时为正贡献)
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/** 单只标的的评分结果 */
export const ScoredSchema = z.object({
  quote: QuoteSchema,
  bullScore: z.number(), // 看涨综合分
  bearScore: z.number(), // 看跌综合分
  breakdown: ScoreBreakdownSchema,
  reasons: z.array(z.string()), // 人类可读的上榜理由
});
export type Scored = z.infer<typeof ScoredSchema>;

/** 每日扫描产物,前端首页直接读取这个 JSON */
export const DailyReportSchema = z.object({
  generatedAt: z.string(), // ISO 时间
  quadrant: z.object({
    cn: QuadrantSchema,
    us: QuadrantSchema,
    note: z.string(), // 象限判断依据(可由大模型或人工填)
  }),
  topBull: z.array(ScoredSchema),
  topBear: z.array(ScoredSchema),
  commentary: z.string().default(""), // 大模型对当日榜单的整体点评
  disclaimer: z.string(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

/**
 * 历史索引 index.json:记录所有已归档日期,前端据此按周期挑选快照文件。
 * 每个日期对应一份 history/<date>.json(结构同 DailyReport)。
 */
export const HistoryIndexSchema = z.object({
  dates: z.array(z.string()), // 交易日 "YYYY-MM-DD",升序
  updatedAt: z.string(),
});
export type HistoryIndex = z.infer<typeof HistoryIndexSchema>;

/**
 * 周期内某只标的的上榜统计。用于「复盘」页的出现排名。
 * side 区分是看涨榜还是看跌榜的统计。
 */
export const AppearanceStatSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  theme: ThemeSchema.default("other"),
  side: z.enum(["bull", "bear"]),
  count: z.number(), // 周期内上榜次数
  avgChangePct: z.number(), // 上榜当日涨跌幅均值 %
  avgScore: z.number(), // 上榜时该侧评分均值
  dates: z.array(z.string()), // 具体上榜日期
});
export type AppearanceStat = z.infer<typeof AppearanceStatSchema>;

/** 单只标的的多周期涨跌幅(功能一)。null 表示数据不足无法计算。 */
export const PeriodReturnsSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  day: z.number().nullable(), // 当日涨跌 %
  week: z.number().nullable(), // 近5交易日 %
  month: z.number().nullable(), // 近21交易日 %
  quarter: z.number().nullable(), // 近63交易日 %
});
export type PeriodReturns = z.infer<typeof PeriodReturnsSchema>;
