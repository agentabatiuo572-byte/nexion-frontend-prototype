<!--
  ProductRender — hero render for the product DETAIL page (ported from
  Nexion-prototype/app/components/product-render.tsx).

  Hardware tiers (Entry/Pro/Flagship) show a tilted product photo with a flat
  (non-tilting) NEXGRID brand overlay. Cloud Share keeps the abstract distributed-
  cloud SVG (all SMIL <animate> tags render in the .vue webview — see PITFALLS
  P-013). The tilt uses the existing `v5-product-tilt` keyframe in tokens.css.

  The store LIST card has its own inline render (id-keyed photo, no brand
  overlay); this tier-keyed variant with the NEXGRID label is detail-only.
-->
<template>
  <view class="relative w-full overflow-hidden" :style="rootStyle">
    <view aria-hidden :style="bgStyle" />

    <template v-if="photo">
      <!-- Tilted product image layer -->
      <view :style="tiltLayerStyle">
        <image :src="photo.src" mode="aspectFill" style="position: absolute; inset: 0; width: 100%; height: 100%" />
      </view>
      <!-- Bottom vignette (flat) so the brand overlay reads cleanly -->
      <view aria-hidden :style="vignetteStyle" />
      <!-- Brand overlay — flat 2D label, does NOT tilt with the product -->
      <view class="absolute text-right" style="bottom: 10px; right: 16px; pointer-events: none">
        <text class="block" :style="brandStyle">NEXGRID</text>
        <text class="block" :style="tierCodeStyle">{{ photo.tierCode }}</text>
      </view>
    </template>

    <!-- Cloud Share — abstract distributed cloud -->
    <template v-else>
      <view aria-hidden class="absolute inset-0 dot-grid" style="opacity: 0.25" />
      <view aria-hidden :style="cloudGlowStyle" />
      <svg viewBox="0 0 800 360" class="relative w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="cloud-puff" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stop-color="var(--v5-brand)" stop-opacity="0.2" />
            <stop offset="60%" stop-color="#1A1D24" stop-opacity="1" />
            <stop offset="100%" stop-color="#0A0C10" stop-opacity="1" />
          </radialGradient>
          <filter id="cloud-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="9" />
            <feOffset dy="16" />
            <feComponentTransfer><feFuncA type="linear" slope="0.55" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g stroke="var(--v5-brand)" stroke-opacity="0.4" stroke-width="1.1" stroke-dasharray="5 5" fill="none">
          <line x1="180" y1="100" x2="400" y2="180"><animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.4s" repeatCount="indefinite" /></line>
          <line x1="620" y1="105" x2="400" y2="180"><animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.6s" repeatCount="indefinite" /></line>
          <line x1="200" y1="270" x2="400" y2="180"><animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.8s" repeatCount="indefinite" /></line>
          <line x1="600" y1="265" x2="400" y2="180"><animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.5s" repeatCount="indefinite" /></line>
        </g>

        <g filter="url(#cloud-shadow)">
          <path
            d="M 270 230 Q 222 230 222 192 Q 222 152 268 152 Q 280 118 320 118 Q 354 96 392 122 Q 426 96 462 122 Q 498 118 510 152 Q 552 152 552 192 Q 552 230 502 230 Z"
            fill="url(#cloud-puff)" stroke="var(--v5-brand)" stroke-opacity="0.6" stroke-width="1.6" />
          <path d="M 270 162 Q 318 132 388 138" stroke="var(--v5-brand)" stroke-opacity="0.5" stroke-width="1.2" fill="none" />
          <!-- i18n-en-ok: 产品渲染图上的丝印,实物机箱印的就是英文;本地化丝印会让图片与到手设备不一致 -->
          <SvgText x="386" y="190" text-anchor="middle" font-size="22" font-weight="600" fill="var(--v5-brand)" fill-opacity="0.65" letter-spacing="5" font-family="ui-monospace, monospace">CLOUD SHARE</SvgText>
          <!-- i18n-en-ok: 同上,丝印第二行 -->
          <SvgText x="386" y="212" text-anchor="middle" font-size="10" font-weight="600" fill="var(--v5-ink-3)" letter-spacing="3" font-family="ui-monospace, monospace">DISTRIBUTED · NO HARDWARE</SvgText>
        </g>

        <g v-for="(n, i) in cloudNodes" :key="i">
          <rect :x="n.x - 30" :y="n.y - 18" width="60" height="36" rx="4" fill="#15181E" stroke="var(--v5-brand)" stroke-opacity="0.5" stroke-width="1" />
          <line v-for="(dx, j) in pinDx" :key="`t-${j}`" :x1="n.x + dx" :y1="n.y - 18" :x2="n.x + dx" :y2="n.y - 22" stroke="#2A2F38" stroke-width="0.8" />
          <line v-for="(dx, j) in pinDx" :key="`b-${j}`" :x1="n.x + dx" :y1="n.y + 18" :x2="n.x + dx" :y2="n.y + 22" stroke="#2A2F38" stroke-width="0.8" />
          <SvgText :x="n.x" :y="n.y + 4" text-anchor="middle" font-size="13" font-weight="600" fill="var(--v5-brand)" letter-spacing="2" font-family="ui-monospace, monospace">{{ n.label }}</SvgText>
          <circle :cx="n.x" :cy="n.y - 26" r="2.3" fill="var(--v5-brand)"><animate attributeName="opacity" values="1;0.2;1" :dur="`${1.8 + i * 0.3}s`" repeatCount="indefinite" /></circle>
        </g>
      </svg>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import SvgText from "@/components/svg-text";

const props = defineProps<{ tier: "Entry" | "Pro" | "Flagship" | "Share" }>();

const PHOTO_MAP: Record<string, { src: string; tierCode: string } | null> = {
  Entry: { src: "/static/img/products/nexgridbox-s1-v4.png", tierCode: "S1" },
  Pro: { src: "/static/img/products/nexgridbox-pro-v2.png", tierCode: "Pro" },
  Flagship: { src: "/static/img/products/nexgridrack-p1-v2.png", tierCode: "Rack P1" },
  Share: null,
};

const photo = computed(() => PHOTO_MAP[props.tier] ?? null);

const cloudNodes = [
  { x: 160, y: 92, label: "GPU" },
  { x: 600, y: 95, label: "CPU" },
  { x: 180, y: 260, label: "RAM" },
  { x: 580, y: 255, label: "SSD" },
];
const pinDx = [-25, -16, -7, 2, 11, 21];

// aspect-square hero (source render uses the aspect-square utility class)
const rootStyle: CSSProperties = { aspectRatio: "1 / 1" };
const bgStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(135deg, #101216 0%, #0A0B0E 60%, #000000 100%)",
};
const tiltLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  transformOrigin: "center center",
  animation: "v5-product-tilt 9s ease-in-out infinite alternate",
  willChange: "transform",
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
const cloudGlowStyle: CSSProperties = {
  position: "absolute",
  top: "-48px",
  left: "50%",
  transform: "translateX(-50%)",
  width: "224px",
  height: "224px",
  borderRadius: "50%",
  background: "color-mix(in srgb, var(--v5-brand) 12%, transparent)",
  filter: "blur(48px)",
  pointerEvents: "none",
};
</script>
