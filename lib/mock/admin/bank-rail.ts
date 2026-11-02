/**
 * 银行轨(VietQR)对账 + 收款账户池 mock — PAY 规格 §2 [FEAT-PAY02] / §6(2026-07 签字)单源。
 * 🔴 账实单源:挂账中(孤儿 + 差额 + 过期后到账,未处置)各行「折算 USDT」之和 = BANK_SUSPENSE_USD,
 *    LEDGER 第 9 科目「待核实入金」与储备加项直接 import 本值派生(lib/mock/admin/ledger.ts)——
 *    改任何一行挂账种子,科目 #9 与储备自动跟移,不存在第二套数(seed 合计 = $3,847.52)。
 * 分录口径(PAY §5):回单到达 = 借储备 +实收折 USDT、贷科目 #9 +同额;匹配/核销 = 借 #9 −、贷用户可提负债 +;
 * 登记退回 = 借 #9 −、贷储备 −(资金退出)。
 * backend-replaceable:GET /api/admin/bank-rail/intents?view= · GET|POST /api/admin/bank-rail/accounts。
 */

export type BankIntentView = "inflight" | "matched" | "orphan" | "mismatch" | "late";

export interface BankIntentRow {
  /** 意向单号 DP-YYYYMMDD-NNNN;孤儿回单无意向单,用回单号 RC-。 */
  id: string;
  /** 账户;孤儿回单未知 = "—"。 */
  user: string;
  /** 附言码 NX-XXXXXX;孤儿缺附言 = "未填"。 */
  memo: string;
  /** 应付 ₫(= round(usdt × fxRate),server 计算;孤儿无意向单 = null)。 */
  payableVnd: number | null;
  /** 实收 ₫(回单金额;在途未付 = null)。 */
  receivedVnd: number | null;
  /** 锁定牌价(孤儿 = 回单日牌价)。 */
  fxRate: number;
  /** 折算 USDT:在途/已匹配 = 意向额;挂账行 = 实收折算(进科目 #9)。 */
  usdt: number;
  /** 倒计时 / 时间。 */
  timing: string;
  note: string;
  view: BankIntentView;
}

export const BANK_INTENTS: BankIntentRow[] = [
  // ── 在途意向单(awaiting_payment:锁价 30 分钟,服务器自动匹配回单,后台只观测)──
  { id: "DP-20260724-0311", user: "usr_7A21", memo: "NX-K7Q2MB", payableVnd: 659_750, receivedVnd: null, fxRate: 26_390, usdt: 25, timing: "剩 21:44", note: "等待用户转账", view: "inflight" },
  { id: "DP-20260724-0308", user: "usr_1F45", memo: "NX-D4XT9A", payableVnd: 3_166_800, receivedVnd: null, fxRate: 26_390, usdt: 120, timing: "剩 09:12", note: "等待用户转账", view: "inflight" },
  { id: "DP-20260724-0304", user: "usr_90C2", memo: "NX-A2WQ7C", payableVnd: 7_915_500, receivedVnd: null, fxRate: 26_385, usdt: 300, timing: "剩 02:03", note: "临近过期 · 归零转过期态", view: "inflight" },
  // ── 已匹配(credited:回调匹配成功,按锁定牌价自动入账,0 手续费)──
  { id: "DP-20260724-0296", user: "usr_2231", memo: "NX-M8PR2E", payableVnd: 1_319_500, receivedVnd: 1_319_500, fxRate: 26_390, usdt: 50, timing: "今日 13:58 入账", note: "自动匹配 · 附言码命中", view: "matched" },
  { id: "DP-20260724-0287", user: "usr_66B8", memo: "NX-T3GK5D", payableVnd: 12_662_400, receivedVnd: 12_662_400, fxRate: 26_380, usdt: 480, timing: "今日 12:41 入账", note: "自动匹配 · 附言码命中", view: "matched" },
  { id: "DP-20260723-0270", user: "usr_19C7", memo: "NX-B6ZN4F", payableVnd: 1_980_750, receivedVnd: 1_980_750, fxRate: 26_410, usdt: 75, timing: "昨日 22:04 入账", note: "自动匹配 · 精确零头命中", view: "matched" },
  // ── 孤儿队列(附言码缺失且金额撞不上任何在途单 → 挂账科目 #9,人工匹配或登记退回)──
  { id: "RC-20260724-118", user: "—", memo: "未填", payableVnd: null, receivedVnd: 31_674_000, fxRate: 26_395, usdt: 1_200, timing: "今日 11:26 到账", note: "无附言码 · 金额撞不上任何在途单", view: "orphan" },
  { id: "RC-20260724-104", user: "—", memo: "未填", payableVnd: null, receivedVnd: 12_751_200, fxRate: 26_400, usdt: 483, timing: "今日 09:47 到账", note: "附言码残缺(NX-9…)· 等用户凭证", view: "orphan" },
  // ── 差额队列(实收与应付差异超容差 → 挂账科目 #9,按实收核销或登记退回;永不自动入账)──
  { id: "DP-20260724-0301", user: "usr_3D82", memo: "NX-H5VW8B", payableVnd: 23_751_000, receivedVnd: 23_489_739, fxRate: 26_390, usdt: 890.1, timing: "今日 10:15 到账", note: "少付 261,261₫ · 超容差", view: "mismatch" },
  { id: "DP-20260723-0262", user: "usr_5E19", memo: "NX-C9JL3A", payableVnd: 11_092_200, receivedVnd: 11_224_250, fxRate: 26_410, usdt: 425, timing: "昨日 19:32 到账", note: "多付 132,050₫ · 超容差", view: "mismatch" },
  // ── 过期后到账(回单落在过期 + 宽限之外 → 挂账科目 #9,人工按锁定牌价补入账)──
  { id: "DP-20260723-0249", user: "usr_8F30", memo: "NX-R2QD6E", payableVnd: 16_371_100, receivedVnd: 16_371_100, fxRate: 26_405, usdt: 620, timing: "过期 +26 分钟到账", note: "超宽限(10 分钟)· 待人工补入账", view: "late" },
  { id: "DP-20260722-0233", user: "usr_4B77", memo: "NX-W7FM1C", payableVnd: 6_061_276, receivedVnd: 6_061_276, fxRate: 26_420, usdt: 229.42, timing: "过期 +3 小时到账", note: "用户已提交凭证 · 工单 T-9012", view: "late" },
];

/** 挂账行(孤儿 + 差额 + 过期后到账)= 科目 #9 的逐笔构成。 */
export const BANK_SUSPENSE_ROWS = BANK_INTENTS.filter((r) => r.view === "orphan" || r.view === "mismatch" || r.view === "late");

/**
 * 🔴 科目 #9「待核实入金」唯一来源 = 挂账行折算 USDT 求和(LEDGER import 本值,勿在别处手写 3,847.52)。
 * toFixed(2) 收敛浮点尾差,保证与 2 位小数展示逐位一致。
 */
export const BANK_SUSPENSE_USD = Number(BANK_SUSPENSE_ROWS.reduce((s, r) => s + r.usdt, 0).toFixed(2)); // = 3,847.52

export const BANK_VIEW_TABS: { key: BankIntentView; label: string }[] = [
  { key: "inflight", label: "在途意向单" },
  { key: "matched", label: "已匹配" },
  { key: "orphan", label: "孤儿队列" },
  { key: "mismatch", label: "差额队列" },
  { key: "late", label: "过期后到账" },
];

/** 五视图状态 → 运营可读中文 + server 枚举(小号 mono 副标),枚举值不裸奔。 */
export const BANK_ST: Record<BankIntentView, { label: string; tone: string; code: string }> = {
  inflight: { label: "在途", tone: "warn", code: "awaiting_payment" },
  matched: { label: "已入账", tone: "ok", code: "credited" },
  orphan: { label: "待人工匹配", tone: "bad", code: "orphan_receipt" },
  mismatch: { label: "差额待核", tone: "bad", code: "mismatch_review" },
  late: { label: "过期后到账", tone: "bad", code: "expired_late" },
};

/* ============================ 银行轨参数(D1 可配,PAY §6)============================ */

export interface BankParamDef {
  key: string; // pget(`D.${key}`)
  name: string;
  cur: string; // 数值串(edit number 的 current)
  unit: string;
  note: string;
  min: number;
  max: number;
  integer?: boolean;
  fmt: (v: string) => string;
}

export const BANK_PARAMS: BankParamDef[] = [
  { key: "bankTolVnd", name: "金额容差", cur: "1000", unit: "₫", note: "实收与应付差 ≤ 容差自动按锁定牌价入账,超出转差额队列 · 范围 0–5,000₫ · 仅新回单匹配生效", min: 0, max: 5000, integer: true, fmt: (v) => `±${Number(v).toLocaleString("en-US")}₫` },
  { key: "bankGraceMin", name: "回单宽限", cur: "10", unit: "分钟", note: "过期后宽限内到的回单仍按锁定牌价自动入账,超宽限转「过期后到账」人工处置 · 范围 0–60 分钟", min: 0, max: 60, integer: true, fmt: (v) => `${v} 分钟` },
  { key: "bankCapUsd", name: "VietQR 单笔上限", cur: "5000", unit: "$", note: "意向单金额上限(最低 $10 等值不在此配)· 范围 $100–$10,000 · 仅新单生效", min: 100, max: 10000, integer: true, fmt: (v) => `$${Number(v).toLocaleString("en-US")}` },
  { key: "confTrc20", name: "TRC20 入账确认数", cur: "20", unit: "确认", note: "链上入金到账所需区块确认数 · 范围 1–64 · 下一笔判定用新值", min: 1, max: 64, integer: true, fmt: (v) => `${v} 确认` },
  { key: "confErc20", name: "ERC20 入账确认数", cur: "12", unit: "确认", note: "链上入金到账所需区块确认数 · 范围 1–64 · 下一笔判定用新值", min: 1, max: 64, integer: true, fmt: (v) => `${v} 确认` },
  { key: "confBep20", name: "BEP20 入账确认数", cur: "15", unit: "确认", note: "链上入金到账所需区块确认数 · 范围 1–64 · 下一笔判定用新值", min: 1, max: 64, integer: true, fmt: (v) => `${v} 确认` },
];

/* ============================ 收款账户池(PAY §6)============================ */

export interface BankAccountRow {
  id: string;
  bank: string;
  /** 列表侧脱敏户名(详情/用户付款单侧才给完整,PAY02 ③ bankAccount)。 */
  holder: string;
  /** 账号尾四位。 */
  tail: string;
  /** 日收上限 ₫(可配)。 */
  dailyCapVnd: number;
  /** 当日已收 ₫。 */
  todayVnd: number;
  on: boolean;
  /** 异常熔断(server 自动:回单延迟/银行风控等,移出轮换)。 */
  fused: boolean;
  note: string;
}

export const BANK_ACCOUNTS: BankAccountRow[] = [
  { id: "vcb-01", bank: "Vietcombank", holder: "CTY *** VIETNAM", tail: "5501", dailyCapVnd: 400_000_000, todayVnd: 236_400_000, on: true, fused: false, note: "轮换位 #1" },
  { id: "tcb-02", bank: "Techcombank", holder: "CTY *** VIETNAM", tail: "8842", dailyCapVnd: 400_000_000, todayVnd: 391_200_000, on: true, fused: false, note: "接近日上限 · 触顶自动移出轮换" },
  { id: "mbb-03", bank: "MB Bank", holder: "CTY *** VIETNAM", tail: "2074", dailyCapVnd: 300_000_000, todayVnd: 41_700_000, on: true, fused: true, note: "回单延迟 40 分钟异常 · 已自动熔断" },
  { id: "vpb-04", bank: "VPBank", holder: "CTY *** VIETNAM", tail: "6619", dailyCapVnd: 300_000_000, todayVnd: 0, on: false, fused: false, note: "备用账户 · 默认停用" },
];

/** 新增账户弹窗的可选银行(可枚举值用 select 不手输)。 */
export const VN_BANKS = ["Vietcombank", "Techcombank", "MB Bank", "VPBank", "ACB", "BIDV"];

/** 轮换策略枚举(默认轮询;select 不手输)。 */
export const BANK_ROTATION_OPTIONS = ["轮询(按顺序均匀派发)", "按剩余日额度优先"];

export const fmtVnd = (n: number) => `${n.toLocaleString("en-US")}₫`;
export const fmtUsdt2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
