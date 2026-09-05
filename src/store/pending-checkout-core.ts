/**
 * 待支付会话 · 纯逻辑层(零 pinia / 零 uni,可 node 直跑)。
 *
 * 一笔「待支付会话」= 结算页进入扫码步时开出的那张发票:金额 / 收款地址 / 截止时刻
 * 在开票瞬间冻结,之后用户可以离开再回来继续付**同一笔**(同地址、倒计时连续),
 * 到点作废。结构 100% 镜像后端 PENDING_PAYMENT 订单 + 支付指令
 * (orderNo / amountUsdt / address / expiresAt),PROD 直接由服务端订单驱动同一组件。
 */

import type { InjectionKey, Ref } from "vue";

export type PendingCheckoutMethod = "usdt-trc20" | "usdt-bep20" | "usdt-erc20";

/** 30 分钟付款窗(mock 侧「服务端」常量;PROD 由服务端订单下发 paymentDeadline)。 */
export const PENDING_CHECKOUT_WINDOW_MIN = 30;

/**
 * 浮动条在场时页面内容整体下让的高度(px):app-chassis provide,sub-page-header inject 当 sticky top 增量。
 * 放在这里而不是组件里:两个组件都 import 纯逻辑层,谁也不必 import 谁。
 */
export const PENDING_BAR_INSET_KEY: InjectionKey<Ref<number>> = Symbol("nx-pending-bar-inset");

/**
 * 确认页那份报价分项(展示 / 后端镜像)。发票行来自本地存储、可被改写 —— 结算**不**原样复位它:
 * 券 / 试用逐项取 min(此刻现算值, 记录值),`total` 只作应付天花板 + 「实扣 = 票面」相等闸
 * (见 checkout.vue adoptSession / confirmed 步)。
 */
export interface PendingCheckoutQuote {
  /** 确认页展示过的应付总额(链上付款无卡费 → 与 amountUsdt 相等)。 */
  total: number;
  voucher: { id: string | null; discount: number };
  trial: { applied: boolean; promo: number; offsetUSD: number; remainderUSD: number; shadowNEX: number };
  /** 旧机抵扣上下文(离开结算页会清内存态,恢复时凭它重新 applyTradein)。 */
  tradeIn: { deviceId: string } | null;
}

export interface PendingCheckoutSession {
  /** 会话主键(mock 铸造;PROD = orderNo)。 */
  id: string;
  /** 预留:购机 | 充值(充值意向单目前仍在 deposits store,未迁)。 */
  kind: "purchase" | "deposit";
  /** 服务端订单号 —— 本地支付腿里恒为 null(建单那一刻会话即结束);服务端驱动时 = orderNo。 */
  orderNo: string | null;
  productId: string;
  method: PendingCheckoutMethod;
  /** 用户被要求转账的精确金额(USDT)。 */
  amountUsdt: number;
  /** 收款地址 —— 每单专属,开票即定,恢复必须原样。 */
  address: string;
  /** ms epoch(mockServerNow)。 */
  createdAt: number;
  expiresAt: number;
  quote: PendingCheckoutQuote;
  /** 「订单已保留 30 分钟」提示只在首次离开时给一次(跨刷新持久)。 */
  leftNoticeShown: boolean;
}

/** 到点即死:expiresAt 之后不可再推进付款。 */
export function isSessionLive(session: PendingCheckoutSession, now: number): boolean {
  return Number.isFinite(session.expiresAt) && now < session.expiresAt;
}

/** 剩余整秒(向上取,归零即 0)。 */
export function sessionSecondsLeft(session: PendingCheckoutSession, now: number): number {
  return Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
}

/** 只留仍在窗内的会话(过期行不留 —— 它没有任何可恢复动作)。 */
export function pruneExpiredSessions(sessions: PendingCheckoutSession[], now: number): PendingCheckoutSession[] {
  return sessions.filter((s) => isSessionLive(s, now));
}

/** 浮动条 / 撞单判定用的「当前那一笔」:最早开出的仍在窗内的会话。 */
export function firstLiveSession(sessions: PendingCheckoutSession[], now: number): PendingCheckoutSession | null {
  return sessions.find((s) => isSessionLive(s, now)) ?? null;
}

/** mm:ss(倒计时展示,00:00 封底)。 */
export function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 记录的抵扣 / 入账分项:非数值 / 负数一律按 0(负折扣 = 反向多扣,不许从存储行进来)。 */
function nonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * 存储行归一化:坏行 / 缺字段 / 出界一律丢弃(宁可少一条也不复活一张残缺发票)。
 * `now` = 读入时刻:窗口除了宽度还要卡**位置** —— expiresAt 不得晚于 now + 30 分钟,否则把两个时间戳一起
 * 前移 10 年就是一张永生发票(审计 R6 P1:只卡宽度的取值域被同步前移绕过)。
 */
export function normalizeSessions(raw: unknown, now: number = Date.now()): PendingCheckoutSession[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingCheckoutSession[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const s = r as Partial<PendingCheckoutSession>;
    if (typeof s.id !== "string" || !s.id) continue;
    if (s.method !== "usdt-trc20" && s.method !== "usdt-bep20" && s.method !== "usdt-erc20") continue;
    if (typeof s.productId !== "string" || typeof s.address !== "string" || !s.address) continue;
    if (typeof s.amountUsdt !== "number" || !Number.isFinite(s.amountUsdt) || s.amountUsdt < 0) continue;
    if (typeof s.createdAt !== "number" || typeof s.expiresAt !== "number") continue;
    // 取值域也守(行来自 localStorage,可被改写):窗口只能是 (0, 30 分钟],createdAt 不得晚于 expiresAt ——
    // 否则手写一个 expiresAt = 10 年后就是一张永生发票,「30 分钟窗」不变量在读入面就不成立。
    if (!Number.isFinite(s.createdAt) || !Number.isFinite(s.expiresAt)) continue;
    const windowMs = s.expiresAt - s.createdAt;
    if (!(windowMs > 0 && windowMs <= PENDING_CHECKOUT_WINDOW_MIN * 60_000)) continue;
    if (s.expiresAt > now + PENDING_CHECKOUT_WINDOW_MIN * 60_000) continue; // 位置:最晚也只能是「刚开出的一张」
    const q = s.quote;
    if (!q || typeof q !== "object" || typeof q.total !== "number" || !Number.isFinite(q.total) || q.total < 0) continue;
    // 票面自洽:链上发票要求转账的金额就是确认页应付总额,两者不等的行不是本 store 开出来的。
    if (Math.abs(q.total - s.amountUsdt) > 0.000001) continue;
    out.push({
      id: s.id,
      kind: s.kind === "deposit" ? "deposit" : "purchase",
      orderNo: typeof s.orderNo === "string" ? s.orderNo : null,
      productId: s.productId,
      method: s.method,
      amountUsdt: s.amountUsdt,
      address: s.address,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      quote: {
        total: q.total,
        voucher: { id: typeof q.voucher?.id === "string" ? q.voucher.id : null, discount: nonNegative(q.voucher?.discount) },
        trial: {
          applied: q.trial?.applied === true,
          promo: nonNegative(q.trial?.promo),
          offsetUSD: nonNegative(q.trial?.offsetUSD),
          remainderUSD: nonNegative(q.trial?.remainderUSD),
          shadowNEX: nonNegative(q.trial?.shadowNEX),
        },
        tradeIn: q.tradeIn && typeof q.tradeIn.deviceId === "string" ? { deviceId: q.tradeIn.deviceId } : null,
      },
      leftNoticeShown: s.leftNoticeShown === true,
    });
  }
  return out;
}

export type PendingCheckoutQuoteParts = Pick<PendingCheckoutQuote, "trial" | "voucher">;
export const NO_TRIAL_QUOTE: PendingCheckoutQuote["trial"] = { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0 };

/**
 * 恢复发票时的报价对账 —— 结算页 adoptSession 唯一取数口(审计 R3 P0 / R4 P1 / R5 P1 三轮收敛于此):
 *   · 每一分项 = min(此刻现算值, 发票记录值)。记录值不可信(本地可改)→ 不得高于现算;
 *     现算不得高于记录 → 窗内新到的券 / 多累计的试用收益不参与这一单,实扣恰好 = 票面。
 *   · 试用:双方都 applied 才带;否则按无试用(现算没了 → 实扣高于票面 → 支付时刻按票面闸拒单)。
 *   · 券:只有「此刻匹配到的正是发票那张」才带折扣;发票没券 / 那张没了或换了 → 不带券也不带 id
 *     (id 为 null 表示这一单不依赖任何券,支付时刻的券一致性闸对它不设限)。
 */
export function reconcileInvoiceQuote(live: PendingCheckoutQuoteParts, invoice: PendingCheckoutQuote): PendingCheckoutQuoteParts {
  const trial = live.trial.applied && invoice.trial.applied
    ? {
        applied: true,
        promo: Math.min(live.trial.promo, invoice.trial.promo),
        offsetUSD: Math.min(live.trial.offsetUSD, invoice.trial.offsetUSD),
        remainderUSD: Math.min(live.trial.remainderUSD, invoice.trial.remainderUSD),
        shadowNEX: Math.min(live.trial.shadowNEX, invoice.trial.shadowNEX),
      }
    : NO_TRIAL_QUOTE;
  const voucher = live.voucher.id && live.voucher.id === invoice.voucher.id
    ? { id: live.voucher.id, discount: Math.min(live.voucher.discount, invoice.voucher.discount) }
    : { id: null, discount: 0 };
  return { trial, voucher };
}
