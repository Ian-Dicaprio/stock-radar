import type { Theme } from "./types";

/**
 * 关键词 → 赛道 的粗分类。基于股票名称匹配。
 * 这是启发式的,不追求完美;命中即归类,便于象限加分。
 * 复盘时可补充关键词或改用行业板块字段。
 */
const KEYWORD_MAP: ReadonlyArray<readonly [Theme, readonly string[]]> = [
  ["ai_compute", ["算力", "半导体", "芯片", "光模块", "AI", "服务器", "GPU", "存储", "PCB", "英伟达", "台积"]],
  ["green_power", ["新能源", "光伏", "风电", "储能", "电池", "锂", "绿电", "氢能", "充电"]],
  ["self_control", ["国产", "自主", "信创", "软件", "操作系统", "数据库", "国防", "军工", "航天"]],
  ["biotech", ["生物", "医药", "疫苗", "创新药", "基因", "医疗", "CXO", "制药"]],
  ["grain", ["粮食", "农业", "种业", "种子", "饲料", "养殖", "食品", "农产"]],
  ["utility", ["电力", "公用", "水务", "燃气", "供电", "核电", "水电", "火电"]],
];

/** 根据名称推断赛道 */
export function classifyTheme(name: string): Theme {
  for (const [theme, keywords] of KEYWORD_MAP) {
    if (keywords.some((k) => name.includes(k))) return theme;
  }
  return "other";
}

/** 赛道中文名,前端展示 */
export function themeLabel(theme: Theme): string {
  const map: Record<Theme, string> = {
    ai_compute: "AI算力/半导体",
    green_power: "绿电/新能源",
    self_control: "自主可控",
    biotech: "生物科技",
    grain: "粮食/农业",
    utility: "电力公用",
    other: "其他",
  };
  return map[theme];
}
