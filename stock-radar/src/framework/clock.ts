import type { Market, Quadrant, Theme } from "./types";

/**
 * 当前美林时钟象限。这是一个"人工/大模型判断"的输入项,
 * 因为宏观象限无法从个股行情自动算出,需结合政策与数据。
 * 部署后可在 config/quadrant.json 覆盖,或让每日扫描脚本调大模型判定。
 *
 * 默认值来自 2026-08 初的判断:美股偏滞胀、A股衰退末期转复苏。
 * 复盘时更新此处即可让全盘打分随象限切换。
 */
export const DEFAULT_QUADRANT: Record<Market, Quadrant> = {
  US: "stagflation",
  CN: "recovery",
};

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
