import { useEffect, useState } from "react";
import {
  aggregateRankings,
  loadHistoryIndex,
  type PeriodKey,
  type RankingResult,
} from "@/data/history";
import { fetchPeriodReturns } from "@/data/market";
import { themeLabel } from "@/framework/theme";
import type { AppearanceStat, PeriodReturns } from "@/framework/types";

const PERIODS: ReadonlyArray<{ id: PeriodKey; label: string }> = [
  { id: "week", label: "每周" },
  { id: "month", label: "每月" },
  { id: "quarter", label: "季度" },
  { id: "custom", label: "自定义" },
];

/** 涨跌幅上色:红涨绿跌(A股习惯),null 显示 — */
function Pct({ v }: { v: number | null }): JSX.Element {
  if (v === null) return <span className="pct flat">—</span>;
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  return <span className={`pct ${cls}`}>{v > 0 ? "+" : ""}{v}%</span>;
}

/**
 * 复盘页:
 *  上半部(功能二)——选周期,看多空雷达每日看涨/看跌股票的出现排名+平均涨幅。
 *  下半部(功能一)——点任意股票或搜代码,看其当日/周/月/季涨跌。
 */
export function ReviewPage(): JSX.Element {
  const [allDates, setAllDates] = useState<string[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [result, setResult] = useState<RankingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<{ symbol: string; name: string } | null>(null);

  useEffect(() => {
    loadHistoryIndex().then(setAllDates);
  }, []);

  useEffect(() => {
    if (allDates.length === 0) return;
    if (period === "custom" && (!custom.from || !custom.to)) return;
    setLoading(true);
    aggregateRankings(allDates, period, period === "custom" ? custom : undefined)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [allDates, period, custom]);

  return (
    <div className="review">
      <PeriodPicker
        period={period}
        onPeriod={setPeriod}
        custom={custom}
        onCustom={setCustom}
        dateRange={allDates}
      />

      {allDates.length === 0 && (
        <p className="hint">
          尚无历史数据。每日扫描跑过并归档后,这里会按周期统计多空出现排名。
          (首次部署后需等自动扫描累积几天,或手动在 Actions 里多跑几次)
        </p>
      )}

      {loading && <p className="hint">统计中…</p>}

      {result && result.dates.length > 0 && (
        <>
          <p className="hint">
            统计区间:{result.dates[0]} ~ {result.dates[result.dates.length - 1]}
            (共 {result.dates.length} 个交易日)
          </p>
          <div className="two-col">
            <RankBoard title="看涨出现排名" list={result.bull} kind="bull" onPick={setPicked} />
            <RankBoard title="看跌出现排名" list={result.bear} kind="bear" onPick={setPicked} />
          </div>
        </>
      )}

      <SingleStock picked={picked} onPick={setPicked} />
      <p className="disclaimer">榜单为量化线索,不构成投资建议,盈亏自负。</p>
    </div>
  );
}
function PeriodPicker({
  period,
  onPeriod,
  custom,
  onCustom,
  dateRange,
}: {
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  dateRange: string[];
}): JSX.Element {
  const min = dateRange[0] ?? "";
  const max = dateRange[dateRange.length - 1] ?? "";
  return (
    <section className="quadrant-card period-picker">
      <div className="seg">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={period === p.id ? "seg-btn active" : "seg-btn"}
            onClick={() => onPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="form-row">
          <input
            type="date"
            min={min}
            max={max}
            value={custom.from}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
          />
          <span className="hint">至</span>
          <input
            type="date"
            min={min}
            max={max}
            value={custom.to}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
          />
        </div>
      )}
    </section>
  );
}

function RankBoard({
  title,
  list,
  kind,
  onPick,
}: {
  title: string;
  list: AppearanceStat[];
  kind: "bull" | "bear";
  onPick: (v: { symbol: string; name: string }) => void;
}): JSX.Element {
  return (
    <section className={`ranklist ${kind}`}>
      <h3>{title}</h3>
      {list.length === 0 && <p className="hint">本区间该侧无数据</p>}
      {list.map((s, i) => (
        <button
          className="row as-btn"
          key={s.symbol}
          onClick={() => onPick({ symbol: s.symbol, name: s.name })}
        >
          <span className="rank">{i + 1}</span>
          <div className="info">
            <div className="name">
              {s.name}
              <span className="code">{s.symbol}</span>
              <span className="theme">{themeLabel(s.theme)}</span>
            </div>
            <div className="reasons">
              出现 <b>{s.count}</b> 次 · 上榜日均涨跌{" "}
              <Pct v={s.avgChangePct} />
            </div>
          </div>
          <span className="count-badge">{s.count}次</span>
        </button>
      ))}
    </section>
  );
}
function SingleStock({
  picked,
  onPick,
}: {
  picked: { symbol: string; name: string } | null;
  onPick: (v: { symbol: string; name: string } | null) => void;
}): JSX.Element {
  const [kw, setKw] = useState("");
  const [data, setData] = useState<PeriodReturns | null>(null);
  const [busy, setBusy] = useState(false);

  // 上半部点选某只股票时,自动拉它的周期涨跌
  useEffect(() => {
    if (!picked) return;
    setBusy(true);
    setData(null);
    fetchPeriodReturns(picked.symbol, picked.name)
      .then(setData)
      .finally(() => setBusy(false));
  }, [picked]);

  async function onSearch(): Promise<void> {
    const q = kw.trim();
    if (!q) return;
    onPick({ symbol: q, name: q });
  }

  return (
    <section className="single-stock">
      <h3>个股周期涨跌</h3>
      <div className="searchbar">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="输入代码看涨跌,如 600519 / 300639 / NVDA"
        />
        <button onClick={onSearch} disabled={busy}>查看</button>
      </div>

      {!picked && <p className="hint">点上方排名里的股票,或搜代码,查看其当日/周/月/季涨跌。</p>}
      {busy && <p className="hint">加载中…</p>}

      {data && (
        <div className="period-card">
          <div className="name">
            {data.name}
            <span className="code">{data.symbol}</span>
            {data.price > 0 && <span className="code">现价 {data.price}</span>}
          </div>
          <div className="period-grid">
            <div className="cell"><span className="lbl">当日</span><Pct v={data.day} /></div>
            <div className="cell"><span className="lbl">近一周</span><Pct v={data.week} /></div>
            <div className="cell"><span className="lbl">近一月</span><Pct v={data.month} /></div>
            <div className="cell"><span className="lbl">近一季</span><Pct v={data.quarter} /></div>
          </div>
        </div>
      )}
    </section>
  );
}

