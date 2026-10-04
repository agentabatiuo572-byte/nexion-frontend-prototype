import { defineStore } from "pinia";
import { ref } from "vue";
import { parseTrialBooleanConfig } from "@/lib/trial-config-enum";
import type { TrialConfigValue } from "@/api/trial-api";

/**
 * Trial config — "后台可控" parameters surfaced as a store rather than
 * constants. The formal App reads this from the Java H2 policy authority;
 * the prototype ancestry is retained only for the local non-authoritative shape.
 */
export interface TrialConfig {
  /** Free trial duration in days (shadow accrues during this window) */
  trialDays: number;
  /** Grace window after trial — production stopped, credit stays usable (spec ③) */
  graceDays: number;
  /** Active-purchase discount rate (applies during trial + grace) */
  discountRate: number;
  /** Active-purchase discount hard cap, USD */
  discountCapUSD: number;
  /** Trial-earnings offset cap, USD (offsets device price at purchase; remainder
   *  credited to balance AFTER purchase; before purchase only offsets). 后台可调。 */
  trialOffsetCapUSD: number;
  /** Trial product id selected by the authoritative product policy. */
  trialProductId: TrialProductId;
  /** Server-owned E1 display name for the selected product. */
  trialProductName: string;
  /** Trial product price (conversion checkout subtotal) */
  trialPriceUSD: number;
  /** Shadow accrual rates (S1 baseline per spec §3.1) */
  shadowDailyUSD: number;
  shadowDailyNEX: number;
  /** Remaining free-trial offers displayed on the Earn hero card. */
  seatsLeftToday: number;
  /** Whether trial is open in the current product phase */
  phaseOpen: boolean;
  // ── Auto-push controls (claim sheet 弹出策略,后台可控)──
  autoPushEnabled: boolean;
  autoPushDelayMs: number;
  autoPushCooldownHours: number;
  autoPushMaxPerSession: number;
}

/**
 * The API owns the selected product; the client only recognizes contractually
 * supported product-to-display-device mappings.  An unrecognized remote id is
 * deliberately rejected instead of being guessed or silently falling back.
 */
export const TRIAL_PRODUCT_DEVICE_NAMES = {
  "stellarbox-s1": "UVELBox S1",
  "device-trial-standard": "UVELBox S1",
} as const;

export type TrialProductId = string;

/**
 * H2 historically stores `device-trial-standard` as a policy alias, while the
 * commerce catalog and `/api/trial/convert` use the real SKU `stellarbox-s1`.
 * Keep that translation explicit so an alias can never be sent to checkout as
 * a dangling product id.
 */
const TRIAL_CHECKOUT_PRODUCT_IDS: Record<string, string> = {
  "stellarbox-s1": "stellarbox-s1",
  "device-trial-standard": "stellarbox-s1",
};

export function resolveTrialCheckoutProductId(productId: unknown): string | null {
  if (typeof productId !== "string") return null;
  const normalized = productId.trim();
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(normalized)) return null;
  return TRIAL_CHECKOUT_PRODUCT_IDS[normalized] ?? normalized;
}

export function resolveTrialDeviceName(productId: unknown, serverName?: unknown): string | null {
  const productNo = resolveTrialCheckoutProductId(productId);
  if (!productNo) return null;
  const rawProductId = typeof productId === "string" ? productId.trim() : "";
  if (Object.prototype.hasOwnProperty.call(TRIAL_PRODUCT_DEVICE_NAMES, rawProductId)) {
    return TRIAL_PRODUCT_DEVICE_NAMES[rawProductId as keyof typeof TRIAL_PRODUCT_DEVICE_NAMES];
  }
  if (typeof serverName !== "string") return null;
  const normalizedName = serverName.trim();
  return normalizedName && normalizedName.length <= 128 ? normalizedName : null;
}

export const DEFAULT_TRIAL_CONFIG: TrialConfig = {
  trialDays: 3,
  graceDays: 7,
  discountRate: 0.15,
  discountCapUSD: 20,
  trialOffsetCapUSD: 50,
  trialProductId: "stellarbox-s1",
  trialProductName: "UVELBox S1",
  trialPriceUSD: 649,
  shadowDailyUSD: 7,
  shadowDailyNEX: 40,
  seatsLeftToday: 0,
  phaseOpen: true,
  autoPushEnabled: true,
  autoPushDelayMs: 1500,
  autoPushCooldownHours: 24,
  autoPushMaxPerSession: 1,
};

const STORAGE_KEY = "nexgrid-trial-config-v1";
const remoteAuthority = true;

function hydrate(): TrialConfig {
  try {
    const s = uni.getStorageSync(STORAGE_KEY) as { config?: Partial<TrialConfig> } | "";
    if (s && typeof s === "object" && s.config) {
      // Merge over defaults so newly-added fields exist for old persisted state.
      return { ...DEFAULT_TRIAL_CONFIG, ...s.config };
    }
  } catch {
    // first run
  }
  return { ...DEFAULT_TRIAL_CONFIG };
}

export const useTrialConfig = defineStore("trialConfig", () => {
  const config = ref<TrialConfig>(remoteAuthority ? { ...DEFAULT_TRIAL_CONFIG } : hydrate());

  function persist() {
    if (remoteAuthority) return;
    try {
      uni.setStorageSync(STORAGE_KEY, { config: config.value });
    } catch {
      // storage unavailable
    }
  }
  function update(patch: Partial<TrialConfig>) {
    if (remoteAuthority) return;
    config.value = { ...config.value, ...patch };
    persist();
  }
  function applyAuthoritative(raw: Record<string, TrialConfigValue>) {
    if (!remoteAuthority) return;
    const number = (key: string, min = 0) => {
      const value = Number(raw[key]);
      if (!Number.isFinite(value) || value < min) throw new Error("TRIAL_CONFIG_RESPONSE_INVALID");
      return value;
    };
    const integer = (key: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
      const value = number(key, min);
      if (!Number.isInteger(value) || value > max) throw new Error("TRIAL_CONFIG_RESPONSE_INVALID");
      return value;
    };
    const bool = (key: string) => {
      return parseTrialBooleanConfig(raw[key]);
    };
    const discountRate = number("discountRate");
    const trialProductId = String(raw.trialProductId ?? "").trim();
    const trialProductName = String(raw.trialProductName ?? "").trim();
    if (discountRate > 100 || !resolveTrialDeviceName(trialProductId, trialProductName)) {
      throw new Error("TRIAL_CONFIG_RESPONSE_INVALID");
    }
    config.value = {
      trialDays: integer("trialDays", 1),
      graceDays: integer("graceDays"),
      discountRate: discountRate > 1 ? discountRate / 100 : discountRate,
      discountCapUSD: number("discountCapUSD"),
      trialOffsetCapUSD: number("trialOffsetCapUSD"),
      trialProductId,
      trialProductName,
      trialPriceUSD: number("trialPriceUSD", Number.EPSILON),
      shadowDailyUSD: number("shadowDailyUSD"),
      shadowDailyNEX: number("shadowDailyNEX"),
      seatsLeftToday: integer("seatsLeftToday", 0, 1_000_000),
      phaseOpen: bool("phaseOpen"),
      autoPushEnabled: bool("autoPushEnabled"),
      autoPushDelayMs: integer("autoPushDelayMs"),
      autoPushCooldownHours: integer("autoPushCooldownHours"),
      autoPushMaxPerSession: integer("autoPushMaxPerSession"),
    };
  }
  function reset() {
    if (remoteAuthority) return;
    config.value = { ...DEFAULT_TRIAL_CONFIG };
    persist();
  }

  return { config, update, applyAuthoritative, reset };
});

/** Compute discounted price for a conversion purchase during trial/grace. */
export function computeDiscountedPrice(config: TrialConfig): {
  subtotal: number;
  discount: number;
  total: number;
} {
  const subtotal = config.trialPriceUSD;
  const discount = Math.min(subtotal * config.discountRate, config.discountCapUSD);
  return { subtotal, discount: +discount.toFixed(2), total: +(subtotal - discount).toFixed(2) };
}

/**
 * Split accrued trial earnings into price-offset portion (capped) + post-purchase
 * balance remainder. Single source of truth shared by every surface that quotes
 * the credit (trial page + checkout conversion) so they never diverge.
 * Real backend: server computes this inside POST /api/trial/convert (PRD §9.11a.2).
 */
export function computeTrialOffset(
  config: TrialConfig,
  shadowUSD: number,
): { offsetUSD: number; remainderUSD: number } {
  const earnings = Math.max(0, shadowUSD);
  const offsetUSD = +Math.min(earnings, config.trialOffsetCapUSD).toFixed(2);
  const remainderUSD = +(earnings - offsetUSD).toFixed(2);
  return { offsetUSD, remainderUSD };
}
