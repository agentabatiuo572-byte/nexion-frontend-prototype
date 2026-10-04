// Voucher (代金券) catalog — operator-configured promotion vouchers a user can
// claim and redeem at checkout. Plain data + pure helpers (zero Vue deps),
// mirroring src/mock/products.ts so it swaps 1:1 for a real backend:
//   listVouchers()        → GET /api/vouchers
//   getVoucher(id)        → GET /api/vouchers/:id
// The operator backend (Nexion-admin-prototype, H domain 代金券模块) edits the
// SAME VoucherDef contract (its OpsVoucher is a structured superset); the two
// prototypes share no storage but represent the same backend resource.
//
// Two voucher kinds:
//   · "fixed"   满减 — amountUSD off once the order meets minPurchaseUSD.
//   · "percent" 折扣 — percent% off, hard-capped at maxDiscountUSD.
// Applicability: applicableSkus lists the eligible product ids; an EMPTY array
// means "all devices" (the multi-device case → claim CTA routes to the mall).

import { mockServerNow } from "@/store/server-time";

export type VoucherType = "fixed" | "percent";
/** Targeting cohort. "new" = new-user gift, "all" = open activity voucher. */
export type VoucherAudience = "new" | "all";
/** Front-end surfaces that may host the claim banner (must mirror the admin
 *  claimSurfaces enum + chassis TAB_ROUTE_KEY). */
export type VoucherSurface = "home" | "store" | "me" | "earn";

export interface VoucherDef {
  id: string;
  /** Operator-configured display name (plain string, like Product.name — NOT an
   *  i18n key; the surrounding chrome is i18n, the name is backend data). */
  name: string;
  type: VoucherType;
  /** 满减 face value, USD (type === "fixed"). */
  amountUSD?: number;
  /** 折扣 rate, whole percent e.g. 8 = 8% off (type === "percent"). */
  percent?: number;
  /** 满减门槛 — minimum order subtotal (USD) for the voucher to apply. 0 = none. */
  minPurchaseUSD?: number;
  /** 折扣封顶 — max discount (USD) for a percent voucher. 0/undefined = uncapped. */
  maxDiscountUSD?: number;
  /** Eligible product ids. EMPTY = all devices (multi-device → routes to mall). */
  applicableSkus: string[];
  audience: VoucherAudience;
  /** Validity window, epoch ms. endAt === 0 → open-ended (no expiry). */
  startAt: number;
  endAt: number;
  /** Surfaces whose fallback banner advertises this voucher after popup close. */
  claimSurfaces: VoucherSurface[];
  /** Whether this voucher participates in the Home auto-popup. */
  popupEnabled: boolean;
  /** Server-owned popup cadence; absent only for explicit mock catalog rows. */
  popupDelayMs?: number;
  popupCooldownHours?: number;
  popupMaxPerSession?: number;
  popupCadenceEnabled?: boolean;
  nextEligibleAt?: number;
  popupEligible?: boolean;
  // ── 叠加 / 性质策略(后台可配)──
  /** 是否可与试用收益抵扣叠加(默认 false:二选一取最优)。 */
  stackWithTrial: boolean;
  /** 是否可与其它优惠(套装折扣等)叠加(默认 false)。 */
  stackWithOthers: boolean;
  /** 是否可拆分(默认 false:整张一次性用于一笔订单,不拆分到多单)。 */
  splittable: boolean;
  // 不可提现是代金券的固有性质(折扣只在结算抵扣价格、永不入可提现余额),
  // 由设计保证(computeVoucherDiscount 只减价不入账),非可配开关。
  status: "active" | "paused";
}

// Demo seed — credible promo values (no self-exposing numbers): a new-user 满减
// on the entry box, and an open 折扣 activity across all devices.
export const VOUCHERS: VoucherDef[] = [
  {
    id: "vc-newuser-50",
    name: "New User Gift",
    type: "fixed",
    amountUSD: 50,
    minPurchaseUSD: 600,
    applicableSkus: ["stellarbox-s1"],
    audience: "new",
    startAt: 0,
    endAt: 0,
    claimSurfaces: ["home", "store"],
    popupEnabled: true,
    stackWithTrial: false,
    stackWithOthers: false,
    splittable: false,
    status: "active",
  },
  {
    id: "vc-activity-8pct",
    name: "Summer Activity",
    type: "percent",
    percent: 8,
    maxDiscountUSD: 200,
    applicableSkus: [],
    audience: "all",
    startAt: 0,
    endAt: Date.UTC(2026, 11, 31), // 2026-12-31 — exercises the dated-expiry display path
    claimSurfaces: ["home", "store", "me", "earn"],
    popupEnabled: true,
    stackWithTrial: true,
    stackWithOthers: false,
    splittable: false,
    status: "active",
  },
];

/** Backend-replaceable read (today: in-memory mock → GET /api/vouchers). */
export function listVouchers(): VoucherDef[] {
  return VOUCHERS;
}

export function getVoucher(id: string): VoucherDef | undefined {
  return VOUCHERS.find((v) => v.id === id);
}

/** Active + inside its validity window at `now` (default = server time). */
export function isVoucherValid(def: VoucherDef, now: number = mockServerNow()): boolean {
  if (def.status !== "active") return false;
  if (def.startAt > 0 && now < def.startAt) return false;
  if (def.endAt > 0 && now > def.endAt) return false;
  return true;
}

/**
 * Pure discount math — single source of truth shared by the claim sheet preview
 * and the checkout redemption so the two can never diverge.
 *   · fixed:   amountUSD off, only if subtotal >= minPurchaseUSD.
 *   · percent: percent% of subtotal, capped at maxDiscountUSD (if set).
 * Discount never exceeds the subtotal. Returns a 2-dp USD number.
 */
export function computeVoucherDiscount(def: VoucherDef, subtotalUSD: number): number {
  if (subtotalUSD <= 0) return 0;
  let raw = 0;
  if (def.type === "fixed") {
    const threshold = def.minPurchaseUSD ?? 0;
    if (subtotalUSD < threshold) return 0;
    raw = def.amountUSD ?? 0;
  } else {
    raw = (subtotalUSD * (def.percent ?? 0)) / 100;
    if (def.maxDiscountUSD && def.maxDiscountUSD > 0) raw = Math.min(raw, def.maxDiscountUSD);
  }
  return +Math.min(raw, subtotalUSD).toFixed(2);
}

/** True when the voucher applies to a single specific SKU (claim CTA → that SKU's
 *  detail page); false for multi/all-device vouchers (claim CTA → mall). */
export function isSingleSkuVoucher(def: VoucherDef): boolean {
  return def.applicableSkus.length === 1;
}

/** Whether a given product id is eligible for this voucher (empty list = all). */
export function voucherAppliesToSku(def: VoucherDef, skuId: string): boolean {
  return def.applicableSkus.length === 0 || def.applicableSkus.includes(skuId);
}

// Home auto-popup throttle config (后台可控 · would be served alongside the
// catalog). Mirrors the trial system's autoPush* fields.
export const VOUCHER_POPUP = {
  autoPushDelayMs: 1300, // fires BEFORE the trial auto-push (1500ms) so the voucher takes priority on Home; the trial sheet defers to it (and fills in when no voucher is claimable)
  cooldownHours: 24,
  maxPerSession: 1,
};
