<!-- Detail artwork is selected by SKU; shared tiers do not identify a model. -->
<template>
  <view class="product-render relative w-full overflow-hidden" :data-product-id="productId">
    <image v-if="photo" :src="photo.src" mode="aspectFit" class="product-render__image" aria-hidden="true" />
    <view v-else class="absolute inset-0 grid place-items-center" style="color: var(--v5-ink-3)">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getProductMedia } from "@/lib/product-media";

const props = defineProps<{ productId: string }>();
const photo = computed(() => getProductMedia(props.productId));
</script>

<style scoped>
.product-render { aspect-ratio: 1; border-radius: var(--v5-radius-m); background: var(--v5-surface-2); }
.product-render__image { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
