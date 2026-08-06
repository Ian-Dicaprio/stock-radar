import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "@/store/settings";

/** 设置页:填大模型 baseURL / key / model,存本地浏览器 */
export function SettingsPage(): JSX.Element {
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const llm = loadSettings().llm;
    if (llm) {
      setBaseURL(llm.baseURL ?? "");
      setApiKey(llm.apiKey ?? "");
      setModel(llm.model ?? "");
    }
  }, []);

  function onSave(): void {
    const s = loadSettings();
    saveSettings({ ...s, llm: { baseURL, apiKey, model } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="settings">
      <label>API 地址 (baseURL)
        <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.deepseek.com/v1" />
      </label>
      <label>API Key
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
      </label>
      <label>模型名 (model)
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" />
      </label>
      <button onClick={onSave}>{saved ? "已保存 ✓" : "保存"}</button>
      <p className="hint">Key 仅存于本机浏览器 localStorage,不会上传到任何服务器。</p>
      <p className="hint">常见配置:DeepSeek → https://api.deepseek.com/v1 / deepseek-chat；Kimi → https://api.moonshot.cn/v1 / moonshot-v1-8k</p>
    </div>
  );
}
