<!--
  ProductCard — the store's primary conversion unit (ported from store/page.tsx
  ProductCardV5 + ProductRender + ProductRibbon). The whole card taps to the
  detail page; the footer Buy/Stake CTA taps to checkout (stops propagation).

  Top→bottom:
    · ProductRender hero photo (S1/Pro/Rack) or cyan Cloud-Share schematic,
      with folded-corner badge ribbon + tier-code chip + Legacy chip overlay.
    · Body: name, ROI hero (daily earn / trade-in). Specs and AI throughput
      stay on the detail page.
    · Footer: price + frosted Buy CTA.
-->
<template>
  <!-- 《08》§2:tap 反馈 active:scale+opacity(禁 hover 做移动端反馈) -->
  <view class="relative overflow-hidden block active:scale-[0.98] active:opacity-80" :style="cardStyle" role="button" tabindex="0" @click="goDetail">
    <view v-if="featured" aria-hidden :style="featuredGlowStyle" />

    <!-- ───── Hero photo banner ───── -->
    <view class="relative overflow-hidden" :style="renderWrapStyle">
      <!-- Cloud Share schematic -->
      <view v-if="isShare" class="absolute inset-0 grid place-items-center" style="color: var(--v5-tech-cyan-ink)">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg>
      </view>
      <!-- Real product photo -->
      <image v-else-if="photo" :src="photo.src" mode="aspectFill" style="position: absolute; inset: 0; width: 100%; height: 100%" />
      <!-- Fallback box icon -->
      <view v-else class="absolute inset-0 grid place-items-center" style="color: var(--v5-ink-3)">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
      </view>

      <!-- Mid-vignette + bottom fade -->
      <view v-if="photo" aria-hidden :style="vignetteStyle" />
      <view aria-hidden :style="fadeStyle" />

      <!-- Badge ribbon -->
      <view v-if="copy.badge" class="absolute" :style="ribbonStyle">
        <text>{{ copy.badge }}</text>
      </view>

      <!-- Tier-code chip + Legacy chip (photo) -->
      <view v-if="photo" class="absolute flex flex-col items-start gap-1.5" style="bottom: 12px; left: 14px; pointer-events: none">
        <text class="font-mono-tabular" :style="tierChipStyle">{{ photo.tierCode }}</text>
        <text v-if="product.status === 'legacy'" class="font-mono-tabular" :style="legacyChipStyle">{{ t.store.cardLegacyBadge }}</text>
      </view>
      <!-- Cloud chip -->
      <view v-if="isShare" class="absolute" style="bottom: 28px; left: 14px; pointer-events: none">
        <text class="font-mono-tabular" :style="cloudChipStyle">{{ t.store.cardCloudDistributed }}</text>
      </view>
    </view>

    <!-- ───── Body ───── -->
    <view class="relative" style="padding: 14px 16px">
      <view>
        <view class="min-w-0">
          <text class="block" :style="nameStyle">{{ product.name }}</text>
        </view>
      </view>

      <!-- ROI 4-line hero -->
      <!-- 去线(主人 2026-08-17 全站令):mt-6 = 原 mt-3 + pt-3 的总间距 -->
      <view class="mt-6">
        <!-- Eyebrow -->
        <view class="font-mono-tabular inline-flex items-center gap-1.5" :style="earnEyebrowStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text>{{ t.store.cardYouEarn }}</text>
        </view>

        <!-- Line 1: daily earn -->
        <view class="mt-1 flex items-baseline gap-2 flex-wrap">
          <text class="tabular-nums" :style="bigEarnStyle">${{ dailyEarnText }}<text style="font-size: 15px; color: var(--v5-ink-3); font-weight: 500">{{ t.store.cardPerDaySuffix }}</text></text>
          <!-- 「/天」单位后缀恒用弱化色,不跟数字的强调色走 —— 与同行美元侧同一档 ink-3
               (主人 2026-08-17:两侧 /天 字色必须一致) -->
          <text class="font-mono-tabular tabular-nums" style="font-size: 13px; color: var(--v5-warning-ink); font-weight: 500">{{ nexPerDayText }}<text style="color: var(--v5-ink-3)">{{ t.store.cardPerDaySuffix }}</text></text>
          <text v-if="stockLow" class="font-mono-tabular tabular-nums" :style="stockHintStyle">{{ stockHintText }}</text>
        </view>

        <!-- FEAT-DEV01: 高阶任务能力线(算力越高可接任务面越大 · 数据取 SKU 解锁算力池) -->
        <view v-if="copy.unlocks" class="mt-1.5 flex items-center gap-1.5">
          <svg class="shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text class="min-w-0 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.store.cardHighTierLine, { pool: copy.unlocks }) }}</text>
        </view>

        <!-- Purchase gate — remote mode is server-authoritative and fail-closed. -->
        <view v-if="gateLockedView" class="mt-2.5 active:opacity-70" :style="gateBoxStyle" role="button" tabindex="0" @click.stop="toggleGateDetails">
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-1.5" :style="gateEyebrowStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <text>{{ gateLabel }}</text>
            </view>
            <view v-if="!gate.soldOut" class="grid place-items-center" :style="gateToggleStyle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </view>
          </view>
          <view v-if="!remoteApiEnabled && !gate.soldOut && gateDetailsOpen" class="mt-1.5 flex flex-wrap" style="gap: 6px">
            <text v-for="(c, i) in gateCondTexts" :key="i" :style="gateCondStyle">{{ c }}</text>
          </view>
          <text v-if="!remoteApiEnabled && !gate.soldOut && gateDetailsOpen" class="block" :style="gateMetaStyle">{{ gateModeText ? gateModeText + " · " : "" }}{{ gateProgressText }}</text>
          <text v-if="remoteApiEnabled && eligibility.status === 'error'" class="block" :style="gateMetaStyle">{{ t.store.purchaseEligibilityError }}</text>
        </view>

        <!-- Trade-in callout (legacy) -->
        <view v-if="showTradein" class="mt-2.5 flex items-center justify-between gap-2 font-mono-tabular" :style="tradeinBoxStyle">
          <text>{{ t.store.cardTradeUp }} · <text style="color: var(--v5-success-ink); font-weight: 500">{{ tradeCreditText }}</text></text>
          <text class="whitespace-nowrap active:opacity-70" style="color: var(--v5-brand); font-weight: 500; font-family: var(--font-v5)" role="button" tabindex="0" @click.stop="goDevices">{{ t.store.cardTradeInCta }}</text>
        </view>
      </view>
    </view>

    <!-- ───── Footer: price + Buy CTA ───── -->
    <view class="grid items-center gap-3" :style="footerStyle">
      <view class="min-w-0">
        <text class="block font-mono-tabular" :style="priceEyebrowStyle">{{ t.store.cardPriceLabel }}</text>
        <view class="tabular-nums flex items-baseline" :style="priceRowStyle">
          <text style="font-size: 15px; color: var(--v5-ink-3); font-weight: 500">$</text>
          <text style="font-size: 26px; font-weight: 600">{{ priceText }}</text>
        </view>
      </view>
      <!-- 品牌填充按钮:opacity 取 85(《08》§2 状态派生公式) -->
      <view class="inline-flex items-center justify-center whitespace-nowrap active:scale-[0.97] active:opacity-85" :style="buyBtnDynStyle" role="button" tabindex="0" @click.stop="onBuy">
        <svg v-if="gateLockedView" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; opacity: 0.9"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text role="button" tabindex="0" @click.stop="onBuy">{{ buyLabel }}</text>
        <svg v-if="!gateLockedView" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; opacity: 0.9"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import type { Product } from "@/mock/products";
import type { DeviceKind } from "@/store/types";
import { useDeviceEligibility } from "@/composables/use-device-eligibility";
import { computeTradeInCredit } from "@/mock/tradein-config";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import { productCopy } from "@/lib/product-copy";
import { remoteApiEnabled } from "@/api/runtime";
import { useRemotePurchaseEligibility } from "@/store/purchase-eligibility";

const props = withDefaults(defineProps<{ product: Product; featured?: boolean }>(), {
  featured: false,
});
const t = useT();
const copy = computed(() => productCopy(t.value, props.product));

const PRODUCT_PHOTO: Record<string, { src: string; tierCode: string }> = {
  "stellarbox-s1": { src: "/static/img/products/nexgridbox-s1-v4.png", tierCode: "S1" },
  "stellarbox-pro": { src: "/static/img/products/nexgridbox-pro-v2.png", tierCode: "Pro" },
  "stellarbox-pro-v2": { src: "/static/img/products/nexgridbox-pro-v2.png", tierCode: "Pro v2" },
  "stellarrack-p1": { src: "/static/img/products/nexgridrack-p1-v2.png", tierCode: "Rack P1" },
  "stellarrack-p2": { src: "/static/img/products/nexgridrack-p1-v2.png", tierCode: "Rack P2" },
};

const isShare = computed(() => props.product.tier === "Share");
const photo = computed(() => (isShare.value ? null : PRODUCT_PHOTO[props.product.id] ?? null));

const stockLow = computed(
  () => !isShare.value && props.product.stock != null && props.product.stock < 50,
);
// FEAT-DEV02:动态置换角标——用户任一设备可抵本卡时展示「最高可抵 $X」(取
// 可抵额最高的设备,阶梯实时派生,无固定映射)。
const { tradeInSources: cardTradeinDevices } = useDeviceEligibility(props.product.id as DeviceKind);
const bestTradeinCredit = computed(() => {
  const d = cardTradeinDevices.value[0];
  if (!d) return 0;
  return computeTradeInCredit(d.paidPriceUsdt ?? 0, d.cumulativeEarningsUsdt ?? 0, props.product.price);
});
const showTradein = computed(() => !remoteApiEnabled && bestTradeinCredit.value > 0);

// ── Purchase gate ──────────────────────────────────────────────────────────
// Remote mode never evaluates the local V-rank/team snapshot. The server
// eligibility response is the only source that can unlock this card.
const localPurchaseGate = remoteApiEnabled ? null : usePurchaseGate(() => props.product);
const { eligibility, retry: retryEligibility } = useRemotePurchaseEligibility(() => props.product.id);
const gate = computed(() => remoteApiEnabled
  ? {
      gated: true,
      eligible: eligibility.value.status === "ready" && eligibility.value.eligible,
      soldOut: eligibility.value.status === "ready"
        && !eligibility.value.eligible
        && /SOLD_OUT|OUT_OF_STOCK|STOCK/.test(eligibility.value.snapshot?.decisionCode ?? ""),
      blocked: eligibility.value.status !== "ready" || !eligibility.value.eligible,
      remaining: null,
      conditions: [],
      unmet: [],
      progressPct: eligibility.value.status === "ready" && eligibility.value.eligible ? 1 : 0,
    }
  : localPurchaseGate!.gate.value);
const gateDetailsOpen = ref(false);
let lastGateToggleAt = 0;
const gateLockedView = computed(() => gate.value.gated && gate.value.blocked);
const gateLabel = computed(() => {
  if (!remoteApiEnabled) return gate.value.soldOut ? t.value.store.gateSoldOut : t.value.store.gateLockedEyebrow;
  if (eligibility.value.status === "loading" || eligibility.value.status === "idle") return t.value.store.purchaseEligibilityLoading;
  if (eligibility.value.status === "error") return t.value.store.purchaseEligibilityRetry;
  return gate.value.soldOut ? t.value.store.gateSoldOut : t.value.store.purchaseEligibilityIneligible;
});
const gateCondTexts = computed(() =>
  gate.value.conditions.map((c) => {
    if (c.kind === "rank") return fmt(t.value.store.gateCondRank, { n: c.need });
    if (c.kind === "activeDirect") return fmt(t.value.store.gateCondDirect, { n: c.need });
    return fmt(t.value.store.gateCondVolume, { n: c.need.toLocaleString() });
  }),
);
const gateModeText = computed(() =>
  gate.value.conditions.length > 1
    ? props.product.purchaseGate?.mode === "all"
      ? t.value.store.gateModeAll
      : t.value.store.gateModeAny
    : "",
);
const gateProgressText = computed(() =>
  fmt(t.value.store.gateProgress, { pct: Math.round(gate.value.progressPct * 100) }),
);
const buyLabel = computed(() =>
  remoteApiEnabled && (eligibility.value.status === "loading" || eligibility.value.status === "idle")
    ? t.value.store.purchaseEligibilityLoading
    : remoteApiEnabled && eligibility.value.status === "error"
      ? t.value.store.purchaseEligibilityRetry
      : gate.value.soldOut
    ? t.value.store.gateSoldOut
    : gate.value.blocked
      ? t.value.store.gateLockedEyebrow
      : t.value.store.cardBuyNow,
);
function onBuy() {
  if (remoteApiEnabled) {
    if (eligibility.value.status === "error") void retryEligibility();
    else if (eligibility.value.status === "ready" && eligibility.value.eligible) goCheckout();
    return;
  }
  if (gate.value.blocked) {
    navTo("/pages/team/quota");
    return;
  }
  goCheckout();
}
function toggleGateDetails() {
  const now = Date.now();
  if (now - lastGateToggleAt < 120) return;
  lastGateToggleAt = now;
  if (remoteApiEnabled && eligibility.value.status === "error") {
    void retryEligibility();
    return;
  }
  if (!gate.value.soldOut) gateDetailsOpen.value = !gateDetailsOpen.value;
}

// Text helpers (toFixed / toLocaleString / fmt) — kept out of template for clarity
const dailyEarnText = computed(() => props.product.dailyEarn.toFixed(2));
const nexPerDayText = computed(() => fmt(t.value.store.cardNexPerDay, { n: props.product.dailyEarnNEX }));
const tradeCreditText = computed(() =>
  fmt(t.value.store.cardTradeCredit, { n: bestTradeinCredit.value.toFixed(2) }),
);
const priceText = computed(() =>
  isShare.value ? String(props.product.price) : props.product.price.toLocaleString(),
);
const stockHintText = computed(() => fmt(t.value.store.cardStockCompact, { n: props.product.stock ?? 0 }));

function goDetail() {
  navTo(`/pages/store/detail?id=${props.product.id}`);
}
function goCheckout() {
  navTo(`/pages/store/checkout?product=${props.product.id}`);
}
function goDevices() {
  navTo("/pages/me/devices");
}

// ───── styles ─────
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const featuredGlowStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background: "radial-gradient(40% 50% at 80% 0%, var(--v5-tech-cyan-soft) 0%, transparent 60%)",
  filter: "blur(12px)",
  opacity: 0.6,
  pointerEvents: "none",
};
const renderWrapStyle = computed<CSSProperties>(() => ({
  width: "100%",
  height: "180px",
  background: isShare.value
    ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--v5-tech-cyan) 8%, transparent) 0 8px, transparent 8px 18px)," +
      "linear-gradient(135deg, var(--v5-tech-cyan-soft) 0%, var(--v5-surface-2) 100%)"
    : photo.value
      ? "linear-gradient(135deg, #101216 0%, #0A0B0E 60%, #000000 100%)"
      : "var(--v5-surface-2)",
}));
const vignetteStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.28) 78%, rgba(0,0,0,0.32) 88%)",
  pointerEvents: "none",
};
const fadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, transparent 78%, var(--v5-surface) 100%)",
  pointerEvents: "none",
};
const ribbonStyle: CSSProperties = {
  top: 0,
  left: "16px",
  padding: "3px 10px 4px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "0 0 6px 6px",
  letterSpacing: "-0.005em",
  zIndex: 2,
  pointerEvents: "none",
};
const tierChipStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.22em",
  color: "rgba(255,255,255,0.88)",
  lineHeight: 1,
  background: "rgba(0,0,0,0.55)",
  padding: "5px 9px",
  borderRadius: "4px",
};
const legacyChipStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning-ink)",
  lineHeight: 1.4,
  background: "rgba(0,0,0,0.55)",
  padding: "3px 8px",
  borderRadius: "4px",
};
const cloudChipStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.22em",
  color: "var(--v5-tech-cyan-ink)",
  lineHeight: 1,
  // 原为硬编码 rgba(255,255,255,0.85):亮色主题下压在浅色媒体区上 ΔE=0 直接隐形,
  // 且违反「颜色用 token 不写字面值」。换成 tech-cyan 软底 —— 与本行 ink 同语义配对,
  // 也是 tech-money-card 既有的 soft+ink 组合,双主题都有定义。
  background: "var(--v5-tech-cyan-soft)",
  padding: "5px 9px",
  borderRadius: "4px",
  fontWeight: 600,
};
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.022em",
  lineHeight: 1.15,
};
const earnEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "var(--v5-warning-ink)",
};
const bigEarnStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  color: "var(--v5-warning-ink)",
  letterSpacing: "-0.022em",
  lineHeight: 1,
};
const stockHintStyle: CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-4)",
  letterSpacing: "-0.005em",
  lineHeight: 1,
  whiteSpace: "nowrap",
};
const tradeinBoxStyle: CSSProperties = {
  padding: "7px 10px",
  background: "var(--v5-brand-soft)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const footerStyle: CSSProperties = {
  padding: "13px 16px",
  background: "var(--v5-surface-2)",
  borderTop: "1px solid var(--v5-border)",
  gridTemplateColumns: "1fr auto",
};
const priceEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "var(--v5-ink-3)",
  lineHeight: 1,
};
const priceRowStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  letterSpacing: "-0.018em",
  lineHeight: 1,
  marginTop: "3px",
  color: "var(--v5-ink)",
};
const buyBtnStyle: CSSProperties = {
  height: "44px",
  padding: "0 18px",
  gap: "6px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
// Locked Buy CTA = muted (soft surface, no brand) when gate blocks purchase.
// 用 surface-3 不用 surface-2 —— 按钮就落在 footerStyle 上,而 footer 本身是 surface-2,
// 同值会让「解锁后购买」整颗按钮隐形(双主题实测 ΔE=0)。muted 的本意是弱化,不是消失。
const buyBtnDynStyle = computed<CSSProperties>(() =>
  gate.value.blocked
    ? { ...buyBtnStyle, background: "var(--v5-surface-3)", color: "var(--v5-ink-3)" }
    : buyBtnStyle,
);
const gateBoxStyle: CSSProperties = {
  padding: "8px 10px",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  borderRadius: "10px",
};
const gateToggleBaseStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  color: "var(--v5-warning-ink)",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  transition: "transform 160ms ease",
};
const gateToggleStyle = computed<CSSProperties>(() => ({
  ...gateToggleBaseStyle,
  transform: gateDetailsOpen.value ? "rotate(180deg)" : "rotate(0deg)",
}));
const gateEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-warning-ink)",
  letterSpacing: "0.02em",
};
const gateCondStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  background: "var(--v5-surface-2)",
  padding: "2px 8px",
  borderRadius: "6px",
};
const gateMetaStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
</script>
