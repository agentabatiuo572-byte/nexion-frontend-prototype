/**
 * [D6] 汇率牌价 mock — PAY 规格 [FEAT-PAY03] ③ / §6 单源(FxQuoteConfig)。
 * 🔴 全平台唯一 VND 牌价配置源:基准价 / 买入点差 / 锁价窗三配置种子在此,实时态 = pget("D.fx.*")。
 *    quoteRate 一律现场派生 = 基准 × (1 + 点差) 取整到十位(实现走整数域 bps,见 computeQuoteRate),禁存第二份;
 *    uniapp 侧同公式在 src/store/fx-core.ts,跨仓逐值哨兵 scripts/fx-parity-sentinel.mjs
 *    钉死 26,000 / 1.5 / 30 / 固定靶 26,390(键对齐 ≠ 值对齐,K1 教训)。
 * 在途意向单上的 fxRate 是下单锁价快照([FEAT-PAY02] ④),本页调价只影响新单。
 * backend-replaceable:GET/PUT /api/admin/config/fx;PROD 基准价预留喂价源接口(当前手动维护)。
 */

/** FxQuoteConfig 种子(= 规格 ③ 默认列;与 uniapp MOCK_FX_SEED 逐值同步,哨兵钉死)。 */
export const FX_SEED = {
  baseRateVndPerUsdt: 26_000, // 手动维护;≈ USD/VND 市场价(经济模型口径)
  buySpreadPct: 1.5, // 合法域 0–3,越界 server 422
  lockWindowMin: 30, // 意向单锁价窗 = 单生命周期
};

/** 点差合法域(server 422 界;与 uniapp fx-core SPREAD_MAX 同值)。 */
export const FX_SPREAD_MIN = 0;
export const FX_SPREAD_MAX = 3;

/** 牌价派生(与 uniapp fx-core.ts computeQuoteRate 同实现;派生不缓存、禁双写)。
 *  🔴 整数域精确运算:点差先转基点整数(bps),base×(10000+bps) 全程整数——禁回退浮点公式
 *  `base×(1+spread/100)`,IEEE754 会把 .5 进位边界压成 .4999…(27,000×1.5% 错出 27,400,
 *  应为 27,410;回归靶已钉进 fx-parity-sentinel)。 */
export function computeQuoteRate(baseRateVndPerUsdt: number, buySpreadPct: number): number {
  const bps = Math.round(buySpreadPct * 100);
  return Math.round((baseRateVndPerUsdt * (10000 + bps)) / 10000 / 10) * 10;
}

/** D6 三配置行(实时态 pget(`D.${key}`);存 raw 数字串,展示才 fmt——防 parseFloat 吃千分位)。 */
export interface FxParamDef {
  key: string; // pget(`D.${key}`) → D.fx.*
  name: string;
  cur: string; // 数值串(edit number 的 current;= FX_SEED 同值)
  unit: string;
  note: string;
  min: number;
  max: number;
  integer?: boolean;
  /** 点差越界走 server 422 失败态文案(规格 ③);其余走通用拒绝。 */
  is422?: boolean;
  fmt: (v: string) => string;
}

export const FX_PARAMS: FxParamDef[] = [
  {
    key: "fx.baseRate",
    name: "基准价",
    cur: String(FX_SEED.baseRateVndPerUsdt),
    unit: "₫/USDT",
    note: "手动维护 · 对齐 USD/VND 市场价 · 防呆粗界 20,000–35,000(真后台预留喂价源接口,接入后按喂价 ± 容差校验)",
    min: 20_000,
    max: 35_000,
    integer: true,
    fmt: (v) => `${Number(v).toLocaleString("en-US")}₫`,
  },
  {
    key: "fx.spreadPct",
    name: "买入点差",
    cur: String(FX_SEED.buySpreadPct),
    unit: "%",
    note: `法币入金的价差收入 · 合法范围 ${FX_SPREAD_MIN}–${FX_SPREAD_MAX}%,越界服务器直接拒绝(422)不写入`,
    min: FX_SPREAD_MIN,
    max: FX_SPREAD_MAX,
    is422: true,
    fmt: (v) => `${Number(v)}%`,
  },
  {
    key: "fx.lockWindowMin",
    name: "锁价窗",
    cur: String(FX_SEED.lockWindowMin),
    unit: "分钟",
    note: "付款单从下单起按当时牌价锁定的时长 = 意向单生命周期 · 范围 5–120 分钟 · 仅新单生效",
    min: 5,
    max: 120,
    integer: true,
    fmt: (v) => `${Number(v)} 分钟`,
  },
];

/** 生效历史种子(最近改动;live 改动由 A2 审计 target=D.fx.* 实时叠加在最上)。 */
export interface FxHistoryRow {
  t: string;
  name: string;
  before: string;
  after: string;
  actor: string;
  reason: string;
}

export const FX_HISTORY: FxHistoryRow[] = [
  { t: "07-21 09:40", name: "基准价", before: "25,900₫", after: "26,000₫", actor: "财务运营", reason: "跟进市场价口径,周度校准" },
  { t: "07-14 15:22", name: "买入点差", before: "1.8%", after: "1.5%", actor: "财务运营", reason: "促充值活动期间下调点差" },
  { t: "07-08 11:05", name: "锁价窗", before: "20 分钟", after: "30 分钟", actor: "总管理员", reason: "银行转账高峰期到账偏慢,放宽锁价窗" },
];
