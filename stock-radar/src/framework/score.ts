import type { Quadrant, Quote, Scored, ScoreBreakdown } from "./types";
import { quadrantBias, themeScore } from "./clock";

/**
 * 打分引擎。输入单只行情 + 当前象限,输出看涨/看跌分与明细。
 *
 * 设计原则(对齐用户框架):
 * - 动量:价格站上均线、近期涨幅 → 顺势看涨
 * - 量能:放量代表资金关注度
 * - 赛道:命中康波第六波主线且象限契合 → 加分
 * - 象限:美林时钟对整体权益的多空倾向
 * - 资金面:北向净流入(A股)为正向信号
 * - 超买:RSI 过高 → 看涨减分、看跌加分(追高风险)
 *
 * 所有权重集中在这里,复盘时可调。看涨/看跌不是简单相反数:
 * 超买在看涨侧是惩罚、在看跌侧是加分,形成非对称。
 */

const WEIGHTS = {
  momentumMaxAbs: 25,
  volumeMaxAbs: 15,
  overboughtMaxAbs: 15,
  flowMaxAbs: 10,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 动量分:基于价格相对均线位置 + 当日涨跌幅 */
function momentumScore(q: Quote): number {
  let s = 0;
  if (q.ma20 !== null) s += q.price >= q.ma20 ? 8 : -8;
  if (q.ma60 !== null) s += q.price >= q.ma60 ? 6 : -6;
  if (q.ma5 !== null && q.ma20 !== null) {
    s += q.ma5 >= q.ma20 ? 5 : -5; // 短均线在长均线上方=多头排列
  }
  s += clamp(q.changePct, -6, 6); // 当日涨跌幅直接计入,封顶避免异动
  return clamp(s, -WEIGHTS.momentumMaxAbs, WEIGHTS.momentumMaxAbs);
}

/** 量能分:当日量 / 5 日均量,放量为正 */
function volumeScore(q: Quote): number {
  if (q.volumeMa5 === null || q.volumeMa5 === 0) return 0;
  const ratio = q.volume / q.volumeMa5;
  // ratio 1.0=持平计 0,2.0=放量满分,0.5=缩量负分
  const s = (ratio - 1) * 15;
  return clamp(s, -WEIGHTS.volumeMaxAbs, WEIGHTS.volumeMaxAbs);
}

/** 超买/超卖分:返回"看涨侧的调整值"(超买为负) */
function overboughtAdjust(q: Quote): number {
  if (q.rsi14 === null) return 0;
  // RSI>70 超买 → 看涨减分;RSI<30 超卖 → 看涨加分(可能反弹)
  if (q.rsi14 >= 70) return -clamp((q.rsi14 - 70) * 1.0, 0, WEIGHTS.overboughtMaxAbs);
  if (q.rsi14 <= 30) return clamp((30 - q.rsi14) * 1.0, 0, WEIGHTS.overboughtMaxAbs);
  return 0;
}

/** 资金面分:北向净流入(仅 A 股有值) */
function flowScore(q: Quote): number {
  if (q.northboundInflow === null) return 0;
  const s = Math.sign(q.northboundInflow) * Math.min(Math.abs(q.northboundInflow) / 1e8, 1) * 10;
  return clamp(s, -WEIGHTS.flowMaxAbs, WEIGHTS.flowMaxAbs);
}

export function scoreQuote(q: Quote, quadrant: Quadrant): Scored {
  const momentum = momentumScore(q);
  const volume = volumeScore(q);
  const theme = themeScore(quadrant, q.theme);
  const quadrantPart = quadrantBias(quadrant);
  const flow = flowScore(q);
  const overbought = overboughtAdjust(q);

  const breakdown: ScoreBreakdown = {
    momentum,
    volume,
    theme,
    quadrant: quadrantPart,
    flow,
    overbought,
  };

  // 看涨:顺势因子相加,超买作为惩罚
  const bullScore =
    momentum + volume + theme + quadrantPart + flow + overbought;

  // 看跌:动量与资金面反向,超买转为看跌加分,逆风赛道(theme 为负)转为看跌正贡献
  const bearScore =
    -momentum - volume - theme - quadrantPart - flow + Math.max(0, -overbought) * 1.0;

  const reasons = buildReasons(q, breakdown);

  return {
    quote: q,
    bullScore: Number(bullScore.toFixed(2)),
    bearScore: Number(bearScore.toFixed(2)),
    breakdown,
    reasons,
  };
}

/** 生成人类可读的上榜理由,前端展示 */
function buildReasons(q: Quote, b: ScoreBreakdown): string[] {
  const r: string[] = [];
  if (b.momentum > 8) r.push("多头排列，站上关键均线");
  if (b.momentum < -8) r.push("跌破均线，趋势走弱");
  if (b.volume > 6) r.push("明显放量，资金关注");
  if (b.theme > 6) r.push("命中当前象限看好的主线赛道");
  if (b.theme < -6) r.push("所处赛道在当前象限逆风");
  if (b.flow > 4) r.push("北向资金净流入");
  if (b.flow < -4) r.push("北向资金净流出");
  if (b.overbought < -6) r.push("RSI 超买，追高风险");
  if (b.overbought > 6) r.push("RSI 超卖，存在反弹可能");
  if (r.length === 0) r.push("各因子中性，综合评分排序");
  return r;
}

/** 对一批已评分标的排序,取看涨/看跌各前 N */
export function pickTop(
  scored: Scored[],
  n: number,
): { bull: Scored[]; bear: Scored[] } {
  const bull = [...scored].sort((a, b) => b.bullScore - a.bullScore).slice(0, n);
  const bear = [...scored].sort((a, b) => b.bearScore - a.bearScore).slice(0, n);
  return { bull, bear };
}
