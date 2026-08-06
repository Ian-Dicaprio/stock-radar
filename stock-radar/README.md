# 多空雷达 · Stock Radar

一个打开网页就能看的**全市场每日多空榜**：基于「多周期 + 美林时钟」框架给全市场打分，每天自动列出 **Top10 看涨 / Top10 看跌**，还能**搜索任意标的分析**、**管理自己的持仓**。

- 手机浏览器打开即用，可"添加到主屏幕"当 App
- 每天自动更新，**零服务器、零月费**（用 GitHub 免费服务）
- 分析可接你自己的大模型（DeepSeek/Kimi/通义/OpenAI 都行）

> ⚠️ 榜单是**量化打分的线索**，不是买卖信号，更不构成投资建议，盈亏自负。

---

# 0 基础保姆级部署教程

跟着做，全程**复制粘贴 + 点按钮**，不用写代码。预计 30 分钟。

## 名词扫盲（先看一眼）
- **GitHub**：全球最大的免费代码仓库网站，我们用它来存代码 + 每天自动跑 + 免费托管网页。
- **仓库(Repository)**：就是一个项目文件夹。
- **Actions**：GitHub 提供的"定时自动执行"功能，我们靠它每天扫描。
- **Pages**：GitHub 提供的"把网页免费挂到公网"功能。

---

## 第一步：注册 GitHub（有账号跳过）
1. 打开 https://github.com ，点右上角 **Sign up** 注册，验证邮箱。

## 第二步：把这个项目传到你的 GitHub
你有两种方式，**方式 A 最简单**：

### 方式 A：网页上传（推荐，零工具）
1. 登录 GitHub，点右上角 **+** → **New repository**。
2. Repository name 填 `stock-radar`，选 **Public**（公开才免费用 Pages），点 **Create repository**。
3. 在新仓库页面，点 **uploading an existing file**（或 Add file → Upload files）。
4. 把本项目 `stock-radar` 文件夹里**所有文件和子文件夹**拖进去上传。
   - 注意要包含隐藏的 `.github` 文件夹（里面是自动扫描配置）。若拖拽时看不到它，见下方"常见问题①"。
5. 底部点 **Commit changes**。

### 方式 B：用 Git 命令（会用命令行再选）
```bash
cd stock-radar
git init && git add -A && git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的用户名/stock-radar.git
git push -u origin main
```

## 第三步：填入你的大模型 API（让 AI 点评每日榜单）
> 只影响"每日自动点评"。网页里的实时搜索分析用的是你手机本地填的 Key（第六步），两者独立。

1. 进你的仓库 → 顶部 **Settings** → 左侧 **Secrets and variables** → **Actions**。
2. 点 **New repository secret**，依次加 3 条（Name 必须一字不差）：
   - `LLM_BASE_URL`　值例：`https://api.deepseek.com/v1`
   - `LLM_API_KEY`　值：你的 key，形如 `sk-xxxx`
   - `LLM_MODEL`　值例：`deepseek-chat`
3. 不想接 AI？跳过本步也行，榜单照常出，只是没有文字点评。

## 第四步：打开 Pages（把网页挂上公网）
1. 仓库 → **Settings** → 左侧 **Pages**。
2. **Source** 选 **GitHub Actions**（不是 Deploy from a branch）。保存。

## 第五步：第一次手动跑一下
1. 仓库 → 顶部 **Actions** → 若提示启用 workflow，点 **I understand, enable**。
2. 左侧点 **每日扫描并部署** → 右侧 **Run workflow** → 绿色 **Run workflow**。
3. 等 3-6 分钟，变绿勾 ✓ 即成功。
4. 回到 **Settings → Pages**，会显示你的网址，形如：
   `https://你的用户名.github.io/stock-radar/`
5. 手机浏览器打开这个网址 → 浏览器菜单 → **添加到主屏幕**，就有 App 图标了。

之后**每个交易日北京时间约 16:30 自动更新**，你什么都不用做。

## 第六步：在手机网页里填 Key（启用"搜索/持仓"的 AI 分析）
1. 打开网页 → 底部 **设置** 标签。
2. 填 API 地址 / Key / 模型名（同第三步的值），**保存**。
3. Key 只存在你手机浏览器本地，不上传任何地方。

---

## 每周复盘怎么用（对应我们约定的节奏）
- **看榜**：每周打开首页，看 Top10 多空 + AI 点评，对照当前象限。
- **切象限**：当宏观从"滞胀"转"复苏"等，改 `src/framework/clock.ts` 里的 `DEFAULT_QUADRANT`，提交后下次扫描全盘打分自动跟着变。
- **调权重**：打分权重都在 `src/framework/score.ts` 顶部，想让某因子更重就改数字。
- **持仓**：在"持仓"页录入你的 5 只基金，点"对全部持仓打分"，看偏多/偏空与现金比例提示。

## 常见问题
① **上传时看不到 `.github` 文件夹**：Mac 访达按 `Cmd+Shift+.` 显示隐藏文件；或用方式 B 的 git 命令上传。
② **Actions 报错 npm ci**：确认 `package.json` 和 `package-lock.json` 都传上去了；没有 lock 文件就把 workflow 里的 `npm ci` 改成 `npm install`。
③ **网页打开是空白/404**：确认 Pages 的 Source 选了 **GitHub Actions**，且第五步的 workflow 跑成功了。
④ **榜单是空的**：数据源偶尔抽风，去 Actions 手动 Run 一次；或检查 `src/data/market.ts` 里字段映射是否匹配 stock-sdk 最新版。
⑤ **想本地先试**：装 Node 20+，在项目目录 `npm install`，`npm run scan` 生成数据，`npm run dev` 本地预览。

---

## 技术栈与规范
- **TypeScript 严格模式**（Matt Pocock 标准）：`strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`，配置见 `tsconfig.json`。
- 运行时数据校验用 **zod**，边界数据一律 parse。
- 数据源 **stock-sdk**（零依赖，浏览器/Node 双端）。
- 前端 **React + Vite**，纯静态，部署到 GitHub Pages。
- 大模型走 **OpenAI 兼容协议**，手写 fetch，无 SDK 绑定。

## 目录结构
```
stock-radar/
├─ src/
│  ├─ framework/   # 框架核心:类型、美林时钟、打分引擎
│  ├─ data/        # 数据层:封装 stock-sdk
│  ├─ llm/         # 大模型:客户端 + 分析师人设
│  ├─ pages/       # 四个页面:多空榜/搜索/持仓/设置
│  ├─ store/       # 本地设置(localStorage)
│  └─ config/      # 美股扫描池等配置
├─ scripts/daily-scan.ts   # 每日扫描(Actions 调用)
└─ .github/workflows/      # 定时任务配置
```

