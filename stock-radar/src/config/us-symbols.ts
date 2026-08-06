/**
 * 美股扫描池。默认放一批高关注度、贴合框架赛道的成分股。
 * 你可自由增删。完整标普500可换成从数据源拉取,这里用精选池控制请求量。
 */
export const US_SYMBOLS: readonly string[] = [
  // AI 算力/半导体
  "NVDA", "AMD", "AVGO", "TSM", "MU", "SMCI", "MRVL", "ARM", "ASML",
  // 大型科技/云
  "MSFT", "GOOGL", "AMZN", "META", "AAPL", "ORCL", "PLTR",
  // 电力/公用(算力用电)
  "VST", "CEG", "NRG", "GEV", "ETR", "SO", "DUK",
  // 绿电/新能源
  "FSLR", "ENPH", "TSLA", "NEE",
  // 生物科技
  "LLY", "NVO", "AMGN", "VRTX",
  // 粮食/农业
  "ADM", "BG", "MOS", "NTR", "DE",
];
