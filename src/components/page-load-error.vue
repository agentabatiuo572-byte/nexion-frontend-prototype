<template>
  <view class="page-load-error" role="alert">
    <text class="page-load-error__title">{{ t.pageLoad[kind] }}</text>
    <text class="page-load-error__body">{{ kind === "module" ? t.pageLoad.staleVersionHint : t.pageLoad.recoveryHint }}</text>
    <view class="page-load-error__cta" role="button" tabindex="0" :aria-disabled="reloading"
      @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">
      <text>{{ reloading ? t.pageLoad.reloading : t.pageLoad.retry }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useT } from "@/i18n/use-t";
import { classifyPageLoadError, createPageReload } from "@/lib/page-load-recovery";

const props = defineProps<{ error?: unknown }>();
const t = useT();
const kind = computed(() => classifyPageLoadError(props.error));
const reloading = ref(false);
// Re-enter normal app startup and its authentication/legal guards at the exact
// current URL. No automatic reload loop, redirect, cache purge or stored payload.
const reload = createPageReload(() => window.location.reload());
function retry() {
  if (reloading.value) return;
  reloading.value = reload();
}
</script>

<style scoped>
.page-load-error {
  box-sizing: border-box;
  min-height: 60vh;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  color: var(--text, #eeeeef);
}
.page-load-error__title { font-size: 20px; }
.page-load-error__body { max-width: 30em; font-size: 13px; line-height: 19px; }
.page-load-error__cta {
  min-height: 44px;
  padding: 10px 24px;
  border: 1px solid currentColor;
  border-radius: 10px;
  color: inherit;
  display: grid;
  place-items: center;
}
.page-load-error__cta[aria-disabled="true"] { opacity: 0.6; }
</style>
