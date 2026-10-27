import { computed, shallowRef, watchEffect } from "vue";
import { remoteApiEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";
import { liveShadowNEX, liveShadowUSD, useFreeTrial } from "@/store/free-trial";
import { computeTrialOffset, resolveTrialCheckoutProductId, resolveTrialDeviceName, useTrialConfig, type TrialConfig } from "@/store/trial-config";
import type { TrialRowSnapshot } from "@/store/trial-boundary";
import { useNow } from "./use-now";

/** A retained row is presentation only. Mutations must still require a fresh authority. */
export function useTrialPresentation() {
  const app = useApp();
  const trial = useFreeTrial();
  const trialConfig = useTrialConfig();
  const now = useNow();
  const retained = shallowRef<(TrialRowSnapshot & { config: TrialConfig }) | null>(null);
  let binding = `${app.accountKey}:${app.accountBindingEpoch}`;
  const presentationReady = computed(() => !remoteApiEnabled || trial.authorityStatus === "ready"
    || (trial.authorityStatus === "loading" && trial.authorityServerState !== null));
  const actionsReady = computed(() => !remoteApiEnabled || trial.authorityStatus === "ready");

  // Run after the store finishes applying/clearing a receipt. A synchronous
  // observer could retain the intermediate `none` row while a failed read clears.
  watchEffect(() => {
    const nextBinding = `${app.accountKey}:${app.accountBindingEpoch}`;
    if (binding !== nextBinding) {
      retained.value = null;
      binding = nextBinding;
    }
    if (presentationReady.value) retained.value = { ...trial.snapshot(), config: { ...trialConfig.config } };
  });

  const status = computed(() => retained.value?.status ?? null);
  const active = computed(() => status.value === "active" || status.value === "grace");
  const config = computed(() => presentationReady.value ? retained.value?.config ?? null : null);
  const deviceName = computed(() => retained.value
    ? resolveTrialDeviceName(retained.value.config.trialProductId, retained.value.config.trialProductName) : null);
  const productId = computed(() => retained.value ? resolveTrialCheckoutProductId(retained.value.config.trialProductId) : null);
  const reservedSlots = computed(() => presentationReady.value ? (active.value ? 1 : 0) : null);
  const remainingMs = computed(() => {
    if (!presentationReady.value || !retained.value) return null;
    const boundary = status.value === "active" ? retained.value.expiresAt
      : status.value === "grace" ? retained.value.graceEndsAt : null;
    return boundary === null ? null : Math.max(0, boundary - now.value * 1000);
  });
  const shadowUSD = computed(() => presentationReady.value ? liveShadowUSD(now.value * 1000) : null);
  const shadowNEX = computed(() => presentationReady.value ? liveShadowNEX(now.value * 1000) : null);
  const localOffset = computed(() => config.value && shadowUSD.value !== null
    ? computeTrialOffset(config.value, shadowUSD.value) : null);
  // Remote credit is a claim-owned amount. The current promotion policy cannot
  // reconstruct it when the server has not supplied a confirmed projection.
  const offsetUSD = computed(() => !presentationReady.value ? null : remoteApiEnabled
    ? trial.authoritativeOffsetUSD : localOffset.value?.offsetUSD ?? null);
  const remainderUSD = computed(() => !presentationReady.value ? null : remoteApiEnabled
    ? trial.authoritativeRemainderUSD : localOffset.value?.remainderUSD ?? null);
  const estimatedUSD = computed(() => {
    const row = retained.value;
    if (!presentationReady.value || !row || !config.value) return null;
    const duration = !remoteApiEnabled && row.startedAt !== null && row.expiresAt !== null
      ? Math.max(0, row.expiresAt - row.startedAt) / 86_400_000 : config.value.trialDays;
    return duration * config.value.shadowDailyUSD;
  });
  const estimatedOffsetUSD = computed(() => config.value && estimatedUSD.value !== null
    ? computeTrialOffset(config.value, estimatedUSD.value).offsetUSD : null);
  const offsetProgress = computed(() => offsetUSD.value === null || estimatedOffsetUSD.value === null
    ? null : estimatedOffsetUSD.value > 0 ? Math.min(1, offsetUSD.value / estimatedOffsetUSD.value) : 0);

  return {
    presentationReady, actionsReady, status, active, config, deviceName, productId, reservedSlots,
    remainingMs, shadowUSD, shadowNEX, offsetUSD, remainderUSD, estimatedUSD, estimatedOffsetUSD, offsetProgress,
    refresh: () => trial.poll(Date.now()),
  };
}
