<!--
  DeviceDeactivateSheet — ported from Nexion-prototype/app/components/
  deactivate-sheet.tsx. Bottom sheet shown when the user deactivates a device
  that has a running task; forces an explicit wait / force / cancel choice.

  The source mounts this once at chassis level driven by a zustand store. uni
  has no root layout, so /me/devices renders it inline and drives it with a
  `device` prop (null = hidden). framer-motion enter/exit → CSS keyframes in
  tokens.css (nx-sheet-fade-in / nx-sheet-slide-up). The wait/force actions are
  composed by the page (emit), keeping the app-store mutation in the page handler.
-->
<template>
  <view v-if="device">
    <view class="nx-sheet-fade-in" :style="scrimStyle" @click="emit('dismiss')" />
    <view class="nx-sheet-slide-up" :style="sheetStyle">
      <view class="flex items-start justify-between" style="gap: 12px">
        <view class="min-w-0">
          <text class="block" :style="titleStyle">{{ t.deactivateSheet.title }}</text>
          <text class="block" :style="descStyle">{{ descLine }}</text>
        </view>
        <view class="grid place-items-center shrink-0 transition active:bg-[var(--v5-surface-3)]" :style="closeBtnStyle" @click="emit('dismiss')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- Task progress preview -->
      <view v-if="task" :style="taskCardStyle">
        <view class="flex items-center justify-between" style="gap: 8px">
          <view class="min-w-0 flex-1">
            <text class="block truncate" :style="taskModelStyle">{{ task.model }}</text>
            <text class="block truncate" :style="taskRewardStyle">{{ taskRewardLine }}</text>
          </view>
          <view class="text-right shrink-0">
            <text class="block" :style="pctStyle">{{ progressPct }}%</text>
            <text class="block" :style="etaStyle">{{ etaLine }}</text>
          </view>
        </view>
        <view :style="trackStyle">
          <view :style="fillStyle" />
        </view>
      </view>

      <!-- Actions -->
      <view style="margin-top: 16px">
        <view class="w-full flex items-center justify-center transition active:scale-[0.98]" :style="waitBtnStyle" @click="emit('wait')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <text :style="waitLabelStyle">{{ t.deactivateSheet.waitCta }}</text>
        </view>
        <view class="w-full flex items-center justify-center transition active:bg-[color-mix(in_srgb,var(--v5-brand-2)_25%,transparent)]" :style="forceBtnStyle" @click="emit('force')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>
          <text :style="forceLabelStyle">{{ t.deactivateSheet.forceCta }}</text>
        </view>
        <view class="w-full flex items-center justify-center transition active:bg-[var(--v5-surface-3)]" :style="backBtnStyle" @click="emit('dismiss')">
          <text :style="backLabelStyle">{{ t.deactivateSheet.backCta }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";

const props = defineProps<{ device: Device | null }>();
const emit = defineEmits<{ (e: "wait"): void; (e: "force"): void; (e: "dismiss"): void }>();

const t = useT();

// Local epoch-ms clock so the task progress bar / ETA tick once a second while
// the sheet is open. Component lifecycle (not page) → onMounted/onUnmounted (P-021).
const nowMs = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (clock) clearInterval(clock);
});

const task = computed(() => props.device?.currentTask ?? null);
const descLine = computed(() =>
  props.device ? fmt(t.value.deactivateSheet.desc, { name: deviceName(t.value, props.device) }) : "",
);
const progressPct = computed(() => {
  const tk = task.value;
  if (!tk) return 0;
  return Math.round(Math.min(100, ((nowMs.value - tk.startedAt) / 1000 / tk.totalSec) * 100));
});
const etaSec = computed(() => {
  const tk = task.value;
  if (!tk) return 0;
  return Math.max(0, Math.round(tk.totalSec - (nowMs.value - tk.startedAt) / 1000));
});
const etaLabel = computed(() =>
  etaSec.value >= 60 ? `~${Math.ceil(etaSec.value / 60)}m` : `~${etaSec.value}s`,
);
const etaLine = computed(() => fmt(t.value.deactivateSheet.etaRemaining, { eta: etaLabel.value }));
const taskRewardLine = computed(() => {
  const tk = task.value;
  if (!tk) return "";
  return fmt(t.value.deactivateSheet.taskRewardLine, {
    client: tk.client,
    amount: tk.reward.toFixed(3),
  });
});

// 🔴 790/800 = 业务半屏带(秩序表单源见 captcha-slider.vue)。原值 79/80 是「比 790/800
// 少一位数」那个老笔误的同族残留:低于里程碑庆祝(780),半屏开着时被庆祝盖住并吞点击。
// 同族前三张付款半屏 2026-08-16 已归位,这三处(本文件 / fx-rate-line / wallet-withdraw)
// 因为写成 JS 样式对象、机器门只扫 <style> 块与内联 style,当时没被扫到,2026-08-17 补齐。
const scrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 790,
  background: "rgba(8,8,12,0.45)",
  backdropFilter: "blur(8px) saturate(150%)",
};
const sheetStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 800,
  borderTopLeftRadius: "16px",
  borderTopRightRadius: "16px",
  background: "var(--v5-surface)",
  borderTop: "1px solid var(--v5-border)",
  padding: "18px 16px calc(env(safe-area-inset-bottom) + 38px)",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const descStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.45,
};
const closeBtnStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
const taskCardStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  padding: "12px",
};
const taskModelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const taskRewardStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const pctStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand)",
};
const etaStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const trackStyle: CSSProperties = {
  marginTop: "8px",
  height: "4px",
  borderRadius: "999px",
  background: "var(--v5-surface-3)",
  overflow: "hidden",
};
const fillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${progressPct.value}%`,
  background: "var(--v5-brand)",
  transition: "width 500ms ease",
}));
const waitBtnStyle: CSSProperties = {
  gap: "6px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const waitLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
const forceBtnStyle: CSSProperties = {
  marginTop: "8px",
  gap: "6px",
  height: "48px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
};
const forceLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
const backBtnStyle: CSSProperties = {
  marginTop: "8px",
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
};
const backLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
};
</script>
