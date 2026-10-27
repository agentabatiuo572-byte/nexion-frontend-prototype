<template>
  <view
    :id="hostId" class="nx-liquid-glass" :class="[`nx-liquid-glass--${tone}`, { 'nx-liquid-glass--frosted': rendering !== 'refractive', 'nx-liquid-glass--sampled': rendering === 'sampled' }]"
    :style="{ borderRadius: radius + 'px', '--nx-material-blur': blur === undefined ? undefined : materialBlur + 'px' }" aria-hidden="true" data-glass-strategy="frosted"
    :glass-config="configuration" :change:glass-config="glassView.update"
  >
    <view class="nx-liquid-optics" />
    <view class="nx-liquid-tint" />
    <view class="nx-liquid-specular" />
    <view class="nx-liquid-rim" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";
import type { GlassConfiguration } from "@/lib/liquid-glass-renderer";
import type { GlassTone } from "@/lib/liquid-glass-core";
const props = withDefaults(defineProps<{ radius?: number; tone?: GlassTone; backdrop?: string; blur?: number; rendering?: "refractive" | "frosted" | "sampled" }>(), { radius: 24, tone: "control", backdrop: "", rendering: "refractive" });
const materialBlur = computed(() => Number.isFinite(props.blur) ? Math.max(0, Math.min(32, props.blur!)) : .75);
const hostId = `nx-glass-host-${getCurrentInstance()!.uid}`;
const configuration = computed<GlassConfiguration>(() => ({ hostId, radius: props.radius, tone: props.tone, backdrop: props.backdrop, blur: props.blur, rendering: props.rendering }));
// uni injects the renderjs module into template scope; vue-tsc does not know it.
declare const glassView: { update(value: GlassConfiguration): void };
</script>

<script module="glassView" lang="renderjs">
import glassViewImplementation from "@/lib/liquid-glass-view";
// @ts-expect-error vue-tsc 1.x treats uni's renderjs custom block as a second normal script.
export default glassViewImplementation;
</script>

<style>
.nx-liquid-glass { position: absolute; inset: 0; pointer-events: none; backdrop-filter: blur(var(--nx-material-blur, .75px)) saturate(110%); -webkit-backdrop-filter: blur(var(--nx-material-blur, .75px)) saturate(110%); }
/* APP icon SVGs have a view root; keep only later sibling icons above the decorative glass. */
:global(.nx-liquid-glass ~ .nx-native-svg) { position: relative; z-index: 1; }
.nx-liquid-optics, .nx-liquid-tint, .nx-liquid-specular, .nx-liquid-rim { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.nx-liquid-optics { overflow: hidden; }
.nx-liquid-tint { background: var(--v5-liquid-tint); box-shadow: var(--v5-liquid-shadow); }
.nx-liquid-specular { background-size: 100% 100%; mix-blend-mode: screen; opacity: .38; filter: blur(.35px); }
.nx-liquid-rim { box-shadow: inset 0 0 0 .5px var(--v5-liquid-rim), inset 0 1px 1px var(--v5-liquid-highlight), inset 0 -1px 1px var(--v5-liquid-bottom); }
.nx-liquid-glass--selection .nx-liquid-tint { background-color: color-mix(in srgb, var(--v5-liquid-tint) 45%, var(--v5-surface)); background-image: linear-gradient(var(--v5-liquid-selected), var(--v5-liquid-selected)); box-shadow: var(--v5-liquid-selection-shadow); }
.nx-liquid-glass--selection .nx-liquid-specular { opacity: .46; }
.nx-liquid-glass[data-glass-strategy="webgl"], .nx-liquid-glass[data-glass-strategy="solid"] { backdrop-filter: none; -webkit-backdrop-filter: none; }
.nx-liquid-glass[data-glass-strategy="solid"] .nx-liquid-optics { background: var(--v5-surface); }
.nx-liquid-glass[data-glass-strategy="solid"] .nx-liquid-specular { display: none; }
/* Frost is a single painted surface: tint, highlights and rim share the same
   backdrop instead of compositing separate translucent children over it. */
.nx-liquid-glass--frosted {
  overflow: hidden;
  backdrop-filter: blur(var(--nx-material-blur, 18px)) saturate(135%);
  -webkit-backdrop-filter: blur(var(--nx-material-blur, 18px)) saturate(135%);
  background-color: var(--v5-liquid-tint);
  background-image: linear-gradient(155deg, rgba(255,255,255,.1), transparent 22%, transparent 78%, rgba(255,255,255,.038));
  box-shadow: var(--v5-liquid-shadow), inset 0 0 0 .5px var(--v5-liquid-rim), inset 0 1px 1px var(--v5-liquid-highlight), inset 0 -1px 1px var(--v5-liquid-bottom);
}
.nx-liquid-glass--frosted > .nx-liquid-optics,
.nx-liquid-glass--frosted > .nx-liquid-tint,
.nx-liquid-glass--frosted > .nx-liquid-specular,
.nx-liquid-glass--frosted > .nx-liquid-rim { display: none; }
.nx-liquid-glass--frosted.nx-liquid-glass--selection {
  background-color: color-mix(in srgb, var(--v5-liquid-tint) 45%, var(--v5-surface));
  background-image: linear-gradient(var(--v5-liquid-selected), var(--v5-liquid-selected));
  box-shadow: var(--v5-liquid-selection-shadow), inset 0 0 0 .5px var(--v5-liquid-rim), inset 0 1px 1px var(--v5-liquid-highlight);
}
.nx-liquid-glass--frosted[data-glass-strategy="solid"] { background: var(--v5-surface); }
.nx-liquid-glass--frosted.nx-liquid-glass--selection[data-glass-strategy="solid"] {
  background-image: linear-gradient(var(--v5-liquid-selected), var(--v5-liquid-selected));
}
/* Composer only: a bounded scene copy is blurred as ordinary content. The
   tint/highlight/rim remain real glass layers, without a tiled backdrop capture. */
.nx-liquid-glass--sampled { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: transparent; box-shadow: none; }
.nx-liquid-sample { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
.nx-liquid-glass--sampled > .nx-liquid-tint,
.nx-liquid-glass--sampled > .nx-liquid-specular,
.nx-liquid-glass--sampled > .nx-liquid-rim { display: block; }
.nx-liquid-glass--sampled > .nx-liquid-specular { background-image: linear-gradient(155deg, rgba(255,255,255,.26), transparent 22%, transparent 78%, rgba(255,255,255,.1)); }
.nx-liquid-glass--sampled[data-glass-strategy="solid"] > .nx-liquid-sample { display: none; }
</style>
