import { useState } from "react";
import { searchSymbol, enrichWithIndicators } from "@/data/market";
import { scoreQuote } from "@/framework/score";
import { DEFAULT_QUADRANT } from "@/framework/clock";
import { analyzeOne } from "@/llm/analyst";
import { LlmConfigSchema } from "@/llm/client";
import { loadSettings } from "@/store/settings";
import type { Scored } from "@/framework/types";

/** 搜索任意标的 → 浏览器直接取行情 → 框架打分 → (有Key则)大模型分析 */
export function SearchPage(): JSX.Element {
  const [kw, setKw] = useState("");
  const [results, setResults] = useState<Scored[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function onSearch(): Promise<void> {
    if (!kw.trim()) return;
    setBusy(true);
    setAnalysis("");
    try {
      const hits = await searchSymbol(kw.trim());
      const scored = await Promise.all(
        hits.slice(0, 8).map(async (q) => {
          const enriched = await enrichWithIndicators(q);
          return scoreQuote(enriched, DEFAULT_QUADRANT[enriched.market]);
        }),
      );
      setResults(scored);
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze(s: Scored): Promise<void> {
    const cfg = LlmConfigSchema.safeParse(loadSettings().llm);
    if (!cfg.success) {
      setAnalysis("请先到「设置」填写大模型 API,才能生成分析。");
      return;
    }
    setBusy(true);
    try {
      const text = await analyzeOne(cfg.data, s, DEFAULT_QUADRANT[s.quote.market]);
      setAnalysis(text);
    } catch (e) {
      setAnalysis(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="search">
      <div className="searchbar">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="输入代码或名称,如 600519 / 茅台 / NVDA"
        />
        <button onClick={onSearch} disabled={busy}>搜索</button>
      </div>

      {results.map((s) => (
        <div className="row" key={s.quote.symbol}>
          <div className="info">
            <div className="name">{s.quote.name}<span className="code">{s.quote.symbol}</span></div>
            <div className="reasons">{s.reasons.join(" · ")}</div>
          </div>
          <span className="score bull">{s.bullScore}</span>
          <button className="mini" onClick={() => onAnalyze(s)} disabled={busy}>AI分析</button>
        </div>
      ))}

      {analysis && <section className="commentary"><h3>AI 分析</h3><p>{analysis}</p></section>}
      <p className="disclaimer">不构成投资建议,盈亏自负。</p>
    </div>
  );
}
