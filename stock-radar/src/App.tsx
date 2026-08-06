import { useState } from "react";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { HoldingsPage } from "./pages/HoldingsPage";
import { SettingsPage } from "./pages/SettingsPage";

type Tab = "home" | "search" | "holdings" | "settings";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "home", label: "多空榜" },
  { id: "search", label: "搜索" },
  { id: "holdings", label: "持仓" },
  { id: "settings", label: "设置" },
];

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="app">
      <header className="topbar">
        <h1>多空雷达</h1>
        <span className="sub">周期 × 美林时钟</span>
      </header>

      <main className="content">
        {tab === "home" && <HomePage />}
        {tab === "search" && <SearchPage />}
        {tab === "holdings" && <HoldingsPage />}
        {tab === "settings" && <SettingsPage />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
