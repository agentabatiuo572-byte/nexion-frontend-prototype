<template>
  <view class="nx-glass-card block" :style="cardStyle" :role="selected ? 'link' : undefined" :tabindex="selected ? 0 : undefined" @click="openProduct" @keydown.enter.stop.prevent="openProduct">
    <view class="flex items-start justify-between" style="gap: 12px">
      <view>
        <text class="block" :style="titleStyle">{{ t.home.productTrustTitle }}</text>
        <text class="block" :style="subtitleStyle">{{ t.home.productTrustSubtitle }}</text>
      </view>
      <text v-if="selected" :style="linkStyle">{{ t.home.productTrustOpen }} ›</text>
      <text v-else-if="remoteApiEnabled && productCatalogState.status === 'error'" class="active:opacity-70" :style="linkStyle" role="button" tabindex="0" @click.stop="retry"  @keydown.enter.stop.prevent="retry" @keydown.space.stop.prevent="retry">
        {{ t.ui.retry }}
      </text>
      <text v-else-if="remoteApiEnabled && productCatalogState.status === 'loading'" :style="mutedStyle">
        {{ t.home.networkStatUpdating }}
      </text>
    </view>

    <template v-if="selected">
      <view class="flex items-center justify-between" style="margin-top: 13px; gap: 12px">
        <view class="min-w-0">
          <text class="block truncate" :style="productNameStyle">{{ selected.product.name }}</text>
          <text class="block truncate" :style="taglineStyle">{{ tagline }}</text>
        </view>
        <view :style="pricePillStyle">
          <text class="tabular-nums" :style="priceStyle">${{ selected.product.price.toLocaleString() }}</text>
        </view>
      </view>
      <view class="grid grid-cols-3" style="gap: 8px; margin-top: 12px">
        <view class="nx-glass-inset" v-for="item in specs" :key="item.label" :style="specStyle">
          <text class="block" :style="specLabelStyle">{{ item.label }}</text>
          <text class="block" :style="specValueStyle">{{ item.value }}</text>
        </view>
      </view>
    </template>
    <text v-else-if="remoteApiEnabled && productCatalogState.status === 'ready'" class="block" :style="emptyStyle">{{ t.home.productTrustEmpty }}</text>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, onMounted, type CSSProperties } from "vue";
import { remoteApiEnabled } from "@/api/runtime";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { selectHomepageProductTrust } from "@/lib/home-data-presenters";
import { PRODUCTS } from "@/mock/products";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { localizedDatacenterValue, productCopy, specText } from "@/lib/product-copy";

const t = useT();
const locale = useLocaleStore();
const selected = computed(() => {
  if (remoteApiEnabled && productCatalogState.status !== "ready") return null;
  return selectHomepageProductTrust(PRODUCTS);
});
const tagline = computed(() => selected.value
  ? productCopy(t.value, selected.value.product, remoteApiEnabled, locale.code).tagline : "");
const specs = computed(() => selected.value ? [
  { label: t.value.home.productTrustGpu, value: specText(t.value, selected.value.gpu, "-") },
  { label: t.value.home.productTrustDatacenter, value: specText(t.value, localizedDatacenterValue(selected.value.datacenter, locale.code), "-") },
  { label: t.value.home.productTrustWarranty, value: specText(t.value, selected.value.warranty, "-") },
] : []);

function retry() {
  void refreshProductCatalog(true);
}

function openProduct() {
  if (!selected.value) return;
  navTo(`/pages/store/detail?id=${encodeURIComponent(selected.value.product.id)}`);
}

onMounted(() => {
  if (remoteApiEnabled && productCatalogState.status !== "ready") void refreshProductCatalog();
});

const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)", padding: "14px", borderRadius: "var(--nx-glass-radius)", background: "var(--nx-glass-fill)" };
const titleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const subtitleStyle: CSSProperties = { marginTop: "3px", fontSize: "12px", color: "var(--v5-ink-3)" };
const linkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "0 12px", flexShrink: 0, fontSize: "12px", fontWeight: 600, color: "var(--v5-brand)" };
const mutedStyle: CSSProperties = { flexShrink: 0, fontSize: "12px", color: "var(--v5-ink-3)" };
const emptyStyle: CSSProperties = { marginTop: "12px", fontSize: "12px", color: "var(--v5-ink-3)" };
const productNameStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const taglineStyle: CSSProperties = { marginTop: "3px", fontSize: "12px", color: "var(--v5-ink-3)" };
const pricePillStyle: CSSProperties = { flexShrink: 0, padding: "5px 9px", borderRadius: "999px", background: "var(--v5-brand-soft)" };
const priceStyle: CSSProperties = { fontSize: "12px", fontWeight: 600, color: "var(--v5-brand)" };
const specStyle: CSSProperties = { minWidth: 0, padding: "9px", borderRadius: "10px", };
const specLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)" };
const specValueStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.35, color: "var(--v5-ink-2)", overflowWrap: "anywhere" };


</script>
