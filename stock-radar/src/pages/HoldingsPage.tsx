import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type Holding } from "@/store/settings";
import { searchSymbol, enrichWithIndicators } from "@/data/market";
import { scoreQuote } from "@/framework/score";
import { DEFAULT_QUADRANT } from "@/framework/clock";
import type { Scored } from "@/framework/types";

/** 持仓页:录入持仓 → 框架打分 → 提示偏离与再平衡方向 */
export function HoldingsPage(): JSX.Element {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [scored, setScored] = useState<Record<string, Scored>>({});
  const [form, setForm] = useState({ symbol: "", name: "", costPct: "" });

  useEffect(() => setHoldings(loadSettings().holdings), []);

  function persist(next: Holding[]): void {
    setHoldings(next);
    const s = loadSettings();
    saveSettings({ ...s, holdings: next });
  }

  function add(): void {
    const pct = Number(form.costPct);
    if (!form.symbol || !Number.isFinite(pct)) return;
    persist([...holdings, { symbol: form.symbol.trim(), name: form.name.trim() || form.symbol.trim(), costPct: pct }]);
    setForm({ symbol: "", name: "", costPct: "" });
  }

  function remove(symbol: string): void {
    persist(holdings.filter((h) => h.symbol !== symbol));
  }

  async function analyzeAll(): Promise<void> {
    const out: Record<string, Scored> = {};
    for (const h of holdings) {
      const hits = await searchSymbol(h.symbol);
      const first = hits[0];
      if (!first) continue;
      const enriched = await enrichWithIndicators(first);
      out[h.symbol] = scoreQuote(enriched, DEFAULT_QUADRANT[enriched.market]);
    }
    setScored(out);
  }

  const total = holdings.reduce((a, h) => a + h.costPct, 0);

  return (
    <div className="holdings">
      <div className="form-row">
        <input placeholder="代码" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
        <input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="仓位%" value={form.costPct} onChange={(e) => setForm({ ...form, costPct: e.target.value })} />
        <button onClick={add}>添加</button>
      </div>

      <div className="cash-note">
        已配置权益 {total.toFixed(0)}% · 现金 {(100 - total).toFixed(0)}%（框架均衡基准现金约15%）
      </div>

      {holdings.map((h) => {
        const s = scored[h.symbol];
        return (
          <div className="row" key={h.symbol}>
            <div className="info">
              <div className="name">{h.name}<span className="code">{h.symbol}</span><span className="theme">{h.costPct}%</span></div>
              {s && <div className="reasons">{s.reasons.join(" · ")}</div>}
            </div>
            {s && <span className={`score ${s.bullScore >= s.bearScore ? "bull" : "bear"}`}>{s.bullScore >= s.bearScore ? "偏多 " + s.bullScore : "偏空 " + s.bearScore}</span>}
            <button className="mini" onClick={() => remove(h.symbol)}>删</button>
          </div>
        );
      })}

      <button className="wide" onClick={analyzeAll} disabled={holdings.length === 0}>对全部持仓打分</button>
      <p className="disclaimer">不构成投资建议,盈亏自负。</p>
    </div>
  );
}
