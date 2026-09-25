<template>
  <AppChassis active="earn">
    <view v-if="enabled" class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/devices" :title="downloadTitle" />

      <view class="mx-4" :style="heroStyle" data-proof="compute-share-download-page">
        <text class="block" :style="eyebrowStyle">{{ t.computeShare.downloadEyebrow }}</text>
        <text class="block" :style="headlineStyle">{{ downloadTitle }}</text>
        <text class="block" :style="bodyStyle">{{ downloadGuide }}</text>

        <view :style="urlBoxStyle">
          <text :style="urlLabelStyle">{{ t.computeShare.urlLabel }}</text>
          <text class="block" :style="urlValueStyle">{{ downloadUrl || t.computeShare.urlPending }}</text>
        </view>

        <view class="flex items-center" style="gap: 8px; margin-top: 12px">
          <view :style="downloadButtonStyle" @click="copyDownloadUrl">
            <text>{{ downloadUrl ? t.computeShare.downloadCta : t.computeShare.downloadPending }}</text>
          </view>
          <view :style="devicesButtonStyle" @click="goDevices">
            <text>{{ t.computeShare.goDevicesCta }}</text>
          </view>
        </view>
      </view>

      <view class="mx-4" :style="demoStyle">
        <view class="flex items-start justify-between" style="gap: 12px">
          <view class="min-w-0">
            <text class="block" :style="demoLabelStyle">{{ t.computeShare.demoLabel }}</text>
            <text class="block" :style="demoTitleStyle">{{ t.computeShare.demoTitle }}</text>
            <text class="block" :style="demoBodyStyle">{{ t.computeShare.demoBody }}</text>
          </view>
          <text :style="tierPillStyle">{{ selectedTierLabel }}</text>
        </view>

        <text class="block" :style="modelLabelStyle">{{ t.computeShare.modelLabel }}</text>
        <view class="grid" style="grid-template-columns: 1fr 1fr; gap: 8px">
          <view
            v-for="model in GPU_MODEL_PRESETS"
            :key="model"
            :style="modelButtonStyle(model)"
            @click="selectedModel = model"
          >
            <text>{{ model }}</text>
          </view>
        </view>

        <view class="mt-3" :style="tierSummaryStyle">
          <text>{{ tierSummary }}</text>
        </view>

        <view v-if="remoteApiEnabled && enrollment" class="mt-3" :style="pairingStyle" data-proof="compute-share-server-pairing">
          <view v-if="enrollment.pairingCode" class="flex items-center justify-between" style="gap: 12px">
            <view class="min-w-0">
              <text class="block" :style="pairingLabelStyle">{{ t.computeShare.pairingLabel }}</text>
              <text class="block" :style="pairingCodeStyle">{{ enrollment.pairingCode }}</text>
            </view>
            <view :style="copyCodeStyle" @click="copyPairingCode">
              <text>{{ t.computeShare.copyPairingCode }}</text>
            </view>
          </view>
          <text class="block" :style="pairingBodyStyle">{{ pairingStatusText }}</text>
        </view>

        <view
          :style="connectButtonStyle"
          :data-disabled="mockFundsEnabled || slotsFull || connecting || enrollment?.status === 'PENDING'"
          data-proof="compute-share-demo-connect"
          @click="connectDemoComputer"
        >
          <text>{{ connectButtonText }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useLocaleStore } from "@/store/locale";
import { MAX_DEVICES } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { matchGpuTier } from "@/lib/gpu-tiers";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { computeShareApi, mockFundsEnabled, remoteApiEnabled } from "@/api/runtime";
import type { ComputeShareEnrollment } from "@/api/compute-share-api";
import { isAmbiguousOutcome } from "@/api/errors";

const GPU_MODEL_PRESETS = [
  "Intel Iris Xe",
  "NVIDIA RTX 3060",
  "NVIDIA RTX 4070",
  "NVIDIA RTX 4090",
];

const app = useApp();
const cfg = useConfig();
const locale = useLocaleStore();
const t = useT();

const selectedModel = ref(GPU_MODEL_PRESETS[2]);
const enrollment = ref<ComputeShareEnrollment | null>(null);
const connecting = ref(false);
let accountGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
const enabled = computed(() => cfg.isEnabled("computeShareEnabled"));
const downloadUrl = computed(() => cfg.config.computeShare.downloadUrl.trim());
const downloadTitle = computed(() => {
  const content = cfg.config.computeShare.content;
  const configured = (locale.code === "zh" ? content.zhTitle : content.enTitle).trim();
  return configured || t.value.computeShare.downloadTitle;
});
const downloadGuide = computed(() => {
  const content = cfg.config.computeShare.content;
  const configured = (locale.code === "zh" ? content.zhGuide : content.enGuide).trim();
  return configured || t.value.computeShare.downloadBody;
});
const selectedTier = computed(() => matchGpuTier(selectedModel.value, cfg.config.computeShare.gpuTiers));
const tierLabels = computed(() => ({
  G1: t.value.computeShare.gpuTierG1,
  G2: t.value.computeShare.gpuTierG2,
  G3: t.value.computeShare.gpuTierG3,
  G4: t.value.computeShare.gpuTierG4,
  G5: t.value.computeShare.gpuTierG5,
  G6: t.value.computeShare.gpuTierG6,
}));
const selectedTierLabel = computed(() => tierLabels.value[selectedTier.value.id]);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsFull = computed(() => app.activeSlotCount + trialSlot.value >= MAX_DEVICES);
const tierSummary = computed(() =>
  fmt(t.value.computeShare.tierSummary, {
    tier: selectedTierLabel.value,
    tops: selectedTier.value.tops,
  }),
);
const pairingStatusText = computed(() => enrollment.value?.status === "CONNECTED"
  ? t.value.computeShare.pairingConnected
  : enrollment.value?.status === "EXPIRED"
    ? t.value.computeShare.pairingExpired
    : t.value.computeShare.pairingPending);
const connectButtonText = computed(() => {
  if (mockFundsEnabled) return t.value.computeShare.sandboxHoldCta;
  if (slotsFull.value) return t.value.computeShare.slotsFullCta;
  if (connecting.value) return t.value.computeShare.connectingCta;
  if (enrollment.value?.status === "PENDING") return t.value.computeShare.waitingPairCta;
  return t.value.computeShare.connectCta;
});

function guardDisabled() {
  if (enabled.value) return;
  toast.info(t.value.computeShare.disabledToast);
  uni.redirectTo({ url: "/pages/me/devices", fail: () => uni.reLaunch({ url: "/pages/me/devices", fail: () => {} }) });
}

onMounted(() => {
  guardDisabled();
  if (remoteApiEnabled && !mockFundsEnabled) void resumeRemoteEnrollment(String(app.accountKey), accountGeneration);
});
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
});
watch(enabled, guardDisabled);
watch(() => String(app.accountKey), (next, previous) => {
  if (next === previous) return;
  accountGeneration += 1;
  connecting.value = false;
  enrollment.value = null;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (remoteApiEnabled && !mockFundsEnabled) void resumeRemoteEnrollment(next, accountGeneration);
});

function copyDownloadUrl() {
  if (!enabled.value) {
    toast.info(t.value.computeShare.disabledToast);
    return;
  }
  if (!downloadUrl.value) {
    toast.info(t.value.computeShare.urlPending);
    return;
  }
  uni.setClipboardData({
    data: downloadUrl.value,
    success: () => toast.success(t.value.computeShare.downloadCopiedToast),
    fail: () => toast.info(downloadUrl.value),
  });
}

function storageScope(accountKey: string): string {
  return `nexgrid.compute-share.enrollment.${accountKey}`;
}

function readPending(accountKey: string): { requestedGpuModel: string; idempotencyKey: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageScope(accountKey)) ?? "null") as Record<string, unknown> | null;
    if (!value || typeof value.requestedGpuModel !== "string" || typeof value.idempotencyKey !== "string") return null;
    if (!value.requestedGpuModel.trim() || !value.idempotencyKey.trim()) return null;
    return { requestedGpuModel: value.requestedGpuModel.trim(), idempotencyKey: value.idempotencyKey.trim() };
  } catch {
    return null;
  }
}

function writePending(accountKey: string, value: { requestedGpuModel: string; idempotencyKey: string }) {
  try { localStorage.setItem(storageScope(accountKey), JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

function clearPending(accountKey: string) {
  try { localStorage.removeItem(storageScope(accountKey)); } catch { /* storage may be unavailable */ }
}

// IDEMPOTENCY-FRESH-OK: 仅在账号当前没有同型号 pending 意图时铸键，随后持久化并跨重试复用。
function newEnrollmentKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `compute-share-${suffix}`;
}

async function adoptEnrollment(next: ComputeShareEnrollment, expectedAccount: string, expectedGeneration: number) {
  if (expectedAccount !== String(app.accountKey) || expectedGeneration !== accountGeneration) return;
  enrollment.value = next;
  if (next.status === "CONNECTED") {
    clearPending(expectedAccount);
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    await app.refreshRemoteFleet();
    if (expectedAccount !== String(app.accountKey) || expectedGeneration !== accountGeneration) return;
    toast.success(fmt(t.value.computeShare.connectedToast, { tier: selectedTierLabel.value }));
    uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
    return;
  }
  if (next.status === "EXPIRED") {
    clearPending(expectedAccount);
    return;
  }
  scheduleStatusPoll(next.enrollmentNo, expectedAccount, expectedGeneration);
}

function scheduleStatusPoll(enrollmentNo: string, expectedAccount: string, expectedGeneration: number) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (expectedAccount !== String(app.accountKey) || expectedGeneration !== accountGeneration) return;
    try {
      await adoptEnrollment(await computeShareApi.status(enrollmentNo), expectedAccount, expectedGeneration);
    } catch {
      if (expectedAccount === String(app.accountKey) && expectedGeneration === accountGeneration) {
        scheduleStatusPoll(enrollmentNo, expectedAccount, expectedGeneration);
      }
    }
  }, 3_000);
}

async function resumeRemoteEnrollment(expectedAccount: string, expectedGeneration: number) {
  const pending = readPending(expectedAccount);
  if (!pending || connecting.value) return;
  selectedModel.value = pending.requestedGpuModel;
  await createRemoteEnrollment(pending, expectedAccount, expectedGeneration);
}

async function createRemoteEnrollment(
  pending?: { requestedGpuModel: string; idempotencyKey: string },
  expectedAccount = String(app.accountKey),
  expectedGeneration = accountGeneration,
) {
  if (connecting.value) return;
  const requestedGpuModel = selectedModel.value.trim();
  const retained = readPending(expectedAccount);
  const intent = pending
    ?? (retained?.requestedGpuModel === requestedGpuModel ? retained : null)
    ?? { requestedGpuModel, idempotencyKey: newEnrollmentKey() };
  writePending(expectedAccount, intent);
  connecting.value = true;
  try {
    await adoptEnrollment(await computeShareApi.create(intent.requestedGpuModel, intent.idempotencyKey), expectedAccount, expectedGeneration);
  } catch (cause) {
    if (expectedAccount !== String(app.accountKey) || expectedGeneration !== accountGeneration) return;
    if (!isAmbiguousOutcome(cause)) clearPending(expectedAccount);
    console.warn("[compute-share] pairing failed:", cause);
    toast.warn(t.value.computeShare.pairingFailed);
  } finally {
    if (expectedAccount === String(app.accountKey) && expectedGeneration === accountGeneration) connecting.value = false;
  }
}

function connectDemoComputer() {
  if (!enabled.value) {
    toast.warn(t.value.computeShare.disabledToast);
    return;
  }
  if (slotsFull.value) {
    toast.warn(fmt(t.value.computeShare.slotsFullToast, { max: MAX_DEVICES }));
    return;
  }
  if (mockFundsEnabled) {
    toast.info(t.value.computeShare.sandboxHoldBody);
    return;
  }
  if (connecting.value || enrollment.value?.status === "PENDING") return;
  if (!remoteApiEnabled) {
    const result = app.connectComputeShareDevice(selectedModel.value, trialSlot.value);
    if (!result.ok) {
      const msg = result.reason === "disabled"
        ? t.value.computeShare.disabledToast
        : fmt(t.value.computeShare.slotsFullToast, { max: MAX_DEVICES });
      toast.warn(msg);
      return;
    }
    toast.success(fmt(t.value.computeShare.connectedToast, { tier: selectedTierLabel.value }));
    uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
    return;
  }
  const accountKey = String(app.accountKey);
  void createRemoteEnrollment(readPending(accountKey) ?? undefined, accountKey, accountGeneration);
}

function copyPairingCode() {
  if (!enrollment.value?.pairingCode) return;
  uni.setClipboardData({
    data: enrollment.value.pairingCode,
    success: () => toast.success(t.value.computeShare.pairingCodeCopied),
    fail: () => toast.info(enrollment.value?.pairingCode ?? ""),
  });
}

function goDevices() {
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}

// De-carded: download hero sits on the page floor (accent border + tint
// gradient dropped). 2px optical inset aligns with the mx-4 gutter.
const heroStyle: CSSProperties = {
  padding: "0 2px",
};
const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-tech-cyan)",
  letterSpacing: "0.08em",
};
const headlineStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  lineHeight: 1.12,
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const bodyStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  lineHeight: 1.6,
  color: "var(--v5-ink-2)",
};
const urlBoxStyle: CSSProperties = {
  marginTop: "14px",
  borderRadius: "10px",
  background: "var(--v5-surface-2)",
  padding: "10px 12px",
};
const urlLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const urlValueStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  lineHeight: 1.35,
  color: "var(--v5-ink-2)",
  wordBreak: "break-all",
};
const downloadButtonStyle: CSSProperties = {
  flex: 1,
  minHeight: "44px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "var(--v5-tech-cyan)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
const devicesButtonStyle: CSSProperties = {
  minHeight: "44px",
  padding: "0 14px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-2)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
// De-carded: the demo panel sits on the floor as a second section; its mono
// eyebrow (demoLabel) opens the section. 20px section gap above.
const demoStyle: CSSProperties = {
  marginTop: "20px",
  padding: "0 2px",
};
const demoLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand)",
  letterSpacing: "0.06em",
};
const demoTitleStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const demoBodyStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  lineHeight: 1.45,
  color: "var(--v5-ink-3)",
};
const tierPillStyle: CSSProperties = {
  borderRadius: "999px",
  padding: "5px 8px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 14%, transparent)",
  color: "var(--v5-tech-cyan)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  flexShrink: 0,
};
const modelLabelStyle: CSSProperties = {
  marginTop: "14px",
  marginBottom: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-ink-2)",
};
function modelButtonStyle(model: string): CSSProperties {
  const on = selectedModel.value === model;
  return {
    minHeight: "42px",
    borderRadius: "10px",
    background: on ? "color-mix(in srgb, var(--v5-tech-cyan) 14%, transparent)" : "var(--v5-surface-2)",
    color: on ? "var(--v5-tech-cyan)" : "var(--v5-ink-2)",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    fontFamily: "var(--font-v5)",
    fontSize: "12px",
    fontWeight: 600,
    padding: "0 8px",
  };
}
const tierSummaryStyle: CSSProperties = {
  padding: "9px 10px",
  borderRadius: "10px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-3)",
  fontSize: "12px",
  lineHeight: 1.35,
};
const pairingStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 10%, var(--v5-surface-2))",
  border: "1px solid color-mix(in srgb, var(--v5-tech-cyan) 28%, transparent)",
};
const pairingLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const pairingCodeStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "26px",
  letterSpacing: "0.18em",
  color: "var(--v5-tech-cyan)",
};
const pairingBodyStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "var(--v5-ink-2)",
};
const copyCodeStyle: CSSProperties = {
  flexShrink: 0,
  padding: "8px 10px",
  borderRadius: "999px",
  background: "var(--v5-tech-cyan)",
  color: "var(--v5-on-brand)",
  fontSize: "12px",
  fontWeight: 600,
};
const connectButtonStyle = computed<CSSProperties>(() => ({
  marginTop: "12px",
  minHeight: "48px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: mockFundsEnabled || slotsFull.value || connecting.value || enrollment.value?.status === "PENDING"
    ? "var(--v5-surface-3)" : "var(--v5-brand)",
  color: mockFundsEnabled || slotsFull.value || connecting.value || enrollment.value?.status === "PENDING"
    ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
}));
</script>
