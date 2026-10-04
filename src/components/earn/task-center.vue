<!--
  TaskCenter — ported from Nexion-prototype/app/components/task-center.tsx.
  Single merged view (no tabs): "Upgrade Unlocks" locked-tier teasers
  (VRAM-gated, route to /store) on top, followed by the task History list
  (last 10 completed across devices). The currently-processing section and the
  Current/History tab switcher were removed per product direction.

  Receipt detail: each completed row and its document icon open the ported
  ReceiptModal. Formal remote mode resolves receiptNo through the authenticated
  Java receipt-detail endpoint; prototype mode keeps its local receipt lookup.
-->
<template>
  <view class="nx-earn-task-center nx-glass-card mx-4 p-4">
    <view class="flex items-center justify-between mb-2.5 px-0">
      <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.earn.taskCenter }}</text>
      <view class="flex items-center gap-1" style="font-size: 12px; color: var(--v5-ink-3)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
        <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-brand)">{{ activeJobsText }}</text>
        <text>{{ t.earn.jobsLive }}</text>
      </view>
    </view>

    <!-- Upgrade Unlocks -->
    <view v-if="lockedTeasers.length > 0">
      <view class="pt-1 pb-1">
        <view class="flex items-center gap-1.5" style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-3)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <text>{{ t.earn.upgradeUnlocks }}</text>
        </view>
        <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 2px">{{ t.earn.upgradeUnlocksHint }}</text>
      </view>
      <view class="pt-1.5 pb-2 space-y-1">
        <view
          v-for="teaser in lockedTeasers"
          :key="teaser.category"
          class="flex items-center gap-3 py-2 rounded-lg active:opacity-80"
          @click="goStore"
        >
          <view class="rounded-lg grid place-items-center shrink-0" style="width: 32px; height: 32px; background: color-mix(in srgb, var(--v5-tech-cyan) 12%, transparent)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="categoryIconPath(teaser.category)" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block truncate" style="font-size: 13px; font-weight: 500; color: var(--v5-ink-2)">{{ teaser.model }}<text style="color: var(--v5-ink-4); margin: 0 4px">·</text><text style="color: var(--v5-ink-3)">{{ workloadLabel(teaser.category) }}</text></text>
            <text class="block truncate" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 2px">{{ t.earn.requires }} <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-tech-cyan-ink)">{{ teaser.minVRAM }}GB VRAM</text><template v-if="!remoteApiEnabled"> · {{ teaser.unlockTier }}</template></text>
          </view>
          <view class="text-right shrink-0">
            <view class="flex items-center justify-end gap-0.5" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 4px">
              <text>{{ t.earn.upgradeNow }}</text>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- Task History (merged single list) -->
    <view class="pt-3 pb-2" :style="historyHeadStyle">
      <view class="flex items-center justify-between">
        <text style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-ink-3)">{{ t.taskHistory.tabHistory }}</text>
        <view class="earn-history-all flex items-center active:opacity-60" style="gap: 2px; padding: 0 0 0 16px; min-height: 44px" role="button" tabindex="0" @click="goReceipts"  @keydown.enter.stop.prevent="goReceipts" @keydown.space.stop.prevent="goReceipts">
          <text style="font-size: 12px; font-weight: 500; color: var(--v5-brand)">{{ t.taskHistory.viewAll }}</text>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 2px">{{ historyHintText }}</text>
    </view>
    <view
      v-if="remoteApiEnabled && app.remoteAssignmentStatus === 'error'"
      class="mb-3 rounded-xl"
      style="padding: 12px; background: var(--v5-danger-soft); color: var(--v5-danger)"
    >
      <text class="block" style="font-size: 12px; font-weight: 600">{{ t.wallet.assignmentsUnavailableTitle }}</text>
      <text class="block" style="font-size: 12px; margin-top: 4px">{{ t.wallet.assignmentsUnavailableBody }}</text>
      <view
        class="inline-flex items-center active:opacity-70"
        style="min-height: 44px; margin-top: 4px; color: var(--v5-brand)"
        role="button"
        tabindex="0"
        @click="retryAssignments"
      >
        <text>{{ t.tradein.errPleaseRetry }}</text>
      </view>
    </view>
    <view
      v-else-if="remoteApiEnabled && (app.remoteAssignmentStatus === 'idle' || (app.remoteAssignmentStatus === 'loading' && !app.remoteAssignmentHasSnapshot))"
      class="pb-4" role="status" aria-live="polite"
    >
      <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.taskHistory.loading }}</text>
    </view>
    <view v-else-if="allRecent.length === 0" class="pb-4">
      <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.taskHistory.historyEmpty }}</text>
    </view>
    <view v-else class="earn-history-list pb-3 space-y-1.5">
      <view
        v-for="task in allRecent"
        :key="task.id"
        class="earn-history-row flex items-center justify-between gap-2 active:opacity-80"
        :data-task-id="task.id" style="font-size: 12px"
        :role="canOpenTaskReceipt(task) ? 'button' : undefined"
        :tabindex="canOpenTaskReceipt(task) ? 0 : undefined"
        @click.stop="openTaskReceipt(task)"

        @keydown.enter.stop.prevent="openTaskReceipt(task)" @keydown.space.stop.prevent="openTaskReceipt(task)"
      >
        <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
        <text class="flex-1 truncate min-w-0" style="color: var(--v5-ink-2)">{{ task.model }}<text style="color: var(--v5-ink-4); margin: 0 4px">·</text><text style="color: var(--v5-ink-3)">{{ workloadLabel(task.category) }}</text></text>
        <text class="tabular-nums shrink-0" style="font-family: var(--font-v5); color: var(--v5-warning-ink)">+${{ task.reward.toFixed(3) }}</text>
        <text class="text-right shrink-0" style="font-size: 12px; color: var(--v5-ink-3); width: 48px">{{ shortTime(task.completedAt) }}</text>
        <view v-if="canOpenTaskReceipt(task)" class="shrink-0 grid place-items-center" style="width: 22px; height: 22px; border-radius: 6px; color: var(--v5-ink-4)" :title="task.receiptNo ?? task.id" @click.stop="openTaskReceipt(task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M14 8H8" /><path d="M16 12H8" /><path d="M13 16H8" /></svg>
        </view>
        <view v-else class="shrink-0" style="width: 22px; height: 22px" />
      </view>
    </view>
    <ReceiptModal :receipt="openReceipt" @close="openReceipt = null" />
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { taskRelativeTime } from "@/lib/task-relative-time";
import { useApp } from "@/store/app";
import { useT } from "@/i18n/use-t";
import { prepareEarnConfig, useEarnConfig } from "@/store/earn-config";
import type { TaskCategory, CompletedTask } from "@/store/types";
import { workloadLabel as resolveWorkloadLabel } from "@/lib/workload-label";
import ReceiptModal from "@/components/me/receipt-modal.vue";
import { useReceipts } from "@/store/receipts";
import type { Receipt } from "@/mock/receipt";
import { remoteApiEnabled, taskAssignmentApi } from "@/api/runtime";
import type { CanonicalComputeReceipt } from "@/api/task-assignment-api";

import { toast } from "@/store/ui";

const app = useApp();
const t = useT();
const relativeNow = ref(Date.now());
let relativeTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { relativeTimer = setInterval(() => { relativeNow.value = Date.now(); }, 30000); });
const receipts = remoteApiEnabled ? null : useReceipts();
const openReceipt = ref<Receipt | CanonicalComputeReceipt | null>(null);
let receiptRequestEpoch = 0;
prepareEarnConfig();
const earnConfig = useEarnConfig();
/**
 * The Home overview reports `activeJobs` as `null` when the period has no
 * settled receipts — "no value" — while the fleet snapshot defines the same
 * day's realized total as a genuine 0. When that snapshot proves today
 * realized exactly 0 USDT and 0 NEX, the null job count is the confirmed 0
 * rather than unknown, so the header agrees with the device cards. #128
 */
const activeJobsText = computed(() => {
  if (!remoteApiEnabled) return app.global.activeJobs.toLocaleString();
  const value = app.homeTruth?.onGrid.activeJobs ?? null;
  if (value !== null) return value.toLocaleString();
  const fleet = app.remoteRealizedToday;
  return fleet && fleet.usdt === 0 && fleet.nex === 0 ? "0" : "—";
});
function receiptFor(id: string): Receipt | undefined {
  return receipts?.byId(id);
}

function canOpenTaskReceipt(task: CompletedTask): boolean {
  return remoteApiEnabled ? !!task.receiptNo : !!receiptFor(task.id);
}

async function openTaskReceipt(task: CompletedTask): Promise<void> {
  if (!remoteApiEnabled) {
    openReceipt.value = receiptFor(task.id) ?? null;
    return;
  }
  if (!task.receiptNo) return;
  const requestEpoch = ++receiptRequestEpoch;
  const expectedAccountKey = app.accountKey;
  const expectedBindingEpoch = app.accountBindingEpoch;
  try {
    const detail = await taskAssignmentApi.receipt(task.receiptNo);
    if (requestEpoch === receiptRequestEpoch
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) openReceipt.value = detail;
  } catch {
    if (requestEpoch === receiptRequestEpoch
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) {
      toast.error(t.value.wallet.receiptsUnavailableTitle, t.value.wallet.receiptsUnavailableBody);
    }
  }
}

watch(() => app.accountBindingEpoch, () => {
  receiptRequestEpoch += 1;
  openReceipt.value = null;
});

onUnmounted(() => {
  receiptRequestEpoch += 1;
  if (relativeTimer) clearInterval(relativeTimer);
});

// Model names are proper nouns (untranslated); the workload half is copy.
// Resolved from `category` at render — the baked `task.type` string is English.
function workloadLabel(category: TaskCategory): string {
  return resolveWorkloadLabel(t.value, category);
}

// History list: completed tasks across all devices, most-recent first (last 20).
const allRecent = computed(() =>
  app.visibleDevices
    .flatMap((d) => d.recentTasks)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 20),
);

// Cloud Share has no user-owned physical VRAM, but the server routes its
// rented pool as an 8 GB equivalent for task eligibility and claim execution.
const CLOUD_SHARE_ROUTING_VRAM_GB = 8;
const maxVram = computed(() => app.visibleDevices.reduce(
  (m, d) => Math.max(m, d.kind === "cloud-share" ? CLOUD_SHARE_ROUTING_VRAM_GB : d.vramTotal),
  0,
));
const lockedTeasers = computed(() => earnConfig.lockedTeasers(maxVram.value, 3));
watch(maxVram, (value) => { void earnConfig.refreshRoute(value); }, { immediate: true });

const historyHintText = computed(() =>
  t.value.taskHistory.historyHint.replace("{n}", String(allRecent.value.length)),
);

// Divider above History only when the Upgrade Unlocks block precedes it.
const historyHeadStyle = computed<CSSProperties>(() => ({
  borderTop:
    lockedTeasers.value.length > 0
      ? "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)"
      : "none",
}));

const CATEGORY_ICON_PATHS: Record<TaskCategory, string> = {
  IG: "M3 3h18v18H3zM3 16l5-5 4 4 5-5 4 4", // image
  VG: "M14 4v16M10 4v16M4 8h4M4 16h4M16 8h4M16 16h4M4 4h16v16H4z", // film
  LL: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", // message
  FT: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.7-2.7z", // wrench
  EM: "M3 5a9 3 0 0 0 18 0a9 3 0 0 0-18 0M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0", // database
  SP: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M19 10v2a7 7 0 0 1-14 0v-2M12 19v3", // mic
};
function categoryIconPath(category: TaskCategory): string {
  return CATEGORY_ICON_PATHS[category] ?? CATEGORY_ICON_PATHS.IG;
}

function goStore() {
  navTo("/pages/store/store");
}

function goReceipts() {
  navTo("/pages/me/receipts");
}

function retryAssignments() {
  void app.refreshRemoteFleet().catch(() => undefined);
}

function shortTime(ts: number): string {
  return taskRelativeTime(ts, relativeNow.value, t.value.security);
}


</script>
