<!--
  Hardware Quota — ported from Nexion-prototype/app/(main)/team/quota/page.tsx.
  Higher tiers (UVELBox Pro / Rack P1) gated behind activated-direct-invite /
  team-volume milestones. De-carded hero (active-invites count directly on the
  page floor, hairline footer) + 2 QuotaTierCards (whitelist tier cards, fill
  no border) + invite CTA (tint fill, border dropped) → /team. Sub-page →
  <AppChassis active="team"> w/ back → /team. Reuses network + v-rank stores.
  useMemo → computed. condition `kind` flag replaces locale string-match.
  banned hex #11131A → var(--v5-surface). <Link>→<view @click>.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader :back="focusedProductId ? `/pages/store/detail?id=${encodeURIComponent(focusedProductId)}` : '/pages/team/team'" :title="t.quota.pageTitle" />

      <!-- 🔴 zentao #246:请求聚焦的商品不在配额档位里时**明说** ——
           静默展示无关档位,正是「查看解锁条件跳到另一商品的配额页」的成因。 -->
      <view v-if="!focusedTierPresent" class="px-4" style="padding-top: 14px">
        <text class="block" :style="heroCapStyle">{{ focusedProductName }}</text>
        <text class="block" :style="focusedMissingStyle" role="note">{{ t.quota.focusedTierMissing }}</text>
        <view class="inline-flex items-center justify-center active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="go(focusedProductHref)" @keydown.enter.prevent="go(focusedProductHref)" @keydown.space.prevent="go(focusedProductHref)">
          <text>{{ t.store.gateLockedCta }}</text>
        </view>
      </view>

      <view v-else class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 18px">
        <!-- Hero — de-carded: invites count sits directly on the page floor.
             The bordered card + page-floor radial glow were deleted outright
             (owner call 2026-07-08: floor auras are removed, not re-tuned). -->
        <view :style="heroStyle">
          <view class="flex items-start justify-between">
            <view>
              <text class="block font-mono-tabular" :style="heroCapStyle">{{ t.quota.yourInvites }}</text>
              <view class="flex items-baseline" style="margin-top: 8px; gap: 6px">
                <text class="font-display tabular-nums" :style="heroBigStyle">{{ activeDirectText }}</text>
                <text class="font-mono-tabular" :style="heroSuffixStyle">{{ remoteApiEnabled && !remoteSnapshot ? "—" : fmt(t.quota.totalSuffix, { n: directInvites }) }}</text>
              </view>
            </view>
            <view class="rounded-2xl grid place-items-center" :style="heroIconStyle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </view>
          </view>
        </view>

        <view v-if="remoteApiEnabled && remoteError" class="rounded-2xl" :style="remoteErrorStyle">
          <view class="flex items-center justify-between" style="gap: 12px">
            <text :style="{ color: 'var(--v5-warning)', fontSize: '12px' }">{{ remoteError }}</text>
            <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshRemoteQuota">
              <text>{{ t.store.catalogRetry }}</text>
            </view>
          </view>
        </view>

        <view v-if="remoteApiEnabled && productCatalogState.status !== 'ready'" class="rounded-2xl" :style="remoteErrorStyle">
          <text>{{ productCatalogState.status === 'error' ? t.store.catalogErrorTitle : t.store.catalogLoadingTitle }}</text>
          <view v-if="productCatalogState.status === 'error'" :style="retryBtnStyle" role="button" tabindex="0" @click="retryCatalog" @keydown.enter.prevent="retryCatalog" @keydown.space.prevent="retryCatalog">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>

        <!-- Tier cards -->
        <QuotaTierCard v-for="tier in focusedTiers" :key="tier.productId" :tier="tier" @navigate="go" />

        <!-- Invite CTA -->
        <view class="rounded-2xl active:scale-[0.98] transition-transform" :style="inviteCtaStyle" @click="go('/pages/team/team')">
          <view class="flex items-center" style="gap: 12px">
            <view class="rounded-xl grid place-items-center" :style="inviteIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" :style="inviteTitleStyle">{{ t.quota.inviteFriendsTitle }}</text>
              <text class="block" :style="inviteHintStyle">{{ inviteHint }}</text>
            </view>
            <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">{{ t.quota.shareTag }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo, takeNavigationQuery } from "@/lib/route";
import { computed, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import QuotaTierCard, { type QuotaTier, type QuotaCondition } from "@/components/team/quota-tier-card.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { remoteApiEnabled, teamQuotaApi } from "@/api/runtime";
import type { TeamQuotaSnapshot } from "@/api/team-quota-api";
import { getProduct as getMockProduct, annualRoiPct as mockAnnualRoiPct, type Product } from "@/mock/products";
import { productCatalogPresentation, productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { specText } from "@/lib/product-copy";
import { useNetwork } from "@/store/network";
import { useVRank } from "@/store/v-rank";
import { useConfig } from "@/store/config";
import { useApp } from "@/store/app";
import { isCurrentTeamP31718Request, type TeamP31718Request } from "@/lib/team-p3-17-18-request-scope";
import { isAnnualizedQuotaPerk } from "@/lib/quota-perk";

const t = useT();
const network = useNetwork();
const vRank = useVRank();
const cfg = useConfig();
const app = useApp();
const remoteSnapshot = ref<TeamQuotaSnapshot | null>(null);
const remoteError = ref<string | null>(null);
const remoteRefreshing = ref(false);
let quotaMounted = true;
let quotaRequestGeneration = 0;
function captureQuotaRequest(): TeamP31718Request {
  return {
    accountKey: app.accountKey,
    accountEpoch: app.accountBindingEpoch,
    generation: quotaRequestGeneration,
  };
}
function quotaRequestIsCurrent(request: TeamP31718Request): boolean {
  return isCurrentTeamP31718Request(request, {
    mounted: quotaMounted,
    accountKey: app.accountKey,
    accountEpoch: app.accountBindingEpoch,
    generation: quotaRequestGeneration,
  });
}
function resetQuotaPageState(): void {
  quotaRequestGeneration += 1;
  remoteSnapshot.value = null;
  remoteError.value = null;
  remoteRefreshing.value = false;
}
async function refreshRemoteQuota() {
  if (remoteRefreshing.value) return;
  const request = captureQuotaRequest();
  remoteRefreshing.value = true;
  remoteError.value = null;
  remoteSnapshot.value = null;
  try {
    const value = await teamQuotaApi.snapshot();
    if (quotaRequestIsCurrent(request)) remoteSnapshot.value = value;
  } catch {
    if (quotaRequestIsCurrent(request)) remoteError.value = t.value.authOtp.errorServiceUnavailable;
  } finally {
    if (quotaRequestIsCurrent(request)) remoteRefreshing.value = false;
  }
}
watch([() => app.accountKey, () => app.accountBindingEpoch], () => {
  resetQuotaPageState();
  if (quotaMounted && remoteApiEnabled && app.accountKey !== "default") {
    void refreshProductCatalog(true);
    void refreshRemoteQuota();
  }
});
onLoad((options) => {
  const fallback = new URLSearchParams(takeNavigationQuery("/pages/team/quota")).get("product");
  const requested = typeof options?.product === "string" ? options.product.trim() : fallback?.trim() ?? "";
  focusedProductId.value = requested.slice(0, 64);
});

onShow(() => {
  quotaMounted = true;
  resetQuotaPageState();
  // The tier cards render catalog-owned names/perks (BUG 34/33), so the
  // catalog must be observed here too — a direct entry never visits the store.
  void refreshProductCatalog();
  if (remoteApiEnabled) void refreshRemoteQuota();
});
onHide(() => {
  quotaMounted = false;
  resetQuotaPageState();
});
onUnload(() => {
  quotaMounted = false;
  resetQuotaPageState();
});
function retryCatalog(): void {
  void refreshProductCatalog(true);
}
// 礼包 NEX 数量单源派生自 platform config。
const inviteHint = computed(() => remoteApiEnabled ? "—" : fmt(t.value.quota.inviteFriendsHint, { inviterNex: cfg.config.rewards.inviterReward.nexAmount, nex: cfg.config.rewards.welcomeGift.nexAmount }));

const members = computed(() => network.members);
const directInvites = computed(() => remoteApiEnabled ? remoteSnapshot.value?.facts.directInvites ?? "—" : members.value.filter((m) => m.layer === 1).length);
const activeDirect = computed(() => remoteApiEnabled ? remoteSnapshot.value?.facts.activeDirect ?? 0 : members.value.filter((m) => m.layer === 1 && m.status === "active").length);
const activeDirectText = computed(() => remoteApiEnabled && !remoteSnapshot.value ? "—" : String(activeDirect.value));

// Single source: tiers derive from the catalog products that carry a
// purchaseGate (name/price/锁额/解锁条件/perks all from getProduct + gate config,
// with live progress from network/v-rank). No hardcoded device economics here —
// the page mirrors §4 PurchaseGate + the store catalog (fixes stale $899/$3,499/
// "800-1,100 NEX/day" that drifted out of sync with the recalibrated catalog).
/**
 * 🔴 zentao #246:从商品详情页点「查看解锁条件」时带过来的商品 id。
 *
 * 此前详情页硬编码跳到 `/pages/team/quota`,而配额页只列**它自己的**档位 ——
 * 用户在看 Pro v2,跳过来看到的却是另一件商品的配额,即「查看解锁条件」指向了别人的条件。
 * 现在带上 id 并据此定位;若该商品根本不在配额档位里,页面**明说**,而不是静默展示无关档位。
 */
const focusedProductId = ref("");
const focusedProductHref = computed(() => `/pages/store/detail?id=${encodeURIComponent(focusedProductId.value)}`);
const focusedProductName = computed(() => catalogProduct(focusedProductId.value)?.name ?? focusedProductId.value);

function buildTier(productId: string, tint: string): QuotaTier | null {
  const p = getMockProduct(productId);
  const g = p?.purchaseGate;
  if (!p || !g) return null;
  const conditions: QuotaCondition[] = [];
  if (g.rankMin != null)
    conditions.push({ label: fmt(t.value.quota.condRank, { v: g.rankMin }), current: vRank.myRank, required: g.rankMin, kind: "invites" });
  if (g.activeDirectMin != null)
    conditions.push({ label: t.value.quota.condActivatedDirect, current: activeDirect.value, required: g.activeDirectMin, kind: "invites" });
  if (g.teamVolumeMin != null)
    conditions.push({ label: t.value.quota.condTeamVol, current: vRank.teamVolumeUSD, required: g.teamVolumeMin, kind: "volume" });
  return {
    productId,
    name: p.name,
    price: p.price,
    monthlyStock: g.quotaCap ?? 0,
    soldThisMonth: g.quotaSold ?? 0,
    unlockKind: g.mode,
    conditions,
    perks: [
      fmt(t.value.quota.perkGen, { n: p.dailyEarnNEX }),
      `${specText(t.value, p.gpu, "-")} · ${specText(t.value, p.vram, "-")}`,
    ],
    roiBasis: p.productType === "SHARE" ? undefined : { dailyEarn: p.dailyEarn, price: p.price, roi: mockAnnualRoiPct(p) },
    tint,
  };
}

// BUG 34/33: quota rows carry their own display_name/perk strings, which drift
// from the live catalog the store renders ("UVELBox Pro" vs the catalog's
// "StellarBox Pro"; raw "80.000000 NEX/day"). The catalog is the single naming
// and economics source — the server already refuses a quota snapshot whose
// productNo is missing from it (AppTeamQuotaService → TEAM_QUOTA_CATALOG_NOT_READY)
// — so the card renders catalog facts and only falls back to the server row
// while the catalog read has not landed.
function catalogProduct(productId: string): Product | undefined {
  if (productCatalogState.status !== "ready") return undefined;
  return productCatalogPresentation.value?.products.find((p) => p.id === productId);
}
function catalogProductName(productId: string, fallback: string): string {
  return catalogProduct(productId)?.name ?? fallback;
}
function catalogProductPerks(productId: string, fallback: readonly string[]): string[] {
  const p = catalogProduct(productId);
  if (!p) return fallback.filter((perk) => !isAnnualizedQuotaPerk(perk)).map(quotaPerkText);
  // Annualized output is rendered only with its complete calculation basis.
  return [
    fmt(t.value.quota.perkGen, { n: p.dailyEarnNEX }),
    `${specText(t.value, p.gpu, "-")} · ${specText(t.value, p.vram, "-")}`,
  ];
}
/**
 * 年化 ROI 的推导输入,与上面那条 perk 文案**同源同算**(都走 annualRoiPct),
 * 所以页面上的比例与列出的算式不可能各说各话。
 */
function catalogProductRoiBasis(productId: string): QuotaTier["roiBasis"] {
  const p = catalogProduct(productId);
  if (!p || p.productType === "SHARE") return undefined;
  return { dailyEarn: p.dailyEarn, price: p.price, roi: mockAnnualRoiPct(p), revision: productCatalogPresentation.value?.revision };
}

// The server row's perk strings are unlocalized and carry the raw column scale
// ("80.000000 NEX/day"). Until the catalog read lands they are the only facts
// available, so render them through the same localized, trailing-zero-free
// line the catalog path uses (BUG 33) instead of printing the raw column.
const QUOTA_PERK_GEN = /^(\d+(?:\.\d+)?)\s*NEX\s*\/\s*day$/i;
function quotaPerkText(perk: string): string {
  const match = QUOTA_PERK_GEN.exec(perk.trim());
  if (!match) return perk;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return perk;
  return fmt(t.value.quota.perkGen, { n: amount });
}

/** 请求聚焦的商品是否确实在配额档位里(空 id = 未指定,不提示)。 */
const focusedTierPresent = computed(() =>
  !focusedProductId.value || (remoteApiEnabled && !remoteSnapshot.value)
  || (remoteApiEnabled && productCatalogState.status !== "ready")
  || tiers.value.some((tier) => tier.productId === focusedProductId.value));
const focusedTiers = computed(() => focusedProductId.value
  ? tiers.value.filter((tier) => tier.productId === focusedProductId.value) : tiers.value);

const tiers = computed<QuotaTier[]>(() =>
  remoteApiEnabled
    ? (productCatalogState.status !== "ready" ? [] : remoteSnapshot.value?.tiers ?? []).map((tier, index) => ({
      productId: tier.productId, name: catalogProductName(tier.productId, tier.name), price: catalogProduct(tier.productId)?.price ?? tier.price,
      monthlyStock: tier.monthlyStock, soldThisMonth: tier.soldThisMonth,
      available: tier.available,
      unlockKind: tier.unlockKind === "EITHER" ? "either" : "all",
      conditions: tier.conditions.map((condition) => ({
        label: condition.kind === "teamVolume" ? t.value.quota.condTeamVol
          : condition.kind === "rank" ? fmt(t.value.quota.condRank, { v: condition.required })
          : t.value.quota.condActivatedDirect,
        current: condition.current, required: condition.required,
        kind: condition.kind === "teamVolume" ? "volume" : "invites",
      })), perks: catalogProductPerks(tier.productId, tier.perks),
      roiBasis: catalogProductRoiBasis(tier.productId), tint: index % 2 ? "var(--v5-warning)" : "var(--v5-brand)",
    }))
    : [buildTier("stellarbox-pro", "var(--v5-brand)"), buildTier("stellarrack-p1", "var(--v5-warning)")].filter(
      (x): x is QuotaTier => x !== null,
    ),
);

function go(url: string) {
  navTo(url);
}

// ─── styles ───
// De-carded hero: no surface/border/glow — content sits directly on the page
// floor (leaderboard prize-hero idiom, 2px optical inset).
const focusedMissingStyle: CSSProperties = {
  fontSize: "12px",
  lineHeight: 1.5,
  color: "var(--v5-ink-3)",
};

const heroStyle: CSSProperties = { padding: "6px 2px 0" };
const heroIconStyle: CSSProperties = { width: "48px", height: "48px", background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)" };
const heroCapStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "var(--v5-brand-2)", letterSpacing: "0.06em" };
const heroBigStyle: CSSProperties = { fontSize: "34px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--v5-ink)" };
const heroSuffixStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
// -2px side margins pull the hairline back to full width (hero has a 2px optical inset).
const heroFooterStyle: CSSProperties = { margin: "12px -2px 0", padding: "12px 2px 0", borderTop: "1px solid var(--v5-border)" };
const heroBodyStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  // SKILL leading-relaxed = 1.625 (原版 .text-[12px] leading-relaxed; was 1.6)
  lineHeight: 1.625,
};

// Conversion entry — tint fill only, border dropped (filled no border: single
// visual difference).
const inviteCtaStyle: CSSProperties = {
  padding: "16px",
  background: "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
};
const inviteIconStyle: CSSProperties = { width: "40px", height: "40px", background: "color-mix(in srgb, var(--v5-brand) 20%, transparent)" };
const inviteTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const inviteHintStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
const remoteErrorStyle: CSSProperties = { padding: "10px 12px", background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)" };
const retryBtnStyle: CSSProperties = { minHeight: "32px", padding: "0 10px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink)", fontSize: "12px" };
</script>
