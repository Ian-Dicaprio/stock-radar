import { useEffect, useState } from "react";
import { DailyReportSchema, type DailyReport, type Scored } from "@/framework/types";
import { quadrantLabel } from "@/framework/clock";
import { themeLabel } from "@/framework/theme";

/** 读取每日扫描产出的 latest.json,渲染 Top10 看涨/看跌 */
export function HomePage(): JSX.Element {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("./data/latest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("尚无榜单数据"))))
      .then((json: unknown) => setReport(DailyReportSchema.parse(json)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  if (error) return <p className="hint">{error}(首次需等每日扫描跑一次)</p>;
  if (!report) return <p className="hint">加载中…</p>;

  return (
    <div className="home">
      <section className="quadrant-card">
        <div>A股象限:<b>{quadrantLabel(report.quadrant.cn)}</b></div>
        <div>美股象限:<b>{quadrantLabel(report.quadrant.us)}</b></div>
        <div className="ts">更新于 {new Date(report.generatedAt).toLocaleString("zh-CN")}</div>
      </section>

      {report.commentary && (
        <section className="commentary">
          <h3>今日点评</h3>
          <p>{report.commentary}</p>
        </section>
      )}

      <div className="two-col">
        <RankList title="看涨 Top10" list={report.topBull} kind="bull" />
        <RankList title="看跌 Top10" list={report.topBear} kind="bear" />
      </div>

      <p className="disclaimer">{report.disclaimer}</p>
    </div>
  );
}

function RankList({ title, list, kind }: { title: string; list: Scored[]; kind: "bull" | "bear" }): JSX.Element {
  return (
    <section className={`ranklist ${kind}`}>
      <h3>{title}</h3>
      {list.map((s, i) => (
        <div className="row" key={s.quote.symbol}>
          <span className="rank">{i + 1}</span>
          <div className="info">
            <div className="name">
              {s.quote.name}
              <span className="code">{s.quote.symbol}</span>
              <span className="theme">{themeLabel(s.quote.theme)}</span>
            </div>
            <div className="reasons">{s.reasons.join(" · ")}</div>
          </div>
          <span className={`score ${kind}`}>
            {kind === "bull" ? s.bullScore : s.bearScore}
          </span>
        </div>
      ))}
    </section>
  );
}
