<!--
  ProductRender — hero render for the product DETAIL page (ported from
  Nexion-prototype/app/components/product-render.tsx).

  Approved catalog photos show a tilted product image with a flat brand
  overlay. Missing or failed media uses a neutral placeholder. The tilt uses
  the existing `v5-product-tilt` keyframe in tokens.css.

  The store LIST card has its own inline render (no brand overlay).
-->
<template>
  <view class="relative w-full overflow-hidden" :style="rootStyle">
    <view aria-hidden :style="bgStyle" />

    <template v-if="video || photo">
      <!-- Tilted product image layer -->
      <view :style="tiltLayerStyle">
        <video v-if="video" :src="video" :poster="videoPoster" controls :autoplay="false" preload="metadata" playsinline style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain" @error="fallbackProductVideo" />
        <image v-else-if="photo" :src="photo.src" mode="aspectFit" style="position: absolute; inset: 0; width: 100%; height: 100%" @error="fallbackProductImage" />
      </view>
      <!-- Bottom vignette (flat) so the brand overlay reads cleanly -->
      <view aria-hidden :style="vignetteStyle" />
      <!-- Brand overlay — flat 2D label, does NOT tilt with the product -->
      <view class="absolute text-right" style="bottom: 10px; right: 16px; pointer-events: none">
        <text class="block" :style="brandStyle">UVEL</text>
        <text class="block" :style="tierCodeStyle">{{ displayTierCode }}</text>
      </view>
    </template>

    <!-- Any SKU without an approved catalog image uses a neutral placeholder. -->
    <view v-else class="absolute inset-0 grid place-items-center" style="color: var(--v5-ink-3)">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { catalogProductImageUrl, productTierCode } from "@/lib/product-image";

const props = defineProps<{ productId: string; tier: "Entry" | "Pro" | "Flagship" | "Share"; imageUrl?: string; videoUrl?: string }>();

const failedImageUrl = ref("");
watch(() => props.imageUrl, () => { failedImageUrl.value = ""; }, { immediate: true });
const photo = computed(() => {
  const imageUrl = catalogProductImageUrl(props.imageUrl, failedImageUrl.value);
  return imageUrl ? { src: imageUrl, tierCode: productTierCode(props.productId, props.tier) } : null;
});
function fallbackProductImage() {
  failedImageUrl.value = props.imageUrl ?? "";
}
const failedVideoUrl = ref("");
watch(() => props.videoUrl, () => { failedVideoUrl.value = ""; }, { immediate: true });
const video = computed(() => failedVideoUrl.value === props.videoUrl ? undefined : props.videoUrl);
const videoPoster = computed(() => photo.value?.src ?? "");
const displayTierCode = computed(() => photo.value?.tierCode ?? props.tier);
function fallbackProductVideo() {
  failedVideoUrl.value = props.videoUrl ?? "";
}

// aspect-square hero (source render uses the aspect-square utility class)
const rootStyle: CSSProperties = { aspectRatio: "1 / 1", borderRadius: "var(--v5-radius-2xl)" };
const bgStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "var(--v5-surface-2)",
};
const tiltLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  transformOrigin: "center center",


};
const vignetteStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: "80px",
  background: "linear-gradient(to top, #0F0F0F 0%, rgba(15,15,15,0.6) 50%, transparent 100%)",
  pointerEvents: "none",
};
const brandStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "0.22em",
  color: "var(--v5-brand)",
  lineHeight: 1,
  textShadow: "0 0 8px rgba(198,255,58,0.45)",
};
const tierCodeStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  letterSpacing: "0.18em",
  color: "rgba(255,255,255,0.75)",
  textTransform: "uppercase",
  lineHeight: 1,
};


</script>
