import type { LlmConfig } from "./client";
import { chat } from "./client";
import type { Quadrant, Scored } from "@/framework/types";
import { quadrantLabel } from "@/framework/clock";
import { themeLabel } from "@/framework/theme";

/** 分析师人设:把用户的多周期+美林时钟框架固化为 system prompt */
const SYSTEM_PROMPT = `你是一名严谨的金融分析师,使用"多周期嵌套 + 美林时钟"框架:
- 康波周期定大方向(当前第五波IT尾声向第六波AI/新能源/生物过渡)
- 朱格拉周期看资本开支(AI算力capex是主线)
- 基钦/库存周期做择时
- 美林时钟用"增长×通胀"定当下配置:复苏超配股、过热超配商品、滞胀超配现金、衰退超配债
关注A股(社融/政策/北向)与美股(美联储/CPI/AI capex)。
输出要求:简洁、给出多空倾向与理由、必须附一句风险提示"不构成投资建议,盈亏自负"。
不要编造精确数字;打分是量化线索,不是买卖信号。`;

/** 对每日 Top10 榜单生成整体点评 */
export async function commentOnRankings(
  config: LlmConfig,
  quadrant: { cn: Quadrant; us: Quadrant },
  bull: readonly Scored[],
  bear: readonly Scored[],
): Promise<string> {
  const fmt = (list: readonly Scored[]) =>
    list
      .map(
        (s, i) =>
          `${i + 1}. ${s.quote.name}(${s.quote.symbol}) [${themeLabel(s.quote.theme)}] 分=${s.bullScore}/${s.bearScore} 理由:${s.reasons.join("、")}`,
      )
      .join("\n");

  const user = `当前象限:A股=${quadrantLabel(quadrant.cn)},美股=${quadrantLabel(quadrant.us)}
今日看涨Top:
${fmt(bull)}
今日看跌Top:
${fmt(bear)}
请用200字内点评今日多空格局,指出最值得关注的1-2个方向和1个风险点。`;

  return chat(config, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]);
}

/** 对单只标的做深度分析(搜索页/持仓页用) */
export async function analyzeOne(
  config: LlmConfig,
  scored: Scored,
  quadrant: Quadrant,
  question?: string,
): Promise<string> {
  const q = scored.quote;
  const facts = `标的:${q.name}(${q.symbol}) 市场:${q.market} 赛道:${themeLabel(q.theme)}
现价:${q.price} 涨跌:${q.changePct}% RSI:${q.rsi14 ?? "NA"}
均线 MA5/20/60:${q.ma5 ?? "NA"}/${q.ma20 ?? "NA"}/${q.ma60 ?? "NA"}
框架打分 看涨/看跌:${scored.bullScore}/${scored.bearScore}
命中理由:${scored.reasons.join("、")}
当前象限:${quadrantLabel(quadrant)}`;

  const user = question
    ? `${facts}\n\n用户问题:${question}`
    : `${facts}\n\n请基于框架给出该标的的多空判断、关键位与操作倾向。`;

  return chat(config, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ]);
}
