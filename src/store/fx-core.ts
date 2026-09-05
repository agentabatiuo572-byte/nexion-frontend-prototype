// 汇率牌价纯逻辑(PAY-规格 [FEAT-PAY03] ③)。零依赖(vue/pinia/uni 均不引),
// fx store 与 scripts/selfcheck-fx.mjs 共用同一实现。
// 单源 = 后台 [D6] FxQuoteConfig:base/spread 由后台下发,本文件只做派生与展示,
// 不落任何默认牌价(拉取失败禁回退写死值,失败态语义见 fx.ts syncFailed)。

/** 点差合法区间上限(%)。后台 [D6] 对超 0–3 的写入 server 422;client 收到越界值视为异常数据(不可用)。 */
export const SPREAD_MAX = 3;

/** 牌价 = round(base × (1 + spread/100) / 10) × 10,取整到十位(规格 ③ 固定靶:26,000 × 1.5% → 26,390)。
 *  整数域精确运算:点差先转基点整数(bps),base×(10000+bps) 全程整数,规避 IEEE754
 *  表示误差把 .5 进位边界压成 .4999…(审查实测 27,000×1.5% 曾错出 27,400,应为 27,410)。 */
export function computeQuoteRate(baseRateVndPerUsdt: number, buySpreadPct: number): number {
  const bps = Math.round(buySpreadPct * 100);
  return Math.round((baseRateVndPerUsdt * (10000 + bps)) / 10000 / 10) * 10;
}

/** 应付 VND = round(usdt × rate) —— 精确到盾、不凑整千(精确零头兼作回单匹配辅助,PAY02 ③)。
 *  金额先转分(cent 整数)再乘,同上规避浮点边界(16.65 × 26,390 曾错出 439,393,应为 439,394)。 */
export function vndForUsdt(usdtAmount: number, quoteRate: number): number {
  const cents = Math.round(usdtAmount * 100);
  return Math.round((cents * quoteRate) / 100);
}

/** VND 千分位 + ₫ 后缀:659750 → "659,750₫"。 */
export function fmtVnd(vnd: number): string {
  return `${Math.round(vnd)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}₫`;
}

/** 牌价数据可用性(规格 ② 异常3):缺字段(0)/≤0/NaN/点差越界任一 → 不可用,禁渲染换算结果。 */
export function isFxQuoteUsable(baseRateVndPerUsdt: number, buySpreadPct: number): boolean {
  if (!Number.isFinite(baseRateVndPerUsdt) || baseRateVndPerUsdt <= 0) return false;
  if (!Number.isFinite(buySpreadPct) || buySpreadPct < 0 || buySpreadPct > SPREAD_MAX) return false;
  return computeQuoteRate(baseRateVndPerUsdt, buySpreadPct) > 0;
}
