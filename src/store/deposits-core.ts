import type { ChainDepositChannel, DepositChannel, DepositIntent, DepositRecord } from "./types";

// 入金纯逻辑(PAY-规格 [FEAT-PAY01] ③)。零依赖(vue/pinia/uni 均不引),
// deposits store 与 scripts/selfcheck-deposits.mjs 共用同一实现。

// ── 通道配置(MOCK 单源常量)─────────────────────────────────────────
// 真后台 = 后台 D1 通道配置下发(client 拉取,拉取失败禁回退写死值);
// 此表仅 mock 种子,PROD 切换时整段被 GET /api/config/deposit-channels 替换。

/** 通道费(USDT)。 */
export const CHAIN_DEPOSIT_FEE_USDT: Record<ChainDepositChannel, number> = {
  "usdt-trc20": 1,
  "usdt-bep20": 1,
  "usdt-erc20": 5,
};

/** 入账所需确认数(TRC20 20 · ERC20 12 · BEP20 15;后台 D1 可配)。 */
export const CHAIN_REQUIRED_CONFIRMATIONS: Record<ChainDepositChannel, number> = {
  "usdt-trc20": 20,
  "usdt-erc20": 12,
  "usdt-bep20": 15,
};

/** 最低充值额(USD);低于此额 → dust_hold(后台 D1 可配)。 */
export const MIN_DEPOSIT_USDT = 10;

export function chainDepositFeeUsdt(network: ChainDepositChannel): number {
  return CHAIN_DEPOSIT_FEE_USDT[network];
}

/** 是否链上轨(有 txHash / 确认数 / 专属地址)。单源派生自确认数表:
 *  新增链上通道自动纳入、新增法币轨自动排除,消费方(交易详情页跳转等)不用逐个改。
 *  用 hasOwn 不用 `in`:records 从 storage 反序列化而来、字段不可信,`in` 会顺着原型链
 *  把 "toString"/"constructor" 判成链上通道(实测 true),守卫的类型断言就成了假的。 */
export function isChainChannel(c: DepositChannel): c is ChainDepositChannel {
  return Object.prototype.hasOwnProperty.call(CHAIN_REQUIRED_CONFIRMATIONS, c);
}

/** 入账额 = gross − fee,两位小数(creditedUsdt 生成规则)。 */
export function computeCreditedUsdt(grossAmountUsdt: number, feeUsdt: number): number {
  return +(grossAmountUsdt - feeUsdt).toFixed(2);
}

// ── 每用户 × 每网络专属充值地址(确定性派生)────────────────────────
// 充值地址必须「同账号同网络恒定」(server 派发恒定不轮换),故同形态 + 确定性种子;
// 结算待支付发票(store/pending-checkout)复用同一派生函数,种子换成会话 id → 每单专属地址:
// seed = hash(accountKey|network) → 种子化 PRNG → 逐字符生成。
// PROD: GET /api/deposits/address?network= 返回 server 派发地址,本段整体删除。

/** FNV-1a 32 位哈希(地址派生种子;deposit-usdt-pane 的 QR 点阵 seed 复用同源)。 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 种子化 PRNG(与 fnv1a 配对;QR 点阵/地址派生共用)。 */
export function mulberry32(seed: number): () => number {
  let t = seed;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 种子(账号键 = 同账号同网络恒定;会话 id = 每单专属)+ 网络 → 确定性地址;TRC20 = "T" + 33 位(34 位总长),EVM = "0x" + 40 hex。MOCK-ONLY:无人持有私钥,远端档由 store 闸拒发。 */
export function deriveDepositAddress(accountKey: string, network: ChainDepositChannel): string {
  const rnd = mulberry32(fnv1a(`${accountKey}|${network}`));
  const hex = (n: number): string => {
    const chars = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < n; i++) s += chars[Math.floor(rnd() * 16)];
    return s;
  };
  if (network === "usdt-trc20") {
    // TRON 形态:T + 33 字符(近似 base58 大写)
    return "T" + hex(33).toUpperCase();
  }
  // ERC20 / BEP20 共用 EVM 0x 形态(按网络各派各的地址,规格「每网络专属」)
  return "0x" + hex(40);
}

// ── 银行轨([FEAT-PAY02] ③ mock 种子)──────────────────────────────
// 真后台 = D1 银行轨参数(单笔上限/容差)+ 收款账户池(启停/日限/熔断/轮换);
// client 拉取,拉取失败禁回退写死值。最低额与链上共用 MIN_DEPOSIT_USDT($10 等值)。

/** 单笔上限(USD 等值;后台 D1 可配,2026-07-24 拍板 $5,000)。 */
export const BANK_MAX_DEPOSIT_USDT = 5000;

/** 回单金额容差(±₫;差异超此值 → mismatch_review,后台 D1 可配)。 */
export const BANK_VND_TOLERANCE = 1000;

/** 附言码字符集:无易混字符(去 0/O/1/I/L/2/Z/5/S/B/G/Q/U/V,同原型)。 */
const MEMO_CHARSET = "346789ACDEFHJKMNPRTWXY";

/** ⚠️ MOCK-ONLY:附言码 `NX-` + 6 位(在途唯一性由 store 兜底重摇)。PROD = server mint。 */
export function mockMemoCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += MEMO_CHARSET[Math.floor(Math.random() * MEMO_CHARSET.length)];
  return `NX-${s}`;
}

/** 收款账户池行:派发字段 + 启停位(enabled=false 覆盖 admin bank-rail 的
 *  停用与熔断两种语义,uniapp 侧不细分;移出轮换即可)。 */
export type BankReceiveAccount = DepositIntent["bankAccount"] & { enabled: boolean };

/** ⚠️ MOCK-ONLY:收款账户池(轮询轮换)。真后台 = D1 收款账户池 server 派发
 *  (启停/日限/熔断);银行/户名/尾号与 admin bank-rail 种子同风格;
 *  用户转账需完整账号,不脱敏。 */
export const BANK_RECEIVE_ACCOUNTS: ReadonlyArray<BankReceiveAccount> = [
  { accountName: "CTY TNHH NEXGRID VIETNAM", accountNumber: "1023 8829 5501", bankName: "Vietcombank", enabled: true },
  { accountName: "CTY TNHH NEXGRID VIETNAM", accountNumber: "1903 6688 8842", bankName: "Techcombank", enabled: true },
  { accountName: "CTY TNHH NEXGRID VIETNAM", accountNumber: "0355 8020 2074", bankName: "MB Bank", enabled: true },
];

/** 轮询取号:先滤掉停用/熔断户,再按 rotation 取模(负数/越界防御);
 *  全禁用 → null(通道维护,[FEAT-PAY02] ⑤ 空状态);返回值剥掉 enabled 位,
 *  意向单只存派发字段。 */
export function pickBankAccount(
  rotation: number,
  accounts: ReadonlyArray<BankReceiveAccount> = BANK_RECEIVE_ACCOUNTS,
): DepositIntent["bankAccount"] | null {
  const pool = accounts.filter((a) => a.enabled);
  const n = pool.length;
  if (n === 0) return null;
  const { accountName, accountNumber, bankName } = pool[((Math.trunc(rotation) % n) + n) % n];
  return { accountName, accountNumber, bankName };
}

// ── 卡通道(国际卡辅助轨 mock 种子)──────────────────────────────────
// 真后台 = D1 通道配置(费率/最低额/单笔上限)下发,client 拉取,拉取失败禁回退写死值。
// 🔴 计费方向与链上相反:链上「从到账额里扣」(credited = gross − fee),
//    卡「在用户卡上另收」(charge = credited + fee)——用户到账额 = 输入额,不缩水。
//    落 DepositRecord 时 gross = charge(平台实收),仍满足 credited = gross − fee。

/** 卡通道费率(3.5%;后台 D1 可配)。 */
export const CARD_FEE_RATE = 0.035;

/** 卡通道最低充值(USD;通道收窄裁决,链上 min 仍为 MIN_DEPOSIT_USDT)。 */
export const MIN_CARD_DEPOSIT_USDT = 30;

/** 卡通道单笔上限(USD;与银行轨同值但各自可配,后台按通道分别下发)。 */
export const MAX_CARD_DEPOSIT_USDT = 5000;

/** ⚠️ MOCK-ONLY:3DS 拒付率(演示用)。PROD:收单方返回真实授权结果。 */
export const CARD_DECLINE_RATE = 0.1;

/** 费率展示串(如 "3.5%")。文案单源 —— 各页禁自己拼百分号,
 *  否则后台调费率时文案不跟(踩过:i18n 里 3 条把 3.5% 写死)。 */
export function cardFeeRateLabel(): string {
  return `${+(CARD_FEE_RATE * 100).toFixed(2)}%`;
}

/** 卡手续费(USD,两位小数):按入账额计费,另收在用户卡上。
 *  🔴 商城结账也必须调这个,别再写 `+(x * rate).toFixed(2)` —— 费率单源了不等于
 *  算法单源,两种算法同一笔费率会给出两个答案(对抗审查穷举出 14 个金额差 1 分)。
 *  整数域运算(cent × bps),与 fx-core 的牌价/折算同一套标准:浮点直乘再 toFixed 会被
 *  IEEE754 把半分边界压低一分 —— 全区间穷举实测 11 个金额少收 1 分(如 237 → 8.29,
 *  精确值 8.295 应进位 8.30),且舍入方向由表示噪声决定而非规则决定。 */
export function cardFeeUsd(creditedUsdt: number): number {
  const cents = Math.round(creditedUsdt * 100);
  const bps = Math.round(CARD_FEE_RATE * 10000);
  return Math.round((cents * bps) / 10000) / 100;
}

/** 卡实扣额 = 入账额 + 手续费(= DepositRecord 的 grossAmountUsdt)。 */
export function cardChargeUsd(creditedUsdt: number): number {
  return +(creditedUsdt + cardFeeUsd(creditedUsdt)).toFixed(2);
}

/** ⚠️ MOCK-ONLY:卡授权号 `CK-NNNNNN`(幂等键,同链上 txHash 之于链上轨)。
 *  PROD = 收单方返回的授权号,禁客户端造。 */
export function mockCardAuthCode(): string {
  return `CK-${Math.floor(100000 + Math.random() * 900000)}`;
}

// ── 幂等 ───────────────────────────────────────────────────────────

/** 同 txHash 已存在 → 重复上报 no-op([FEAT-PAY01] ④ 幂等键)。 */
export function isDuplicateTxHash(
  records: readonly Pick<DepositRecord, "txHash">[],
  txHash: string,
): boolean {
  if (!txHash) return false;
  return records.some((r) => r.txHash === txHash);
}

/** 同授权号已存在 → 重复回调 no-op(卡轨幂等键,与 isDuplicateTxHash 同形)。 */
export function isDuplicateAuthCode(
  records: readonly Pick<DepositRecord, "authCode">[],
  authCode: string,
): boolean {
  if (!authCode) return false;
  return records.some((r) => r.authCode === authCode);
}

// ── MOCK 单号 / 哈希铸造 ───────────────────────────────────────────

/** ⚠️ MOCK-ONLY:`DP-YYYYMMDD-NNNN`(与 WD- 同族)。PROD = server mint,禁客户端造。 */
export function mockDepositId(now: number): string {
  const yyyymmdd = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `DP-${yyyymmdd}-${seq}`;
}

/** ⚠️ MOCK-ONLY:伪造链上 txHash(0x + 64 hex)。PROD:链上侦测服务回报真实哈希。 */
export function mockChainTxHash(): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 64; i++) s += chars[Math.floor(Math.random() * 16)];
  return "0x" + s;
}
