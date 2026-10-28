<template>
  <view
    class="data-visibility-toggle"
    role="button"
    tabindex="0"
    :aria-label="label"
    :aria-pressed="visibility.hidden ? 'true' : 'false'"
    @click.stop="visibility.toggle()"
    @keydown.enter.stop.prevent="onKeydown"
    @keydown.space.stop.prevent="onKeydown"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path v-if="visibility.hidden" d="m3 3 18 18" />
    </svg>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDataVisibility } from "@/store/data-visibility";
import { useLocaleStore } from "@/store/locale";

const visibility = useDataVisibility();
const locale = useLocaleStore();
const copy = {
  zh: { hide: "隐藏资产、收益、算力和团队统计", show: "显示资产、收益、算力和团队统计" },
  en: { hide: "Hide assets, earnings, compute and team statistics", show: "Show assets, earnings, compute and team statistics" },
  vi: { hide: "Ẩn tài sản, thu nhập, sức mạnh tính toán và thống kê nhóm", show: "Hiện tài sản, thu nhập, sức mạnh tính toán và thống kê nhóm" },
};
const label = computed(() => {
  const text = copy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"];
  return visibility.hidden ? text.show : text.hide;
});

function onKeydown(event: KeyboardEvent) {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  visibility.toggle();
}
</script>

<style scoped>
.data-visibility-toggle {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 50%;
  color: var(--v5-ink-3);
  line-height: 0;
  cursor: pointer;
  touch-action: manipulation;
}
.data-visibility-toggle:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
}
</style>
