/**
 * 技术指标纯函数。输入收盘价/成交量数组(升序,最后一个是最新),
 * 输出指标值;数据不足返回 null(打分引擎遇 null 会自动跳过该因子)。
 *
 * 这些函数让「每日扫描」能用自建的收盘价滚动缓存自己算指标,
 * 从而对全市场 5000 只 A 股打分,而不必逐只拉 K 线。
 */

/** 简单移动平均:取最后 period 个收盘价的均值。不足 period 返回 null。 */
export function sma(closes: readonly number[], period: number): number | null {
  if (closes.length < period || period <= 0) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(3));
}

/**
 * RSI(相对强弱)。用最后 period+1 个收盘价算 period 期的涨跌均值。
 * 不足则返回 null。范围 0-100,>70 超买、<30 超卖。
 */
export function rsi(closes: readonly number[], period: number): number | null {
  if (closes.length < period + 1 || period <= 0) return null;
  const slice = closes.slice(-(period + 1));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i]! - slice[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff; // loss 取正值累加
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100; // 全涨=100,全平=50
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

/** 成交量移动平均:最后 period 个成交量的均值。不足返回 null。 */
export function volumeMa(volumes: readonly number[], period: number): number | null {
  if (volumes.length < period || period <= 0) return null;
  const slice = volumes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(0));
}
