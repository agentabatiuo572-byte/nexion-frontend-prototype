<!--
  CopyCodeButton — compact copy affordance for long codes (order numbers,
  refund and withdrawal references). Copies the exact value, toasts once and
  shows a check for a moment. Click stops propagation so it can sit inside a
  tappable row. Enter/Space come from the platform a11y-activate layer.
-->
<template>
  <view
    class="copy-code-button"
    role="button"
    tabindex="0"
    :aria-label="`${t.ui.copy} ${label}`"
    @click.stop="copy"
  >
    <svg v-if="copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { useT } from "@/i18n/use-t";
import { copyText } from "@/lib/share";
import { toast } from "@/store/ui";

const props = defineProps<{ value: string; label: string }>();
const t = useT();
const copied = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

async function copy(): Promise<void> {
  if (!props.value || !(await copyText(props.value))) return;
  copied.value = true;
  toast.success(t.value.ui.copied);
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    copied.value = false;
    resetTimer = null;
  }, 1400);
}

onUnmounted(() => {
  if (resetTimer) clearTimeout(resetTimer);
});
</script>

<style scoped>
.copy-code-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: -6px -6px -6px 0;
  border-radius: 8px;
  color: var(--v5-ink-3);
}
.copy-code-button:active {
  background: color-mix(in srgb, var(--v5-ink) 8%, transparent);
}
</style>
