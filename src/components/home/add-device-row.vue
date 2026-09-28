<!-- Empty fleet bay keeps the authoritative upgrade target and remains one keyboard action. -->
<template>
  <view class="hf-add-device nx-home-glass-item" role="button" tabindex="0" :aria-label="t.earn.addDevice" @click="go">
    <view class="hf-add-surface nx-home-glass-panel" aria-hidden="true" />
    <view class="hf-add-art" aria-hidden="true">
      <view class="hf-add-plus">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 12h14m-7-7v14" /></svg>
      </view>
      <view class="nx-home-empty-plinth" />
    </view>
    <text class="hf-add-title">{{ t.earn.addDevice }}</text>
    <view class="nx-home-arrow" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useApp } from "@/store/app";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { derivePromoUpgrade } from "@/store/device-types";

const app = useApp();
const t = useT();
const promo = computed(() => derivePromoUpgrade(app.visibleDevices));

function go() {
  navTo(`/pages/store/detail?id=${promo.value.targetKind}`);
}
</script>

<style scoped>
.hf-add-device { min-width: 0; min-height: 192px; padding: 12px 14px 18px; border-radius: var(--v5-radius-xl); display: flex; flex-direction: column; }
.hf-add-surface { position: absolute; inset: 0; border: 1px dashed var(--v5-border-strong); border-radius: inherit; pointer-events: none; }
.hf-add-art { position: relative; display: grid; place-items: center; height: 130px; width: 100%; }
.hf-add-plus { position: relative; z-index: 1; display: grid; place-items: center; width: 64px; height: 64px; margin-top: 2px; border-radius: var(--v5-radius-full); background: linear-gradient(145deg, var(--v5-liquid-highlight), transparent 55%), color-mix(in srgb, var(--v5-surface-2) 36%, transparent); box-shadow: inset 0 0 0 .5px color-mix(in srgb, var(--v5-ink-3) 32%, transparent), inset 0 1px 1px var(--v5-liquid-highlight); color: var(--v5-ink-2); }
.hf-add-title { position: relative; display: block; margin-top: auto; padding-right: 28px; font: 500 13px/1.4 var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.hf-add-device .nx-home-arrow { position: absolute; right: 10px; bottom: 18px; width: 28px; height: 28px; }
@media (max-width: 350px) {
  .hf-add-title { padding-right: 0; }
  .hf-add-device .nx-home-arrow { display: none; }
}
</style>
