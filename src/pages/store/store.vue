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
      <StoreHero />
      <ClusterLadder />
      <VsPhoneHero />

      <!-- Sprint 2 finale — phase + legacy-ownership trade-in window -->
      <TradeinWindowBanner />

      <!-- Server mode has no seeded purchase inventory. Keep the live catalog
           state visible so a malformed or empty response cannot hide every CTA. -->
      <view v-if="catalogStatus === 'loading'" data-testid="store-catalog-loading" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogLoadingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogLoadingBody }}</text>
      </view>
      <view v-else-if="catalogStatus === 'error'" data-testid="store-catalog-error" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogErrorTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogErrorBody }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" @click="retryCatalog">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>
      <view v-else-if="!catalogHasProducts" data-testid="store-catalog-empty" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogEmptyTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogEmptyBody }}</text>
      </view>
      <template v-else>
        <SectionHeader :title="t.store.secRecommended">
          <template #right>
            <text class="font-mono-tabular inline-flex items-center gap-1" :style="amberTagStyle">{{ t.store.secRecommendedTag }}</text>
          </template>
        </SectionHeader>
        <ProductCard v-if="featured" :product="featured" featured />

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
import { ref, computed, onMounted, type CSSProperties } from "vue";
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
import { onShow } from "@dcloudio/uni-app";
import { useGenesisConfig } from "@/store/genesis-config";
import { useT } from "@/i18n/use-t";
import { PRODUCTS } from "@/mock/products";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import { isProductAvailable } from "@/store/product-availability";

const t = useT();
const genesisCfg = useGenesisConfig();
// 🔴 商城页渲染创世尊享卡(受闸 CTA + 上架开关),必须跟着重读(独立验收 P1)。
//   注意 `showcaseEnabled` 由 false→true 时卡片本身不挂载,composable 的 onMounted 够不着,
//   只有页面级 onShow 能把它翻回来。
onShow(() => {
  genesisCfg.refresh();
  void refreshServerProductPhase(true);
  void refreshProductCatalog(true);
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
const catalogHasProducts = computed(() => {
  const status = productCatalogState.status;
  return status === "ready" && PRODUCTS.length > 0;
});
const unlockedProducts = computed(() =>
  (productCatalogState.status === "ready" ? PRODUCTS : []).filter((p) => {
    if (!mounted.value) return false;
    return isProductAvailable(p, phase.value);
  }),
);
const lockedProducts = computed(() =>
  PRODUCTS.filter((p) => {
    if (!mounted.value) return true;
    return !isProductAvailable(p, phase.value);
  }),
);

// Featured = first active product (S1)
const featured = computed(
  () => unlockedProducts.value.find((p) => p.id === "stellarbox-s1") ?? unlockedProducts.value[0],
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

const catalogStateStyle: CSSProperties = {
  padding: "18px 16px",
  borderRadius: "16px",
  // 《03》§3:带填充的卡片一律零 border,层级靠 surface 微差色。
  // 删 border 不会让它隐形 —— 卡面 surface 与页面底 bg 两个主题都有真实色差
  // (亮色是白卡压暖米底,暗色是深灰卡压纯黑底),不是「底色与父同色」那种坑。
  // ↑ 刻意不在注释里写具体色号:hex 硬编码哨兵扫的是字面色号,一句注释就能让它判红
  //   (2026-08-14 实测,与「注释里写接口路径把台账哨兵判红」同型)。
  background: "var(--v5-surface)",
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
  minHeight: "36px",
  alignItems: "center",
  padding: "0 14px",
  borderRadius: "9999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
</script>
