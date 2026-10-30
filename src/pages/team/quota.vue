<template>
  <AppChassis active="team">
    <view class="quota-page">
      <SubPageHeader :back="conditionsOnly ? '/pages/me/devices' : focusedProductId ? `/pages/store/detail?id=${encodeURIComponent(focusedProductId)}` : '/pages/team/team'" :title="conditionsOnly ? t.store.purchaseEligibilityProductPolicy : t.quota.pageTitle" plain design />
      <view v-if="conditionsOnly" class="quota-content">
        <text class="quota-headline">{{ focusedProductName }}</text>
        <PurchaseEligibilityPanel :status="conditionEligibility.status" :snapshot="conditionEligibility.snapshot" />
        <NxButton variant="secondary" :label="t.store.purchaseEligibilityRetry" :busy="conditionEligibility.status === 'loading'" @click="retryConditionEligibility" />
      </view>
      <view v-else-if="!focusedTierPresent" class="quota-content quota-state">
        <text class="quota-headline">{{ focusedProductName }}</text>
        <text class="quota-body" role="note">{{ t.quota.focusedTierMissing }}</text>
        <NxButton variant="secondary" :label="t.store.gateLockedCta" @click="go(focusedProductHref)"><text>{{ t.store.gateLockedCta }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
      </view>
      <view v-else class="quota-content">
        <view class="quota-hero">
          <view v-if="heroTier && focusedProductId" class="quota-hero__main"><view class="quota-hero__copy"><text class="quota-headline">{{ heroTier.name }}</text><text v-if="heroTier" class="quota-hero__price">{{ fmt(t.quota.priceLine, { price: formatFinanceAmount(heroTier.price) }) }}</text></view><image v-if="heroImage" :src="heroImage" mode="aspectFit" class="quota-hero__image" :alt="heroTier?.name" /><TeamArt v-else kind="members" :size="112" /></view>
          <view class="quota-invite-count"><text>{{ t.quota.yourInvites }}</text><view><text class="quota-invite-count__number nx-num-metric">{{ visibility.mask(activeDirectText) }}</text><text class="quota-caption">{{ remoteApiEnabled && !remoteSnapshot ? visibility.mask('—') : fmt(t.quota.totalSuffix, { n: visibility.mask(directInvites) }) }}</text></view></view>
          <text class="quota-body">{{ t.quota.heroBody }}</text>
        </view>

        <view v-if="remoteApiEnabled && remoteError" class="quota-state nx-inline-recovery" role="alert"><text class="quota-body nx-inline-recovery__copy">{{ auditCopy.quotaLoadError }}</text><NxButton class="nx-inline-recovery__action" variant="text" :label="t.store.catalogRetry" :busy="remoteRefreshing" @click="refreshRemoteQuota" /></view>
        <view v-else-if="remoteApiEnabled && !remoteSnapshot" class="quota-state" role="status" aria-live="polite" aria-busy="true"><text>{{ auditCopy.loading }}</text></view>
        <view v-if="remoteApiEnabled && (!catalogDisplayReady || productCatalogState.status === 'error')" class="quota-state" :class="{ 'nx-inline-recovery': productCatalogState.status === 'error' }" :role="productCatalogState.status === 'error' ? 'alert' : 'status'">
          <text class="quota-body nx-inline-recovery__copy">{{ productCatalogState.status === 'error' ? t.store.catalogErrorTitle : t.store.catalogLoadingTitle }}</text>
          <NxButton v-if="productCatalogState.status === 'error'" class="nx-inline-recovery__action" variant="text" :label="t.store.catalogRetry" @click="retryCatalog" />
        </view>
        <view v-if="quotaReady && !focusedTiers.length" class="quota-state" role="status"><text>{{ t.empty.listTitle }}</text></view>
        <QuotaTierCard v-for="tier in focusedTiers" :key="tier.productId" :tier="tier" :pending="remoteApiEnabled && !remoteSnapshot" :action-blocked="!quotaReady" @navigate="go" />

        <view class="quota-footer">
          <NxButton variant="secondary" :label="t.empty.devicesCta" @click="go('/pages/store/store')"><text>{{ t.empty.devicesCta }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
          <view class="quota-route" role="link" tabindex="0" @click="go('/pages/team/rank')" @keydown.enter.prevent="go('/pages/team/rank')" @keydown.space.prevent="go('/pages/team/rank')"><text>{{ t.rank.conditionsLabel }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></view>
          <view class="quota-route" role="link" tabindex="0" @click="go('/pages/team/team?intent=share')" @keydown.enter.prevent="go('/pages/team/team?intent=share')" @keydown.space.prevent="go('/pages/team/team?intent=share')"><view><text>{{ t.quota.inviteFriendsTitle }}</text><text v-if="!remoteApiEnabled" class="quota-caption">{{ inviteHint }}</text></view><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { formatAmount } from "@/lib/amount-display";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { navTo, takeNavigationQuery } from "@/lib/route";
import { computed, ref, watch } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NxButton from '@/components/ui/nx-button.vue';
import TeamArt from '@/components/team/team-art.vue';
import { getProductMedia } from '@/lib/product-media';
import QuotaTierCard, { type QuotaTier, type QuotaCondition } from "@/components/team/quota-tier-card.vue";
import PurchaseEligibilityPanel from "@/components/store/purchase-eligibility-panel.vue";
import { useRemotePurchaseEligibility } from "@/store/purchase-eligibility";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { fmt } from "@/i18n/format";
import { remoteApiEnabled, teamQuotaApi, apiRuntimeConfig } from "@/api/runtime";
import { subscribeRuntimeRevision } from "@/api/order-api";
import type { TeamQuotaSnapshot } from "@/api/team-quota-api";
import { getProduct as getMockProduct, annualRoiPct as mockAnnualRoiPct, type Product } from "@/mock/products";
import { productCatalogPresentation, productCatalogDisplayProof, isProductCatalogDisplayCurrent, productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { specText } from "@/lib/product-copy";
import { useNetwork } from "@/store/network";
import { useVRank } from "@/store/v-rank";
import { useConfig } from "@/store/config";
import { useApp } from "@/store/app";
import { isCurrentTeamP31718Request, type TeamP31718Request } from "@/lib/team-p3-17-18-request-scope";
import { isAnnualizedQuotaPerk } from "@/lib/quota-perk";

const t = useT();
const visibility = useDataVisibility();
const locale = useLocaleStore();
const auditCopy = computed(() => networkReauditCopy(locale.code));
const network = useNetwork();
const vRank = useVRank();
const cfg = useConfig();
const app = useApp();
const remoteSnapshot = ref<TeamQuotaSnapshot | null>(null);
const remoteError = ref<string | null>(null);
const remoteRefreshing = ref(false);
// A retained catalog proof permits presentation only; it never enables actions.
const catalogDisplayReady = computed(() => isProductCatalogDisplayCurrent() && productCatalogPresentation.value !== null);
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
  try {
    const value = await teamQuotaApi.snapshot();
    if (quotaRequestIsCurrent(request)) remoteSnapshot.value = value;
  } catch {
    if (quotaRequestIsCurrent(request)) remoteError.value = auditCopy.value.quotaLoadError;
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
watch(() => locale.code, () => {
  resetQuotaPageState();
  if (quotaMounted && remoteApiEnabled) void refreshRemoteQuota();
}, { flush: 'sync' });
onLoad((options) => {
  const query = new URLSearchParams(takeNavigationQuery("/pages/team/quota"));
  const fallback = query.get("product");
  const requested = typeof options?.product === "string" ? options.product.trim() : fallback?.trim() ?? "";
  focusedProductId.value = requested.slice(0, 64);
  conditionsOnly.value = (options?.intent ?? query.get("intent")) === "tradein-conditions";
});

onShow(() => {
  quotaMounted = true;
  // The tier cards render catalog-owned names/perks (BUG 34/33), so the
  // catalog must be observed here too — a direct entry never visits the store.
  void refreshProductCatalog();
  if (remoteApiEnabled) {
    if (conditionsOnly.value) void retryConditionEligibility();
    else void refreshRemoteQuota();
  }
});
onHide(() => {
  quotaMounted = false;
  quotaRequestGeneration += 1;
  remoteRefreshing.value = false;
});
onUnload(() => {
  quotaMounted = false;
  stopQuotaRuntime();
  resetQuotaPageState();
});
function retryCatalog(): void {
  void refreshProductCatalog(true);
}
// 礼包 NEX 数量单源派生自 platform config。
const inviteHint = computed(() => remoteApiEnabled ? "—" : fmt(t.value.quota.inviteFriendsHint, { inviterNex: formatAmount(cfg.config.rewards.inviterReward.nexAmount), nex: formatAmount(cfg.config.rewards.welcomeGift.nexAmount) }));

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
const conditionsOnly = ref(false);
const { eligibility: conditionEligibility, retry: retryConditionEligibility } = useRemotePurchaseEligibility(
  focusedProductId, () => conditionsOnly.value,
);
// Clear synchronously, including A→B→A, before a scheduled account read can run.
watch([() => app.accountKey, () => app.accountBindingEpoch,
  () => apiRuntimeConfig.environment, () => apiRuntimeConfig.baseUrl, focusedProductId], resetQuotaPageState, { flush: 'sync' });
watch(() => productCatalogDisplayProof.value && JSON.stringify([
  productCatalogDisplayProof.value.bindingEpoch, productCatalogDisplayProof.value.revision,
]), (proof, previous) => {
  if (previous && proof !== previous) resetQuotaPageState();
  if (proof && proof !== previous && quotaMounted && remoteApiEnabled && !remoteSnapshot.value) void refreshRemoteQuota();
}, { flush: 'sync' });
const stopQuotaRuntime = subscribeRuntimeRevision(scope => {
  if (!isProductCatalogDisplayCurrent(scope)) resetQuotaPageState();
});
const focusedProductHref = computed(() => `/pages/store/detail?id=${encodeURIComponent(focusedProductId.value)}`);
const focusedProductName = computed(() => catalogProduct(focusedProductId.value)?.name ?? focusedProductId.value);

function buildTier(productId: string, tint: string): QuotaTier | null {
  const p = getMockProduct(productId);
  const g = p?.purchaseGate;
  if (!p || !g) return null;
  const conditions: QuotaCondition[] = [];
  if (g.rankMin != null && g.rankMin > 0)
    conditions.push({ label: fmt(t.value.quota.condRank, { v: g.rankMin }), current: vRank.myRank, required: g.rankMin, kind: "invites" });
  if (g.activeDirectMin != null && g.activeDirectMin > 0)
    conditions.push({ label: t.value.quota.condActivatedDirect, current: activeDirect.value, required: g.activeDirectMin, kind: "invites" });
  if (g.teamComputePointsMin != null && g.teamComputePointsMin > 0)
    conditions.push({ label: t.value.quota.condTeamVol, current: vRank.teamComputePoints ?? 0, required: g.teamComputePointsMin, kind: "volume" });
  return {
    productId,
    imageUrl: p.imageUrl,
    name: p.name,
    price: p.price,
    monthlyStock: g.quotaCap ?? 0,
    soldThisMonth: g.quotaSold ?? 0,
    unlockKind: g.mode,
    conditions,
    perks: [
      fmt(auditCopy.value.estimatedDaily, { n: formatAmount(p.dailyEarnNEX) }),
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
  if (!catalogDisplayReady.value) return undefined;
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
    fmt(auditCopy.value.estimatedDaily, { n: formatAmount(p.dailyEarnNEX) }),
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
// available, so render them through the same localized, two-decimal
// line the catalog path uses (BUG 33) instead of printing the raw column.
const QUOTA_PERK_GEN = /^(\d+(?:\.\d+)?)\s*(?:NEX|UVT)\s*\/\s*day$/i;
function quotaPerkText(perk: string): string {
  const match = QUOTA_PERK_GEN.exec(perk.trim());
  if (!match) return perk;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return perk;
  return fmt(auditCopy.value.estimatedDaily, { n: formatAmount(match[1]) });
}

/** 请求聚焦的商品是否确实在配额档位里(空 id = 未指定,不提示)。 */
const focusedTierPresent = computed(() =>
  !focusedProductId.value || (remoteApiEnabled && !remoteSnapshot.value)
  || (remoteApiEnabled && !catalogDisplayReady.value)
  || tiers.value.some((tier) => tier.productId === focusedProductId.value));
const focusedTiers = computed(() => focusedProductId.value
  ? tiers.value.filter((tier) => tier.productId === focusedProductId.value) : tiers.value);

const tiers = computed<QuotaTier[]>(() =>
  remoteApiEnabled
    ? (!catalogDisplayReady.value ? [] : remoteSnapshot.value?.tiers ?? []).map((tier, index) => ({
      productId: tier.productId, imageUrl: catalogProduct(tier.productId)?.imageUrl, name: catalogProductName(tier.productId, tier.name), price: catalogProduct(tier.productId)?.price ?? tier.price,
      monthlyStock: tier.monthlyStock, soldThisMonth: tier.soldThisMonth,
      available: tier.available,
      unlockKind: tier.unlockKind === "EITHER" ? "either" : "all",
      conditions: tier.conditions.map((condition) => ({
        label: condition.kind === "teamComputePoints" ? t.value.quota.condTeamVol
          : condition.kind === "rank" ? fmt(t.value.quota.condRank, { v: condition.required })
          : t.value.quota.condActivatedDirect,
        current: condition.current, required: condition.required,
        kind: condition.kind === "teamComputePoints" ? "volume" : "invites",
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

const heroTier = computed(() => focusedTiers.value[0]);
const heroImage = computed(() => heroTier.value ? getProductMedia(heroTier.value.productId)?.src ?? heroTier.value.imageUrl : undefined);
const quotaReady = computed(() => !remoteApiEnabled || (catalogDisplayReady.value && remoteSnapshot.value !== null && !remoteRefreshing.value && !remoteError.value && productCatalogState.status === 'ready'));
</script>

<style scoped>
.quota-page { color:var(--v5-ink);padding-bottom:28px; }.quota-content { padding:12px 20px 0; }
.quota-hero { padding:var(--ui-space-inline) 0 26px;border-bottom:1px solid var(--v5-border); }.quota-hero__main { display:flex;align-items:center;gap:8px; }.quota-hero__copy { flex:1;min-width:0; }
.quota-eyebrow { display:block;margin-bottom:var(--ui-space-row-y);font:400 12px/1.5 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }.quota-headline { display:block;font:600 var(--ui-type-page-title)/var(--ui-type-page-title-lh) var(--font-v5);letter-spacing:-.02em;overflow-wrap:anywhere; }.quota-hero__price { display:block;margin-top:var(--ui-space-row-y);font:500 var(--ui-type-profile)/var(--ui-type-profile-lh) var(--font-v5); }
.quota-hero__image { flex:none;width:42%;height:128px;object-fit:contain; }.quota-invite-count { display:flex;justify-content:space-between;align-items:center;gap:var(--ui-space-inset);margin:18px 0;font:400 var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5);color:var(--v5-ink-2); }.quota-invite-count > view { display:flex;align-items:baseline;gap:8px;flex-wrap:wrap; }.quota-invite-count__number { font:600 var(--ui-type-wallet-amount)/var(--ui-type-wallet-amount-lh) var(--font-v5);color:var(--v5-ink); }
.quota-body { display:block;margin-top:8px;font:400 var(--ui-type-list-subtitle)/1.7 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }.quota-caption { display:block;font:400 12px/1.6 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.quota-state { padding-block:28px;display:flex;flex-direction:column;gap:var(--ui-space-inset); }.quota-footer { margin-top:28px; }.quota-footer > :deep(.nx-button) { width:100%;box-sizing:border-box; }
.quota-state.nx-inline-recovery { display:grid; align-items:center; gap:12px; }
.quota-route { display:flex;justify-content:space-between;align-items:center;gap:14px;padding:var(--ui-space-inset) 0;min-height:44px;font:500 var(--ui-type-list-subtitle)/1.6 var(--font-v5);color:var(--v5-ink-2);cursor:pointer; }.quota-route + .quota-route { border-top:1px solid var(--v5-border); }.quota-route > view { flex:1;min-width:0;overflow-wrap:anywhere; }.quota-route svg { flex:none; }.quota-route:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
/* Tiers are separate sections; conditions remain inside their owning product. */
.quota-content :deep(.quota-tier) { padding: 26px 0; margin: 0; background: transparent; border: 0; border-bottom: 1px solid var(--v5-border); border-radius: 0; }
.quota-content :deep(.quota-product__name) { font-size: var(--ui-type-subheading); line-height: var(--ui-type-subheading-lh); }
.quota-content :deep(.quota-product__price) { font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); }
.quota-content :deep(.quota-product__qualification) { font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); }
.quota-content :deep(.quota-product__image) { width: 64px; height: 72px; }
.quota-content :deep(.quota-section-label) { font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; }
.quota-content :deep(.quota-conditions) { padding-top: 18px; border-top: 1px solid var(--v5-border); }
.quota-invite-count { align-items: flex-start; margin-top: 8px; }
.quota-invite-count > view { justify-content: flex-end; text-align: right; max-width: 58%; overflow-wrap: anywhere; }
.quota-invite-count > text { padding-top: 8px; flex: 1; }
@media(max-width:374px) { .quota-content { padding-inline:16px; } .quota-hero__image { height:112px; } }
</style>
