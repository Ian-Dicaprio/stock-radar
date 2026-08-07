import { StockSDK } from "stock-sdk";
import type { Market, PeriodReturns, Quote } from "@/framework/types";
import { classifyTheme } from "@/framework/theme";

/**
 * 数据层:封装 stock-sdk,把原始行情映射成框架用的 Quote。
 *
 * 注意:stock-sdk v2 的字段名以其官方文档为准。这里做了一层防御性映射,
 * 若某字段取不到则置 null,打分引擎会自动跳过该因子(不会崩)。
 * 如遇字段对不上,只需改本文件的 map 函数,不影响其它模块。
 */

const sdk = new StockSDK();

/** 安全取数:任意字段缺失返回 null,不抛错 */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 把 sdk 的一条行情 + 指标映射成 Quote */
function toQuote(
  raw: Record<string, unknown>,
  market: Market,
  extra: { ma5?: number | null; ma20?: number | null; ma60?: number | null; volumeMa5?: number | null; rsi14?: number | null } = {},
): Quote {
  const name = String(raw["name"] ?? raw["symbol"] ?? "");
  return {
    symbol: String(raw["symbol"] ?? ""),
    name,
    market,
    price: num(raw["price"]) ?? 0,
    changePct: num(raw["changePct"]) ?? 0,
    volume: num(raw["volume"]) ?? 0,
    turnoverRate: num(raw["turnoverRate"]),
    ma5: extra.ma5 ?? null,
    ma20: extra.ma20 ?? null,
    ma60: extra.ma60 ?? null,
    volumeMa5: extra.volumeMa5 ?? null,
    rsi14: extra.rsi14 ?? null,
    northboundInflow: num(raw["northboundInflow"]),
    theme: classifyTheme(name),
  };
}

/**
 * 取 A 股全市场快照(约 5000+ 只)。用于每日扫描初筛。
 * 全市场批量只含基础行情,均线/RSI 需对候选股再单独拉 K 线补齐。
 */
export async function fetchAllCN(): Promise<Quote[]> {
  const list = (await sdk.batch.cn()) as unknown as Array<Record<string, unknown>>;
  return list.map((r) => toQuote(r, "CN"));
}

/** 取美股一批代码的行情(标普500/纳指100成分,代码表见 config) */
export async function fetchUS(symbols: readonly string[]): Promise<Quote[]> {
  const list = (await sdk.batch.byCodes([...symbols])) as unknown as Array<
    Record<string, unknown>
  >;
  return list.map((r) => toQuote(r, "US"));
}

/**
 * 给单只标的补齐技术指标(均线、量能、RSI)。
 * 扫描时只对初筛后的候选股调用,避免对全市场逐个拉 K 线。
 */
export async function enrichWithIndicators(q: Quote): Promise<Quote> {
  try {
    const fn = q.market === "CN" ? sdk.kline.cn : sdk.kline.us;
    const withInd = (await sdk.kline.withIndicators(q.symbol, {
      period: "daily",
      limit: 70,
      ma: [5, 20, 60],
      rsi: [14],
    })) as unknown as { candles?: Array<Record<string, unknown>> };
    void fn; // 保留引用,便于按需切换
    const candles = withInd.candles ?? [];
    const last = candles[candles.length - 1];
    if (!last) return q;
    const vols = candles.slice(-5).map((c) => num(c["volume"]) ?? 0);
    const volumeMa5 = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
    return {
      ...q,
      ma5: num(last["ma5"]),
      ma20: num(last["ma20"]),
      ma60: num(last["ma60"]),
      rsi14: num(last["rsi14"]),
      volumeMa5,
    };
  } catch {
    return q; // 取指标失败不影响主流程
  }
}

/** 从一根 candle 里稳健地取收盘价(字段名各源不一,逐个兜底) */
function closeOf(c: Record<string, unknown>): number | null {
  return (
    num(c["close"]) ??
    num(c["c"]) ??
    num(c["closePrice"]) ??
    num(c["收盘"]) ??
    num(c["price"])
  );
}

/**
 * 功能一:取单只标的的多周期涨跌幅。
 * 口径为「交易日滚动」:当日=最近1根、周=近5、月=近21、季=近63 个交易日,
 * 用收盘价算「最新收盘 vs N 根前收盘」。数据不足的周期返回 null。
 */
export async function fetchPeriodReturns(symbol: string, name: string): Promise<PeriodReturns> {
  const empty: PeriodReturns = { symbol, name, price: 0, day: null, week: null, month: null, quarter: null };
  try {
    const res = (await sdk.kline.withIndicators(symbol, {
      period: "daily",
      limit: 90,
    })) as unknown as { candles?: Array<Record<string, unknown>> };
    const candles = res.candles ?? [];
    const closes = candles.map(closeOf).filter((v): v is number => v !== null);
    const n = closes.length;
    if (n < 2) return empty;

    const last = closes[n - 1]!;
    // 取 back 根之前的收盘价作基准,算涨跌 %;不足则返回 null
    const ret = (back: number): number | null => {
      const idx = n - 1 - back;
      if (idx < 0) return null;
      const base = closes[idx]!;
      if (base === 0) return null;
      return Number((((last - base) / base) * 100).toFixed(2));
    };

    return {
      symbol,
      name,
      price: last,
      day: ret(1),
      week: ret(5),
      month: ret(21),
      quarter: ret(63),
    };
  } catch {
    return empty;
  }
}

/** 搜索标的(前端搜索页用) */
export async function searchSymbol(keyword: string): Promise<Quote[]> {
  const results = (await sdk.search(keyword)) as unknown as Array<
    Record<string, unknown>
  >;
  return results.slice(0, 20).map((r) => {
    const mkt: Market = String(r["market"] ?? "").toUpperCase().includes("US") ? "US" : "CN";
    return toQuote(r, mkt);
  });
}
