<!--
  Store (main list page) — ported from Nexion-prototype/app/(main)/store/page.tsx.
  v5 light-fintech tier ladder upgrade flow, top→bottom:
    StoreHero → ClusterLadder → VsPhoneHero → TradeinWindowBanner →
    "Recommended" header + featured ProductCard → PurchaseTicker →
    "More tiers" header + rest ProductCards → "Coming soon" LockedProductCards →
    footer note. (Orders entry moved to Me → Account — see me.vue.)
  Phase-gated products (Pro v2 / Rack P2, unlocksAtPhase): shown as live cards
  once the platform phase is reached, otherwise as locked "Coming soon" cards.
  Wrapped in <AppChassis active="store">; entrance via <CardStagger>.
-->
<template>
  <AppChassis active="store">
    <CardStagger class="px-4 pt-3 pb-4 space-y-6" style="color: var(--v5-ink)">
      <StoreHero :multiplier="upgrade?.multiplier ?? null" />
      <ClusterLadder :authority="yieldAuthority" :owned="ownedHardware" />
      <VsPhoneHero v-if="upgrade" :authority="yieldAuthority" :comparison="upgrade" />

      <!-- Sprint 2 finale — phase + legacy-ownership trade-in window -->
      <TradeinWindowBanner />

      <!-- Goal-recommendation context (BUG 71). Arriving from an earning goal
           carries `focus`; the card locates the recommended SKU instead of
           silently featuring the generic first product, and names the change
           when the recommendation is no longer purchasable. -->
      <view v-if="focusProductId" data-testid="store-goal-focus" class="rounded-2xl" :style="goalFocusCardStyle">
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
      <view class="nx-glass-card" v-if="catalogStatus === 'ready' && !catalogHasProducts" data-testid="store-catalog-empty" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogEmptyTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogEmptyBody }}</text>
      </view>
      <template v-if="catalogHasProducts">
        <SectionHeader :title="t.store.secRecommended" style="height: 44px">
          <template #right>
            <view style="height: 44px; max-width: 65%; display: flex; align-items: center; overflow: hidden">
              <text v-if="catalogStatus === 'loading'" role="status" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ t.store.catalogLoadingTitle }}</text>
              <view v-else-if="catalogStatus === 'error'" role="button" tabindex="0"
                :aria-label="`${t.store.catalogErrorTitle} · ${t.store.catalogRetry}`"
                style="height: 44px; min-width: 0; display: flex; flex-direction: column; justify-content: center; font-size: 12px; line-height: 18px"
                @click="retryCatalog"  @keydown.enter.prevent="retryCatalog" @keydown.space.prevent="retryCatalog">
                <text style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ t.store.catalogErrorTitle }}</text>
                <text style="color: var(--v5-brand)">{{ t.store.catalogRetry }}</text>
              </view>
              <text v-else class="font-mono-tabular inline-flex items-center gap-1" :style="amberTagStyle">{{ t.store.secRecommendedTag }}</text>
            </view>
          </template>
        </SectionHeader>
        <ProductCard v-if="featured" :key="featured.id" :product="featured" featured />

        <PurchaseTicker />

        <SectionHeader v-if="restProducts.length > 0" :title="t.store.secMoreTiers" />
        <ProductCard v-for="p in restProducts" :key="p.id" :product="p" />

        <!-- "Coming soon" — gen-2 phase-locked -->
        <view v-if="lockedProducts.length > 0">
          <SectionHeader :title="t.store.secComingSoon">
            <template #right>
              <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.store.comingSoonNote }}</text>
            </template>
          </SectionHeader>
          <view class="space-y-2.5">
            <LockedProductCard v-for="p in lockedProducts" :key="p.id" :product="p" />
          </view>
        </view>
      </template>

      <!-- 尊享席位 — Genesis 独立金融 SKU 入口(升级阶梯压轴;规格 FEAT-GEN07,
           非设备目录成员,经济模型与当前服务端资格投影在 store/genesis.ts)。
           showcaseEnabled 运营开关(FEAT-GEN09):关=整区隐藏,预售页/二级不受影响。-->
      <view v-if="genesisCfg.config.showcaseEnabled">
        <SectionHeader :title="t.store.secGenesis" />
        <GenesisShowcaseCard />
      </view>

      <!-- 《02》§7:Mono 仅限 <5 词短标签/数字;这是 8 词促销 callout 整句,改正文字体 -->
      <text class="block text-center" style="margin-top: 20px; padding-bottom: 8px; font-size: 12px; line-height: 16px; color: var(--v5-ink-3)">{{ t.store.pageFooter }}</text>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { onUnmounted, ref, computed, nextTick, onMounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import SectionHeader from "@/components/store/section-header.vue";
import StoreHero from "@/components/store/store-hero.vue";
import ClusterLadder from "@/components/store/cluster-ladder.vue";
import VsPhoneHero from "@/components/store/vs-phone-hero.vue";
import TradeinWindowBanner from "@/components/store/tradein-window-banner.vue";
import ProductCard from "@/components/store/product-card.vue";
import PurchaseTicker from "@/components/store/purchase-ticker.vue";
import LockedProductCard from "@/components/store/locked-product-card.vue";
import GenesisShowcaseCard from "@/components/store/genesis-showcase-card.vue";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesis } from "@/store/genesis";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
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
import { authenticatedPageObservationReporter } from "@/lib/authenticated-page-observation";
import { behaviorTracker, createStoreViewEvent } from "@/services/behavior-analytics";

const t = useT();
const app = useApp();
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
  storePageVisible = true;
  genesisCfg.refresh();
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
  void authenticatedPageObservationReporter.report({
    subject: "day-one:visit-store",
    scope,
    session,
    visible: () => storePageVisible && pageEpoch === storeObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => dayOnePageObservationApi.storePage(),
    accepted: (result) => result.recorded,
  });
}
watch(catalogStatus, () => {
  void observeDayOneStorePage();
});
const displayCatalog = computed(() => remoteApiEnabled ? productCatalogPresentation.value : null);
const displayProducts = computed(() => remoteApiEnabled ? displayCatalog.value?.products ?? [] : PRODUCTS);
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
    if (!mounted.value) return true;
    return !isProductAvailable(p, phase.value);
  }),
);

const upgrade = computed(() => storeUpgrade(unlockedProducts.value, ownedDevices.value));

// Goal-recommendation landing context (BUG 71) is declared above, before the
// lifecycle hooks that clear it.
onLoad((options) => {
  const query = (options || {}) as Record<string, string | undefined>;
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
  () => focusFeatured.value
    ?? unlockedProducts.value.find((p) => p.id === upgrade.value?.target.id)
    ?? unlockedProducts.value[0],
);
const restProducts = computed(() =>
  unlockedProducts.value.filter((p) => p.id !== featured.value?.id),
);

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
