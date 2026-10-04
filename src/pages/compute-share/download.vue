<template>
  <AppChassis active="earn">
    <view v-if="gatePhase === 'pending'" class="mx-4" style="padding-top: 24px; color: var(--v5-ink)" role="status" aria-live="polite" aria-busy="true" data-proof="compute-share-config-pending">
      <text class="block" :style="headlineStyle">{{ t.computeShare.configLoadingTitle }}</text>
      <text class="block" :style="bodyStyle">{{ t.computeShare.configLoadingBody }}</text>
    </view>
    <view v-else-if="gatePhase === 'failed'" class="mx-4" style="padding-top: 24px; color: var(--v5-ink)" role="status" aria-live="assertive" data-proof="compute-share-config-failed">
      <text class="block" :style="headlineStyle">{{ t.computeShare.configUnavailableTitle }}</text>
      <text class="block" :style="bodyStyle">{{ t.computeShare.configUnavailableBody }}</text>
      <view :style="devicesButtonStyle" role="button" tabindex="0" :aria-label="t.computeShare.configRetryCta" @click="retryConfigGate" @keydown.enter.prevent="retryConfigGate" @keydown.space.prevent="retryConfigGate">
        <text>{{ t.computeShare.configRetryCta }}</text>
      </view>
    </view>
    <view v-else-if="enabled" class="pb-8" style="color: var(--v5-ink)">
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
          <view :style="downloadButtonStyle" role="button" tabindex="0" :aria-label="t.computeShare.downloadCta" @click="copyDownloadUrl">
            <text>{{ downloadUrl ? t.computeShare.downloadCta : t.computeShare.downloadPending }}</text>
          </view>
          <view :style="devicesButtonStyle" role="button" tabindex="0" :aria-label="t.computeShare.goDevicesCta" @click="goDevices">
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
        <!-- 显卡型号是互斥单选(选一个,其余取消)。原先 role="button" + aria-pressed 被浏览器
             当 toggle button,读屏按复选框朗读(zentao #94)。改 radiogroup/radio + aria-checked
             + roving tabindex + 左右方向键。 -->
        <view class="grid" style="grid-template-columns: 1fr 1fr; gap: 8px" role="radiogroup" :aria-label="t.computeShare.modelLabel">
          <view
            v-for="(model, mi) in GPU_MODEL_PRESETS"
            :key="model"
            :style="modelButtonStyle(model)"
            role="radio"
            :tabindex="selectedModel === model ? 0 : -1"
            :aria-label="model"
            :aria-checked="selectedModel === model ? 'true' : 'false'"
            @click="selectedModel = model"
            @keydown.enter.prevent="selectedModel = model"
            @keydown.space.prevent="selectedModel = model"
            @keydown.left.prevent="moveModel(mi, -1)"
            @keydown.right.prevent="moveModel(mi, 1)"
          >
            <text>{{ model }}</text>
          </view>
        </view>

        <view class="mt-3" :style="tierSummaryStyle">
          <text>{{ tierSummary }}</text>
        </view>

        <view v-if="remoteApiEnabled && enrollment" class="mt-3" :style="pairingStyle" data-proof="compute-share-server-pairing">
          <view class="flex items-center justify-between" style="gap: 12px">
            <view class="min-w-0">
              <text class="block" :style="pairingLabelStyle">{{ t.computeShare.pairingLabel }}</text>
              <text v-if="enrollment.pairingCode" class="block" :style="pairingCodeStyle">{{ enrollment.pairingCode }}</text>
              <text v-else class="block" :style="pairingCodeStyle">{{ pairingStatusLabel }}</text>
            </view>
            <view v-if="enrollment.pairingCode" :style="copyCodeStyle" role="button" tabindex="0" :aria-label="t.computeShare.copyPairingCode" @click="copyPairingCode">
              <text>{{ t.computeShare.copyPairingCode }}</text>
            </view>
          </view>
          <text class="block" :style="pairingBodyStyle">{{ pairingStatusText }}</text>
          <text class="block" :style="pairingNoStyle">{{ enrollment.enrollmentNo }}</text>
        </view>

        <view
          :style="connectButtonStyle"
          :data-disabled="slotsFull || connecting || enrollment?.status === 'PENDING'"
          role="button"
          tabindex="0"
          :aria-disabled="slotsFull || connecting || enrollment?.status === 'PENDING' ? 'true' : 'false'"
          :aria-label="connectButtonText"
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
import { navReplace, navTo } from "@/lib/route";
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useLocaleStore } from "@/store/locale";
import { trialReservesSlotNow } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { matchGpuTier } from "@/lib/gpu-tiers";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { computeShareApi, remoteApiEnabled } from "@/api/runtime";
import type { ComputeShareEnrollment } from "@/api/compute-share-api";
import { isAmbiguousOutcome } from "@/api/errors";
import { createComputeShareEnrollmentJournal } from "./enrollment-recovery";
import { enrollmentStatusLabel } from "./enrollment-status-view";
import { createComputeSharePairingHandoff } from "./pairing-handoff";
import {
  preserveInMemoryPairingCode,
  runComputeShareEnrollmentFlow,
  type InMemoryComputeSharePairingCode,
} from "./enrollment-flow";
import { createComputeShareDownloadGate, type ComputeShareDownloadGatePhase } from "./download-gate";

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
/** 单选组的左右方向键:移一格并选上,焦点跟到新选中项(zentao #94,与 earn.vue moveRange 同形)。 */
function moveModel(index: number, delta: number): void {
  const next = GPU_MODEL_PRESETS[(index + delta + GPU_MODEL_PRESETS.length) % GPU_MODEL_PRESETS.length];
  if (!next) return;
  selectedModel.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  });
}
const enrollment = ref<ComputeShareEnrollment | null>(null);
const connecting = ref(false);
const gatePhase = ref<ComputeShareDownloadGatePhase>("pending");
let accountGeneration = 0;
let lifecycleGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let inMemoryPairingCode: InMemoryComputeSharePairingCode | null = null;
const enrollmentJournal = createComputeShareEnrollmentJournal({
  read: () => uni.getStorageSync("nexgrid.compute-share.enrollment.v1"),
  write: (value) => uni.setStorageSync("nexgrid.compute-share.enrollment.v1", value),
  remove: () => uni.removeStorageSync("nexgrid.compute-share.enrollment.v1"),
});
const downloadUrl = computed(() => cfg.config.computeShare.downloadUrl.trim());
function isComputeShareReady(featureEnabled: boolean, installerUrl: string): boolean {
  if (!featureEnabled || !installerUrl.startsWith("https://")) return false;
  try {
    const parsed = new URL(installerUrl);
    return parsed.protocol === "https:" && Boolean(parsed.hostname)
      && !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}
const enabled = computed(() => isComputeShareReady(cfg.isEnabled("computeShareEnabled"), downloadUrl.value));
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
const slotsFull = computed(() => app.activeSlotCount + trialSlot.value >= app.slotCap);
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
const pairingStatusLabel = computed(() => enrollment.value
  ? enrollmentStatusLabel(enrollment.value.status, t.value.computeShare)
  : "");
const connectButtonText = computed(() => {
  if (slotsFull.value) return t.value.computeShare.slotsFullCta;
  if (connecting.value) return t.value.computeShare.connectingCta;
  if (enrollment.value?.status === "PENDING") return t.value.computeShare.waitingPairCta;
  return t.value.computeShare.connectCta;
});

function clearPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function suspendRemoteWork() {
  lifecycleGeneration += 1;
  // A late create flow is scoped out by the increment. Clear its visual lock
  // now so a later authoritative config recovery can resume the retained,
  // idempotent journal instead of staying permanently "connecting".
  connecting.value = false;
  clearPolling();
}

function closeDisabled() {
  inMemoryPairingCode = null;
  toast.info(t.value.computeShare.disabledToast);
  navReplace("/pages/me/devices");
}

const downloadGate = createComputeShareDownloadGate({
  status: () => cfg.configStatus,
  enabled: () => enabled.value,
  settle: () => cfg.ensureLoaded(),
  setPhase: (phase) => { gatePhase.value = phase; },
  suspend: suspendRemoteWork,
  redirectDisabled: closeDisabled,
  resume: () => {
    if (remoteApiEnabled) void resumeRemoteEnrollment(String(app.accountKey), accountGeneration, lifecycleGeneration);
  },
});

function retryConfigGate() {
  if (gatePhase.value === "failed") void downloadGate.retry();
}

onMounted(() => {
  lifecycleGeneration += 1;
  void downloadGate.mount();
});
onUnmounted(() => {
  suspendRemoteWork();
  downloadGate.unmount();
  inMemoryPairingCode = null;
});
watch(() => [cfg.configStatus, enabled.value] as const, () => {
  downloadGate.reconcile();
});
watch(() => String(app.accountKey), (next, previous) => {
  if (next === previous) return;
  accountGeneration += 1;
  connecting.value = false;
  enrollment.value = null;
  inMemoryPairingCode = null;
  clearPolling();
  if (remoteApiEnabled && gatePhase.value === "ready" && enabled.value) {
    void resumeRemoteEnrollment(next, accountGeneration, lifecycleGeneration);
  }
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

// IDEMPOTENCY-FRESH-OK: 仅在账号当前没有 pending 意图时铸键，随后持久化并跨重试复用。
function newEnrollmentKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `compute-share-${suffix}`;
}

function isCurrent(expectedAccount: string, expectedGeneration: number, expectedLifecycle: number): boolean {
  return expectedAccount === String(app.accountKey)
    && expectedGeneration === accountGeneration
    && expectedLifecycle === lifecycleGeneration;
}

async function adoptEnrollment(
  candidate: ComputeShareEnrollment,
  expectedAccount: string,
  expectedGeneration: number,
  expectedLifecycle: number,
) {
  if (!isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) return;
  const preserved = preserveInMemoryPairingCode(candidate, inMemoryPairingCode, expectedAccount);
  const next = preserved.enrollment;
  inMemoryPairingCode = preserved.pairingCode;
  enrollment.value = next;
  if (next.status === "CONNECTED") {
    enrollmentJournal.clear(expectedAccount);
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    await app.refreshRemoteFleet();
    if (!isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) return;
    toast.success(fmt(t.value.computeShare.connectedToast, { tier: selectedTierLabel.value }));
    navTo("/pages/me/devices");
    return;
  }
  if (next.status === "EXPIRED") {
    enrollmentJournal.clear(expectedAccount);
    return;
  }
  scheduleStatusPoll(next.enrollmentNo, expectedAccount, expectedGeneration, expectedLifecycle);
}

function scheduleStatusPoll(
  enrollmentNo: string,
  expectedAccount: string,
  expectedGeneration: number,
  expectedLifecycle: number,
) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (!isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) return;
    try {
      await adoptEnrollment(
        await computeShareApi.status(enrollmentNo), expectedAccount, expectedGeneration, expectedLifecycle,
      );
    } catch {
      if (isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) {
        scheduleStatusPoll(enrollmentNo, expectedAccount, expectedGeneration, expectedLifecycle);
      }
    }
  }, 3_000);
}

async function resumeRemoteEnrollment(expectedAccount: string, expectedGeneration: number, expectedLifecycle: number) {
  if (!isCurrent(expectedAccount, expectedGeneration, expectedLifecycle) || !enabled.value || connecting.value) return;
  const stored = enrollmentJournal.read(expectedAccount);
  if (stored.kind !== "ok" || !stored.pending) return;
  selectedModel.value = stored.pending.requestedGpuModel;
  await createRemoteEnrollment(expectedAccount, expectedGeneration, expectedLifecycle);
}

async function createRemoteEnrollment(
  expectedAccount = String(app.accountKey),
  expectedGeneration = accountGeneration,
  expectedLifecycle = lifecycleGeneration,
) {
  if (connecting.value || !isCurrent(expectedAccount, expectedGeneration, expectedLifecycle) || !enabled.value) return;
  connecting.value = true;
  try {
    const result = await runComputeShareEnrollmentFlow({
      accountKey: expectedAccount,
      requestedGpuModel: selectedModel.value,
      journal: enrollmentJournal,
      createKey: newEnrollmentKey,
      isCurrent: () => isCurrent(expectedAccount, expectedGeneration, expectedLifecycle),
      isEnabled: () => enabled.value,
      create: computeShareApi.create,
      status: computeShareApi.status,
    });
    if (result.kind === "enrollment") {
      await adoptEnrollment(result.enrollment, expectedAccount, expectedGeneration, expectedLifecycle);
    } else if (isCurrent(expectedAccount, expectedGeneration, expectedLifecycle) && enabled.value) {
      toast.warn(result.kind === "recovery-required" ? t.value.computeShare.recoveryRequired : t.value.computeShare.pairingFailed);
    }
  } catch (cause) {
    if (!isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) return;
    // Once an enrollment number is known, recovery must query it; otherwise replay the retained key.
    const stored = enrollmentJournal.read(expectedAccount);
    if (!isAmbiguousOutcome(cause) && stored.kind === "ok" && !stored.pending?.enrollmentNo) {
      enrollmentJournal.clear(expectedAccount);
    }
    console.warn("[compute-share] pairing failed:", cause);
    toast.warn(t.value.computeShare.pairingFailed);
  } finally {
    if (isCurrent(expectedAccount, expectedGeneration, expectedLifecycle)) connecting.value = false;
  }
}

function connectDemoComputer() {
  if (!enabled.value) {
    toast.warn(t.value.computeShare.disabledToast);
    return;
  }
  if (slotsFull.value) {
    toast.warn(fmt(t.value.computeShare.slotsFullToast, { max: app.slotCap }));
    return;
  }
  if (connecting.value || enrollment.value?.status === "PENDING") return;
  if (!remoteApiEnabled) {
    const result = app.connectComputeShareDevice(selectedModel.value, trialSlot.value);
    if (!result.ok) {
      const msg = result.reason === "disabled"
        ? t.value.computeShare.disabledToast
        : fmt(t.value.computeShare.slotsFullToast, { max: app.slotCap });
      toast.warn(msg);
      return;
    }
    toast.success(fmt(t.value.computeShare.connectedToast, { tier: selectedTierLabel.value }));
    navTo("/pages/me/devices");
    return;
  }
  const accountKey = String(app.accountKey);
  void createRemoteEnrollment(accountKey, accountGeneration, lifecycleGeneration);
}

function copyPairingCode() {
  if (!enrollment.value?.pairingCode) return;
  let payload = "";
  try {
    payload = createComputeSharePairingHandoff({
      enrollmentNo: enrollment.value.enrollmentNo,
      pairingCode: enrollment.value.pairingCode,
      requestedGpuModel: enrollment.value.requestedGpuModel,
      expiresAt: enrollment.value.expiresAt,
    });
  } catch {
    toast.warn(t.value.computeShare.pairingFailed);
    return;
  }
  uni.setClipboardData({
    data: payload,
    success: () => toast.success(t.value.computeShare.pairingCodeCopied),
    fail: () => toast.info(payload),
  });
}

function goDevices() {
  navTo("/pages/me/devices");
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
const pairingNoStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  wordBreak: "break-all",
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
  background: slotsFull.value || connecting.value || enrollment.value?.status === "PENDING"
    ? "var(--v5-surface-3)" : "var(--v5-brand)",
  color: slotsFull.value || connecting.value || enrollment.value?.status === "PENDING"
    ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
}));
</script>
