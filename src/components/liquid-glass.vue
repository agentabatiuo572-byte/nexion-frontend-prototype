<template>
  <view
    :id="hostId" class="nx-liquid-glass" :class="`nx-liquid-glass--${tone}`"
    :style="{ borderRadius: radius + 'px' }" aria-hidden="true" data-glass-strategy="frosted"
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
const props = withDefaults(defineProps<{ radius?: number; tone?: GlassTone; backdrop?: string }>(), { radius: 24, tone: "control", backdrop: "" });
const hostId = `nx-glass-host-${getCurrentInstance()!.uid}`;
const configuration = computed<GlassConfiguration>(() => ({ hostId, radius: props.radius, tone: props.tone, backdrop: props.backdrop }));
// uni injects the renderjs module into template scope; vue-tsc does not know it.
declare const glassView: { update(value: GlassConfiguration): void };
</script>

<script module="glassView" lang="renderjs">
import glassViewImplementation from "@/lib/liquid-glass-view";
// @ts-expect-error vue-tsc 1.x treats uni's renderjs custom block as a second normal script.
export default glassViewImplementation;
</script>

<style>
.nx-liquid-glass { position: absolute; inset: 0; pointer-events: none; backdrop-filter: blur(.75px) saturate(110%); -webkit-backdrop-filter: blur(.75px) saturate(110%); }
.nx-liquid-optics, .nx-liquid-tint, .nx-liquid-specular, .nx-liquid-rim { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.nx-liquid-optics { overflow: hidden; }
.nx-liquid-tint { background: var(--v5-liquid-tint); box-shadow: var(--v5-liquid-shadow); }
.nx-liquid-specular { background-size: 100% 100%; mix-blend-mode: screen; opacity: .72; }
.nx-liquid-rim { border: 1px solid var(--v5-liquid-rim); box-shadow: inset 0 1px 0 var(--v5-liquid-highlight), inset 0 -1px 0 var(--v5-liquid-bottom); }
.nx-liquid-glass--selection .nx-liquid-tint { background: var(--v5-liquid-selected); box-shadow: var(--v5-liquid-selection-shadow); }
.nx-liquid-glass--selection .nx-liquid-specular { opacity: .82; }
.nx-liquid-glass[data-glass-strategy="webgl"], .nx-liquid-glass[data-glass-strategy="solid"] { backdrop-filter: none; -webkit-backdrop-filter: none; }
.nx-liquid-glass[data-glass-strategy="solid"] .nx-liquid-optics { background: var(--v5-surface); }
.nx-liquid-glass[data-glass-strategy="solid"] .nx-liquid-specular { display: none; }
</style>
