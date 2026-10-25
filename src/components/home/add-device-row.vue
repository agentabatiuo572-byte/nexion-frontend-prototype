<!-- Empty fleet bay shares the inventory choice with all general add-device entries. -->
<template>
  <view class="hf-add-device" role="button" tabindex="0" :aria-label="t.earn.addDevice" @click="go"  @keydown.enter.stop.prevent="go" @keydown.space.stop.prevent="go">
    <view class="hf-add-art" aria-hidden="true">
      <view class="hf-add-plus">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 12h14m-7-7v14" /></svg>
      </view>
      <view class="nx-home-empty-plinth" />
    </view>
    <text class="hf-add-title">{{ t.earn.addDevice }}</text>
    <view class="nx-home-arrow" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed } from "vue";
import { useApp } from "@/store/app";
import { derivePromoUpgrade } from "@/store/device-types";
import { resolveAddDeviceRoute } from "./add-device-route";

const app = useApp();
const promo = computed(() => derivePromoUpgrade(app.visibleDevices));

function go() {
  navTo(resolveAddDeviceRoute(promo.value.targetKind));
}

import { useT } from "@/i18n/use-t";
const t = useT();
</script>

<style scoped>
.hf-add-device { display: flex; align-items: center; gap: 12px; min-height: 64px; box-sizing:border-box; padding: 10px 16px; border-top: 1px solid var(--v5-border); color: var(--v5-ink-2); }
.hf-add-art { display: grid; place-items: center; width: 48px; height:48px; border:1px dashed var(--v5-border-strong); border-radius:14px; box-sizing:border-box; flex-shrink: 0; }
.hf-add-plus { display: grid; place-items: center; }
.hf-add-plus svg { width: 20px; height: 20px; }
.nx-home-empty-plinth { display: none; }
.hf-add-title { flex: 1; font: 500 15px/20px var(--font-v5); }
.hf-add-device .nx-home-arrow { width: 16px; display: flex;background:none;box-shadow:none; }
</style>