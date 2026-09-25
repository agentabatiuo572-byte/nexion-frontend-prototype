<template>
  <view
    v-if="visible"
    class="nx-funds-sandbox-badge"
    data-testid="funds-sandbox-badge"
    role="status"
    aria-live="polite"
    style="margin: 0 16px 12px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--v5-warning) 36%, transparent); border-radius: 12px; background: var(--v5-warning-soft); text-align: center"
  >
    <text style="font-size: 12px; font-weight: 600; color: var(--v5-warning)">{{ t.publicCopy.experienceMode }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { mockFundsEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";
import { useT } from "@/i18n/use-t";

const app = useApp();
const t = useT();

// Runtime must explicitly select the sandbox and the authenticated GET
// /api/app/wallet/sandbox response must have passed the strict parser. Either
// missing or contradictory input leaves this hidden, so production cannot gain
// a mock label by configuration or stale client state alone.
const visible = computed(() => {
  const evidence = app.fundsSandboxEvidence;
  return mockFundsEnabled
    && app.fundsSandboxStatus === "ready"
    && evidence?.source === "mock"
    && evidence.sourceEnvironment === "SANDBOX"
    && evidence.mode === "LOCAL_SANDBOX";
});
</script>
