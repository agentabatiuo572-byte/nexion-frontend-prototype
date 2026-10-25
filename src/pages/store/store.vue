<!-- Live catalogue, voucher benefits and upgrade recommendations; pricing and eligibility remain store-owned. -->
<template>
  <AppChassis active="store">
    <CardStagger class="store-content">
      <view v-if="activityId" class="promotion store-promotion-scope" data-testid="store-promotion-scope">
        <view class="store-promotion-actions">
          <text v-if="activity" class="promotion-badge">{{ t.promotion.activityProducts }}</text>
          <view class="promotion-link" role="button" tabindex="0" @click="clearPromotion"><text>{{ activity?t.promotion.scopeClear:t.promotion.allProducts }}</text></view>
        </view>
        <text class="promotion-title">{{ activity ? localized(activity.title,locale.code) : promotionStatus==='ready'?t.promotion.disabled:promotionStatus==='error'?t.promotion.error:t.promotion.loading }}</text>
        <text v-if="promotionStatus==='loading'||promotionStatus==='idle'" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
        <view v-else-if="promotionStatus==='error'" role="alert"><text class="promotion-copy">{{ t.promotion.errorNote }}</text><view class="promotion-link" role="button" tabindex="0" @click="refreshPromotion"><text>{{ t.promotion.retry }}</text></view></view>
        <text v-else-if="activity&&!promotionAvailable" class="promotion-copy">{{ localized(activity.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
        <text v-else-if="activity" class="promotion-copy">{{ t.promotion.promoSub }}</text>
        <view v-if="activity && promotionAvailable && unlockedProducts.filter(p=>p.productType!=='SHARE').length>=2" class="promotion-link" role="button" tabindex="0" @click="navTo(promotionBundleHref(activityId))"><text>{{ t.promotion.bundle }}</text></view>
      </view>
      <template v-else-if="!publicOnly">
        <view v-if="voucherContext.voucherId" class="promotion promotion-flat"><text class="promotion-title">{{ t.promotion.eventVoucher }}</text><text class="promotion-copy">{{ t.promotion.eventVoucherTerms }}</text><view class="promotion-link" role="button" tabindex="0" @click="clearPromotion" @keydown.enter.prevent="clearPromotion" @keydown.space.prevent="clearPromotion"><text>{{ t.promotion.scopeClear }}</text></view></view>
        <view v-if="voucherOffers.length&&!voucherContext.voucherId" class="store-voucher-ticket" data-testid="store-voucher-ticket" role="button" tabindex="0" @click="openStoreVouchers" @keydown.enter.prevent="openStoreVouchers" @keydown.space.prevent="openStoreVouchers">
          <view class="store-voucher-ticket__value"><text v-if="voucherBenefit.amount != null" class="store-voucher-ticket__currency">$</text><text>{{ voucherBenefit.amount != null ? fmtMoney(voucherBenefit.amount).replace(/^\$/, '').replace(/\.00$/, '') : voucherBenefit.percent != null ? voucherBenefit.percent + '%' : '–' }}</text></view>
          <view class="store-voucher-ticket__rule" aria-hidden="true" />
          <view class="store-voucher-ticket__copy"><text class="store-voucher-ticket__title">{{ auditCopy.voucherShort }} · {{ fmt(auditCopy.voucherShortCount,{n:voucherOffers.length}) }}</text><view class="store-voucher-ticket__hint"><view>{{ voucherBenefit.amount != null ? auditCopy.upToOff : auditCopy.voucherDiscount }}</view><view>{{ voucherClaimable.length ? auditCopy.claimToUse : auditCopy.autoApplyVoucher }}</view></view></view>
          <image class="store-voucher-ticket__art" src="/static/img/home-glass-20260928/coupon.webp" mode="aspectFit" aria-hidden="true" />
        </view>
        <PromotionEntry v-if="!voucherContext.voucherId" class="store-campaign" mode="home" />
        <UpgradeSpotlight v-if="upgrade&&!voucherContext.voucherId" :base="upgrade.base" :base-image-url="upgradeBaseImageUrl" :target="upgrade.target" />
      </template>

      <view v-if="publicOnly" class="promotion" data-testid="promotion-public-store">
        <template v-if="activity"><PromotionProduct v-for="productNo in activity.productNos" :key="productNo" :activity="activity" :product-no="productNo" public-only /></template>
        <view v-if="activity||voucherContext.voucherId" class="promotion-action primary" role="button" tabindex="0" @click="navTo('/pages/login/login?return='+encodeURIComponent(promotionStoreHref(activityId,voucherContext)))"><text>{{ t.promotion.signIn }}</text></view>
      </view>
      <template v-else>

      <!-- Sprint 2 finale — phase + legacy-ownership trade-in window -->


      <!-- Goal-recommendation context (BUG 71). Arriving from an earning goal
           carries `focus`; the card locates the recommended SKU instead of
           silently featuring the generic first product, and names the change
           when the recommendation is no longer purchasable. -->
      <view v-if="focusProductId&&!activityId" data-testid="store-goal-focus" class="rounded-2xl" :style="goalFocusCardStyle">
        <text class="block" :style="goalFocusTitleStyle">{{ t.store.goalFocusTitle }}</text>
        <text class="block mt-1" :style="goalFocusBodyStyle">{{ goalFocusBody }}</text>
        <view v-if="!focusFeatured" class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="goalFocusRetryStyle" @click="retryCatalog">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>

      <!-- Server mode has no seeded purchase inventory. Keep the live catalog
           state visible so a malformed or empty response cannot hide every CTA. -->
      <view class="nx-glass-card" v-if="catalogStatus === 'loading' && !catalogHasProducts" data-testid="store-catalog-loading" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogLoadingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogLoadingBody }}</text>
      </view>
      <view class="nx-glass-card" v-else-if="catalogStatus === 'error' && !catalogHasProducts" data-testid="store-catalog-error" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogErrorTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogErrorBody }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" @click="retryCatalog">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>
      <view class="nx-glass-card" v-if="!activityId && catalogStatus === 'ready' && !catalogHasProducts" data-testid="store-catalog-empty" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogEmptyTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogEmptyBody }}</text>
      </view>
      <view v-if="activity&&promotionStatus==='ready'&&catalogStatus==='ready'&&!unlockedProducts.length" class="promotion-flat"><text class="promotion-copy">{{ t.promotion.noMatchingProducts }}</text><view class="promotion-link" role="button" tabindex="0" @click="clearPromotion"><text>{{ t.promotion.allProducts }}</text></view></view>
      <template v-if="catalogHasProducts">
        <NxSection class="store-catalogue" :title="t.store.allProducts" :meta="String(unlockedProducts.length)" :action="catalogStatus === 'error' ? t.store.catalogRetry : undefined" @action="retryCatalog">
          <view class="store-product-grid">
            <ProductCard v-for="p in catalogProducts" :key="p.id" :product="p" :promotion="activity" :activity-id="activityId" :voucher-context="voucherContext" :promotion-ready="promotionStatus==='ready'" compact />
          </view>
          <text class="store-estimate-note">{{ t.store.cardEstimateNote }}</text>
        </NxSection>
        <NxListGroup v-if="(!activityId && genesisCfg.config.showcaseEnabled) || lockedProducts.length" class="store-more">
          <NxListRow v-if="!activityId && genesisCfg.config.showcaseEnabled" :title="t.store.secGenesis" :subtitle="t.store.genesisCardPerks" :value="genesisCfg.config.marketOpenState === 'closed' ? auditCopy.comingSoon : undefined" @click="navTo('/pages/genesis/genesis')"><template #leading><view class="store-more__icon store-more__icon--gold"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m2 8 4 10h12l4-10-5 3-5-7-5 7z" /></svg></view></template></NxListRow>
          <NxListRow v-if="lockedProducts.length" :title="t.store.secComingSoon" :subtitle="lockedProducts.map(p => p.name).join(' · ')" :value="comingSoonOpen ? auditCopy.close : undefined" @click="comingSoonOpen = !comingSoonOpen"><template #leading><view class="store-more__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></view></template></NxListRow>
        </NxListGroup>
        <view v-if="comingSoonOpen && lockedProducts.length" class="store-locked-list"><LockedProductCard v-for="p in lockedProducts" :key="p.id" :product="p" /></view>
      </template>

      <view v-if="!publicOnly && !activityId && !voucherContext.voucherId" class="store-bundle-entry" data-testid="store-bundle-entry" role="button" tabindex="0" :aria-label="t.promotion.bundle"
        @click="navTo('/pages/store/bundle')" @keydown.enter.prevent="navTo('/pages/store/bundle')" @keydown.space.prevent="navTo('/pages/store/bundle')">
        <text>{{ t.promotion.bundle }}</text><text aria-hidden="true">›</text>
      </view>

      <!-- 《02》§7:Mono 仅限 <5 词短标签/数字;这是 8 词促销 callout 整句,改正文字体 -->
      <text class="store-footer">{{ t.store.pageFooter }}</text>
      </template>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { onUnmounted, ref, computed, nextTick, onMounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/tab-page-frame.vue";
import CardStagger from "@/components/card-stagger.vue";
import UpgradeSpotlight from "@/components/store/upgrade-spotlight.vue";
import ProductCard from "@/components/store/product-card.vue";
import PromotionEntry from '@/components/promotion/promotion-entry.vue';
import PromotionProduct from '@/components/promotion/promotion-product.vue';
import { usePromotionContext } from '@/composables/use-promotion-context';
import { promotionBundleHref,promotionStoreHref,voucherEntryContext,type VoucherEntryContext } from '@/lib/promotion-entry';
import { localized } from '@/lib/promotion-display';
import { useLocaleStore } from '@/store/locale';
import { navTo,takeNavigationQuery } from '@/lib/route';
import LockedProductCard from "@/components/store/locked-product-card.vue";
import { onHide, onLoad, onShow } from "@/composables/use-tab-page-lifecycle";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesis } from "@/store/genesis";
import { useT } from "@/i18n/use-t";
import { fmt, fmtMoney } from "@/i18n/format";
import { useAuditUiCopy } from "@/i18n/audit-ui";
import { useVoucher } from "@/store/voucher";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { voucherBenefitSummary } from "@/lib/voucher-benefit-summary";
import NxSection from "@/components/ui/nx-section.vue";
import NxListGroup from "@/components/ui/nx-list-group.vue";
import NxListRow from "@/components/ui/nx-list-row.vue";
import { PRODUCTS } from "@/mock/products";
import { productCatalogState, productCatalogPresentation, refreshProductCatalog } from "@/store/product-catalog";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import { isProductAvailable } from "@/store/product-availability";
import { useEarnConfig } from "@/store/earn-config";
import { buildStoreYieldAuthority } from "@/lib/store-yield-authority";
import { resolveStoreGoalFocus } from "@/lib/store-goal-focus";
import { highestOwnedHardware, storeUpgrade } from "@/lib/store-upgrade";
import { useApp } from "@/store/app";
import { dayOnePageObservationApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { reportDayOnePageObservation } from "@/lib/day-one-page-observation";
import { behaviorTracker, createStoreViewEvent } from "@/services/behavior-analytics";

const t = useT();
const auditCopy = useAuditUiCopy(), voucher = useVoucher(), comingSoonOpen = ref(false);
const voucherClaimSheet = useVoucherClaimSheet();
const app = useApp();
const locale=useLocaleStore();
const activityId=ref('');
const voucherContext=ref<VoucherEntryContext>({});
const publicOnly=computed(()=>{void app.accountKey;void app.accountBindingEpoch;return !sessionVault.read();});
const {activity,status:promotionStatus,available:promotionAvailable,refresh:refreshPromotion}=usePromotionContext(activityId);
function readPromotionQuery(query:Record<string,string|undefined>){
  voucherContext.value=voucherEntryContext(query);
  if(query.scope==='all'||voucherContext.value.voucherId)activityId.value='';
  else if(query.activityId)activityId.value=query.activityId.trim();
}
function clearPromotion(){activityId.value='';voucherContext.value={};void navTo(promotionStoreHref());}
// The fleet store clears this flag on every account binding. Retained devices
// are presentation only and never supply purchase eligibility.
const ownedDevices = computed(() => app.remoteFleetHasSnapshot ? app.visibleDevices : []);
const ownedHardware = computed(() => highestOwnedHardware(ownedDevices.value));
const genesisCfg = useGenesisConfig();
const genesis = useGenesis();
const earnConfig = useEarnConfig();
// Goal-recommendation landing context (BUG 71). `focus` is the SKU the earning
// goal recommended; `focusName` is its server display name, carried so the
// change explanation can still name a recommendation that is no longer in the
// purchasable catalog. Absent query → the store behaves exactly as before.
// Declared before the lifecycle hooks below: onHide/onUnmounted clear this
// arrival context, and a callback that runs before the declaration is
// evaluated would read the binding in its temporal dead zone.
const focusProductId = ref("");
const focusProductName = ref("");
let storePageVisible = false;
let storeObservationEpoch = 0;
let storeViewReportedScope = "";
let storeViewAttempt: { scopeKey: string; userId: number; event: ReturnType<typeof createStoreViewEvent>; tries: number; timer: ReturnType<typeof setTimeout> | null } | null = null;
// 🔴 商城页渲染创世尊享卡(受闸 CTA + 上架开关),必须跟着重读(独立验收 P1)。
//   注意 `showcaseEnabled` 由 false→true 时卡片本身不挂载,composable 的 onMounted 够不着,
//   只有页面级 onShow 能把它翻回来。
onShow(() => {
  const pending=takeNavigationQuery('/pages/store/store');
  if(pending){const query=new URLSearchParams(pending),values:Record<string,string>={};query.forEach((value,key)=>{values[key]=value;});readPromotionQuery(values);}
  storePageVisible = true;
  if(publicOnly.value)return;
  genesisCfg.refresh();
  void voucher.refreshRemote();
  // G4's public state owns supply independently of the configuration fields.
  // Re-read it whenever the store becomes visible so a prior failed 0/0
  // bootstrap can recover without an account rebind or a Genesis-detail visit.
  void genesis.syncRemote();
  void refreshServerProductPhase(true);
  void refreshProductCatalog(true);
  void observeDayOneStorePage();
});
onHide(() => {
  storePageVisible = false;
  storeObservationEpoch += 1;
  storeViewReportedScope = "";
  if (storeViewAttempt?.timer) clearTimeout(storeViewAttempt.timer);
  storeViewAttempt = null;
  // The goal-recommendation context belongs to the arrival from the earning
  // goal, not to the tab. A tab switch or a detail push must not keep claiming
  // "your goal sent you here" on the next look at an unrelated store visit.
  focusProductId.value = "";
  focusProductName.value = "";
});
onUnmounted(() => {
  storePageVisible = false;
  storeObservationEpoch += 1;
  storeViewReportedScope = "";
  if (storeViewAttempt?.timer) clearTimeout(storeViewAttempt.timer);
  storeViewAttempt = null;
  focusProductId.value = "";
  focusProductName.value = "";
});
const phase = useProductPhase();

// mounted guard: phase override persists in storage, rehydrates client-only —
// mirror the source's mounted gate so locked/unlocked split is stable.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

// `PRODUCTS` is deliberately a compatibility array for legacy consumers. Its
// server replacement is not itself reactive, so make the catalog state an
// explicit computed dependency. When the authoritative response reaches ready,
// these computed listings run again against the new array.
const catalogStatus = computed(() => productCatalogState.status);
async function observeDayOneStorePage(): Promise<void> {
  if (!remoteApiEnabled || !storePageVisible || catalogStatus.value !== "ready") return;
  const scope = captureAccountScope();
  const pageEpoch = storeObservationEpoch;
  await nextTick();
  const session = sessionVault.read();
  if (!storePageVisible || pageEpoch !== storeObservationEpoch || catalogStatus.value !== "ready"
    || !isCurrentAccountScope(scope) || !session) return;
  const viewScope = `${pageEpoch}:${scope.accountKey}:${scope.epoch}`;
  if (storeViewReportedScope !== viewScope && storeViewAttempt?.scopeKey !== viewScope) {
    if (storeViewAttempt?.timer) clearTimeout(storeViewAttempt.timer);
    const attempt = { scopeKey: viewScope, userId: session.user.userId, event: createStoreViewEvent(), tries: 0, timer: null as ReturnType<typeof setTimeout> | null };
    storeViewAttempt = attempt;
    const send = async (): Promise<void> => {
      if (storeViewAttempt !== attempt || !storePageVisible || pageEpoch !== storeObservationEpoch
        || !isCurrentAccountScope(scope) || sessionVault.read()?.user.userId !== attempt.userId) return;
      attempt.tries += 1;
      const recorded = await behaviorTracker.viewStore(attempt.event);
      if (storeViewAttempt !== attempt || !storePageVisible || pageEpoch !== storeObservationEpoch
        || !isCurrentAccountScope(scope) || sessionVault.read()?.user.userId !== attempt.userId) return;
      if (recorded) {
        storeViewReportedScope = viewScope;
        storeViewAttempt = null;
      } else if (attempt.tries < 3) {
        attempt.timer = setTimeout(() => { attempt.timer = null; void send(); }, attempt.tries * 1000);
      }
    };
    void send();
  }
  void reportDayOnePageObservation("visit_store", {
    scope,
    session,
    visible: () => storePageVisible && pageEpoch === storeObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => dayOnePageObservationApi.storePage(),
  });
}
watch(catalogStatus, () => {
  void observeDayOneStorePage();
});
const displayCatalog = computed(() => remoteApiEnabled ? productCatalogPresentation.value : null);
const displayProducts = computed(() => {
  const products=remoteApiEnabled ? displayCatalog.value?.products ?? [] : PRODUCTS;
  if(publicOnly.value)return [];
  return activityId.value ? products.filter(p=>activity.value?.productNos.includes(p.id)) : products;
});
const catalogHasProducts = computed(() => displayProducts.value.length > 0);
const yieldAuthority = computed(() => buildStoreYieldAuthority(
  displayProducts.value,
  earnConfig.phoneTiers.value?.tiers ?? [],
  {
    source: displayCatalog.value?.source ?? productCatalogState.source,
    sourceEnvironment: displayCatalog.value?.sourceEnvironment ?? productCatalogState.sourceEnvironment,
    runId: displayCatalog.value?.runId ?? productCatalogState.runId,
    serverCanonical: displayCatalog.value?.serverCanonical ?? productCatalogState.serverCanonical,
  },
));
const unlockedProducts = computed(() =>
  displayProducts.value.filter((p) => {
    if (!mounted.value) return false;
    return isProductAvailable(p, phase.value);
  }),
);
const lockedProducts = computed(() =>
  displayProducts.value.filter((p) => {
    if (!mounted.value) return false;
    return !isProductAvailable(p, phase.value);
  }),
);

const upgrade = computed(() => storeUpgrade(unlockedProducts.value, ownedDevices.value));
const upgradeBaseImageUrl = computed(() => {
  const base = upgrade.value?.base;
  return base ? displayProducts.value.find(p => p.id === base.kind)?.imageUrl : undefined;
});
const voucherClaimable = computed(() => voucher.claimableVouchers.filter(offer => offer.claimSurfaces.includes('store')));
const voucherOffers = computed(() => [...new Map([...voucherClaimable.value, ...voucher.claimedUnused].map(offer => [offer.id, offer])).values()]);
const voucherBenefit = computed(() => voucherBenefitSummary(voucherOffers.value));
function openStoreVouchers() {
  if (voucherClaimable.value.length) voucherClaimSheet.show('store');
  else if (voucherOffers.value.length) navTo('/pages/me/rewards-list?cat=voucher');
}

// Goal-recommendation landing context (BUG 71) is declared above, before the
// lifecycle hooks that clear it.
onLoad((options) => {
  const query = (options || {}) as Record<string, string | undefined>;
  readPromotionQuery(query);
  focusProductId.value = (query.focus ?? "").trim();
  focusProductName.value = (query.focusName ?? "").trim();
});
// Only a product that is actually purchasable may take over the recommendation
// slot; a phase-locked or delisted SKU must not be presented as the live pick.
const goalFocus = computed(() => resolveStoreGoalFocus(
  focusProductId.value,
  focusProductName.value,
  displayProducts.value,
  unlockedProducts.value,
  catalogHasProducts.value,
));
const focusFeatured = computed(() => goalFocus.value.featured);
const goalFocusBody = computed(() => {
  const focus = goalFocus.value;
  switch (focus.variant) {
    case "located": return fmt(t.value.store.goalFocusLocated, { name: focus.name });
    case "pending": return t.value.store.goalFocusCatalogPending;
    case "not-purchasable": return fmt(t.value.store.goalFocusUnavailable, { name: focus.name });
    case "replaced": return fmt(t.value.store.goalFocusReplaced, { name: focus.name });
    default: return "";
  }
});

// Feature a real upgrade when one is available; a goal-recommended SKU outranks
// it; the full catalogue remains browsable.
const featured = computed(
  () => (activityId.value ? undefined : focusFeatured.value)
    ?? unlockedProducts.value.find((p) => p.id === upgrade.value?.target.id)
    ?? unlockedProducts.value[0],
);
const restProducts = computed(() =>
  unlockedProducts.value.filter((p) => p.id !== featured.value?.id),
);

const catalogProducts = computed(() => focusFeatured.value
  ? [focusFeatured.value, ...unlockedProducts.value.filter(p => p.id !== focusFeatured.value?.id)]
  : unlockedProducts.value);

function retryCatalog() {
  void refreshProductCatalog(true);
}

// "热门" tag — border line removed per request, soft bg kept (V5 inner-chip rule:
// soft bg tint + content color, no border).
const amberTagStyle: CSSProperties = {
  fontSize: "12px",
  padding: "2px 7px",
  borderRadius: "4px",
  background: "var(--v5-brand-2-soft)",
  color: "var(--v5-brand-2-ink)",
  fontWeight: 500,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const catalogStateStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "18px 16px",
  borderRadius: "var(--nx-glass-radius)",
  // 《03》§3:带填充的卡片一律零 border,层级靠 surface 微差色。
  // 删 border 不会让它隐形 —— 卡面 surface 与页面底 bg 两个主题都有真实色差
  // (亮色是白卡压暖米底,暗色是深灰卡压纯黑底),不是「底色与父同色」那种坑。
  // ↑ 刻意不在注释里写具体色号:hex 硬编码哨兵扫的是字面色号,一句注释就能让它判红
  //   (2026-08-14 实测,与「注释里写接口路径把台账哨兵判红」同型)。
  background: "var(--nx-glass-fill)",
};
const catalogStateTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const catalogStateBodyStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: "19px",
  color: "var(--v5-ink-3)",
};
const catalogRetryStyle: CSSProperties = {
  minHeight: "44px",
  alignItems: "center",
  padding: "0 14px",
  borderRadius: "9999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};

// Goal-recommendation context card — same filled/no-border L1 idiom as the
// catalog state card above, tinted with the recommendation accent so it reads
// as the reason this page opened, not as a second product card.
const goalFocusCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, var(--v5-surface))",
};
const goalFocusTitleStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: "var(--v5-brand-2-ink)",
};
const goalFocusBodyStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: "19px",
  color: "var(--v5-ink)",
};
const goalFocusRetryStyle: CSSProperties = {
  minHeight: "32px",
  alignItems: "center",
  padding: "0 12px",
  borderRadius: "9999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontSize: "12px",
};


</script>
<style src="@/components/promotion/promotion.css"></style>
<style scoped>
.store-content { padding:12px 16px 16px; color:var(--v5-ink); }
.store-content > * + * { margin-top:16px; }
.store-voucher-ticket { position:relative; display:flex; align-items:center; gap:14px; min-height:88px; box-sizing:border-box; padding:6px 18px; overflow:hidden; border:1px solid var(--v5-border); border-radius:22px; background:radial-gradient(60% 120% at 100% 50%,color-mix(in srgb,var(--v5-brand) 18%,transparent),transparent 65%),linear-gradient(90deg,var(--ui-ticket-top),var(--ui-ticket-bottom)); }
.store-voucher-ticket::before,.store-voucher-ticket::after { content:''; position:absolute; top:50%; width:18px; height:18px; margin-top:-9px; border-radius:50%; background:var(--v5-bg); border:1px solid var(--v5-border); }
.store-voucher-ticket::before { left:-10px; }.store-voucher-ticket::after { right:-10px; }
.store-voucher-ticket__value { display:flex; align-items:baseline; gap:2px; flex:none; font:600 30px/34px var(--font-v5); letter-spacing:-.02em; color:var(--ui-lime-pale); font-variant-numeric:tabular-nums; }
.store-voucher-ticket__currency { font-size:15px; color:var(--ui-lime-soft); }
.store-voucher-ticket__rule { align-self:stretch; margin:6px 0; border-left:1px dashed var(--v5-border-strong); }
.store-voucher-ticket__copy { flex:1; min-width:0; }
.store-voucher-ticket__title { display:block; font:600 15px/20px var(--font-v5); }
.store-voucher-ticket__hint { display:block; margin-top:2px; font:400 12.5px/18px var(--font-v5); color:var(--v5-ink-3); }
.store-voucher-ticket__art { width:72px; height:72px; margin:-4px -6px -4px 0; flex:none; animation:ticket-bob 4.6s ease-in-out infinite; }
.store-voucher-ticket:focus-visible { outline:2px solid var(--v5-brand); outline-offset:3px; }
.store-campaign :deep(.entry-advert) { height:auto; min-height:146px; padding:0; border-radius:22px; border:1px solid var(--v5-border); box-shadow:none; background:radial-gradient(70% 90% at 82% 72%,color-mix(in srgb,var(--v5-brand) 24%,transparent),transparent 62%),linear-gradient(135deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.store-campaign :deep(.entry-label) { top:18px; left:18px; padding:0; border:0; background:transparent; color:var(--ui-lime-soft); font:500 12.5px/18px var(--font-v5); }
.store-campaign :deep(.entry-title) { font-size:19px; line-height:25px; }
.store-catalogue { margin-top:20px; }
.store-catalogue :deep(.nx-section__heading) { padding:0 2px; }
.store-catalogue :deep(.nx-section__meta) { font-size:13px; font-weight:500; }
.store-product-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-items:stretch; }
.store-estimate-note { display:block; margin-top:10px; padding:0 2px; font:400 12.5px/1.6 var(--font-v5); color:var(--v5-ink-3); }
.store-more__icon { display:grid; place-items:center; width:36px; height:36px; border-radius:12px; background:var(--ui-content-surface-2); }
.store-more__icon--gold { color:var(--v5-warning-ink); background:linear-gradient(160deg,color-mix(in srgb,var(--v5-warning) 32%,transparent),color-mix(in srgb,var(--v5-warning) 8%,transparent)); box-shadow:inset 0 1px 0 color-mix(in srgb,var(--v5-warning) 35%,transparent); }
.store-more :deep(.nx-list-row__subtitle) { color:var(--v5-ink-3); }
.store-locked-list { display:flex; flex-direction:column; gap:10px; }
.store-bundle-entry { display:flex; align-items:center; justify-content:flex-end; gap:6px; min-height:44px; padding:0 2px; color:var(--v5-brand); font:500 13px/18px var(--font-v5); cursor:pointer; }
.store-bundle-entry:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; border-radius:8px; }
.store-bundle-entry:active { opacity:.75; }
.store-footer { display:block; margin-top:20px; padding-bottom:8px; font:400 12px/18px var(--font-v5); text-align:center; color:var(--v5-ink-3); }
.store-promotion-scope { display:flex; flex-direction:column; gap:12px; }
.store-promotion-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; }
@keyframes ticket-bob { 0%,100% { transform:translateY(0) rotate(-10deg); } 50% { transform:translateY(-3px) rotate(-8deg); } }
@media(max-width:350px) { .store-voucher-ticket { gap:8px; padding-inline:14px; }.store-voucher-ticket__art { width:54px; height:54px; }.store-voucher-ticket__value { font-size:26px; } }
@media(prefers-reduced-motion:reduce) { .store-voucher-ticket__art { animation:none; } }
</style>

<style scoped>.store-voucher-ticket__hint > text {display:block;} @media(max-width:350px) {.store-voucher-ticket {gap:10px;padding-inline:14px;}.store-voucher-ticket__art {width:58px;margin-right:-10px;}.store-voucher-ticket__copy {position:relative;z-index:1;}.store-voucher-ticket__hint {white-space:normal;}}</style>
