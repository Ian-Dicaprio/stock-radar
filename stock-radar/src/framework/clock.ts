import type { Market, Quadrant, Theme } from "./types";

/**
 * 当前美林时钟象限的默认值(回退用)。
 * 正常情况下由 public/data/macro.json 的 PMI/PPI 自动算出;
 * 只有当宏观数据缺失时,才回退到这里的默认值。
 */
export const DEFAULT_QUADRANT: Record<Market, Quadrant> = {
  US: "stagflation",
  CN: "recovery",
};

/**
 * 由宏观指标机械地推出象限。两轴各有天然分界线,填绝对值即可,无需判断趋势:
 *   增长方向:PMI ≥ 50 = 扩张,< 50 = 收缩
 *   通胀方向:PPI 同比 > 0 = 抬头,≤ 0 = 回落
 * pmi/ppi 任一缺失(null)则回退到 fallback(默认象限)。
 * 返回象限 + 一句人类可读的判定依据,写进报告 note。
 */
export function quadrantFromMacro(
  pmi: number | null,
  ppi: number | null,
  fallback: Quadrant,
): { quadrant: Quadrant; note: string } {
  if (pmi === null || ppi === null) {
    return { quadrant: fallback, note: "宏观数据未填(PMI/PPI 缺失),沿用默认象限" };
  }
  const growthUp = pmi >= 50;
  const inflationUp = ppi > 0;
  const quadrant: Quadrant = growthUp
    ? inflationUp
      ? "overheat" // 增长↑ 通胀↑
      : "recovery" // 增长↑ 通胀↓
    : inflationUp
      ? "stagflation" // 增长↓ 通胀↑
      : "recession"; // 增长↓ 通胀↓
  const gTxt = `PMI ${pmi}${growthUp ? "≥50 增长扩张" : "<50 增长收缩"}`;
  const iTxt = `PPI ${ppi}${inflationUp ? ">0 通胀抬头" : "≤0 通胀回落"}`;
  return { quadrant, note: `${gTxt}、${iTxt} → ${quadrantLabel(quadrant)}` };
}

/**
 * 象限 × 赛道 的契合加分表。
 * 正分=该象限下看好这个赛道;负分=逆风。范围约 [-15, +15]。
 */
const THEME_BY_QUADRANT: Record<Quadrant, Partial<Record<Theme, number>>> = {
  // 复苏:超配成长股,主线赛道全面加分
  recovery: {
    ai_compute: 12,
    green_power: 12,
    self_control: 10,
    biotech: 8,
    utility: 4,
    grain: 0,
  },
  // 过热:商品/资源占优,成长仍可但防通胀品种加分
  overheat: {
    ai_compute: 6,
    green_power: 8,
    grain: 10,
    utility: 6,
    self_control: 4,
  },
  // 滞胀:现金/防御占优,高估值成长逆风
  stagflation: {
    ai_compute: -10,
    biotech: -8,
    green_power: -4,
    grain: 12,
    utility: 10,
    self_control: -2,
  },
  // 衰退:债券占优,防御品种相对抗跌
  recession: {
    ai_compute: -6,
    green_power: -2,
    grain: 8,
    utility: 8,
    biotech: -4,
  },
};

/** 取某象限下某赛道的加分,未列出的赛道记 0 */
export function themeScore(quadrant: Quadrant, theme: Theme): number {
  return THEME_BY_QUADRANT[quadrant][theme] ?? 0;
}

/** 象限对整体权益的基础倾向:正=偏多,负=偏空 */
export function quadrantBias(quadrant: Quadrant): number {
  switch (quadrant) {
    case "recovery":
      return 8;
    case "overheat":
      return 2;
    case "stagflation":
      return -8;
    case "recession":
      return -6;
  }
}

/** 象限中文名,前端展示用 */
export function quadrantLabel(quadrant: Quadrant): string {
  switch (quadrant) {
    case "recovery":
      return "复苏（超配股票）";
    case "overheat":
      return "过热（超配商品）";
    case "stagflation":
      return "滞胀（超配现金）";
    case "recession":
      return "衰退（超配债券）";
  }
}
