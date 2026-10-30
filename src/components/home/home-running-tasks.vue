<!-- Running tasks on the account's devices, shown above settled rows in the home activity feed. -->
<template>
  <view v-for="row in rows" :key="row.id" class="nx-feed-row nx-feed-row--running" data-home-running-task="true">
    <view class="nx-feed-icon nx-feed-icon--running" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
    </view>
    <view class="nx-feed-copy">
      <text class="nx-feed-title">{{ visibility.mask(row.model) }}</text>
      <text class="nx-feed-sub">{{ visibility.mask(row.client) }} · {{ t.home.feedRunning }}</text>
    </view>
    <view class="nx-feed-figure">
      <text class="nx-feed-pct font-mono-tabular">{{ visibility.mask(`${row.pct}%`) }}</text>
      <text class="nx-feed-est font-mono-tabular">{{ t.home.feedEstimated }} {{ visibility.mask(formatUsd(row.reward, 'detail', true)) }}</text>
    </view>
    <view class="nx-feed-progress" role="progressbar" :aria-label="t.earn.currentTask" :aria-valuenow="visibility.hidden ? undefined : row.pct" aria-valuemin="0" aria-valuemax="100">
      <view v-if="!visibility.hidden" class="nx-feed-progress__fill" :style="{ width: `${row.pct}%` }" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useDataVisibility } from "@/store/data-visibility";
import { remoteApiEnabled } from "@/api/runtime";
import { formatUsd } from "@/lib/usd-display";
import { taskProgressPercent } from "@/lib/task-progress";
import { advanceMonotonicHighWater, projectServerNow, readMonotonicNowMs } from "@/lib/server-deadline-clock";
import { useVisibleInterval } from "@/composables/use-tab-page-lifecycle";

const props = defineProps<{ limit: number }>();
const emit = defineEmits<{ (event: "count", count: number): void }>();
const t = useT();
const app = useApp();
const visibility = useDataVisibility();
const now = ref(Date.now());
const monotonicNow = ref(readMonotonicNowMs());
useVisibleInterval(() => {
  now.value = Date.now();
  monotonicNow.value = advanceMonotonicHighWater(monotonicNow.value, readMonotonicNowMs());
}, 1000);
// Same readiness rule as the home fleet rows: a retained snapshot may show while it refreshes.
const tasksReady = computed(() => !remoteApiEnabled || app.remoteAssignmentStatus === "ready"
  || (app.remoteAssignmentStatus === "loading" && app.remoteAssignmentHasSnapshot));
const rows = computed(() => !tasksReady.value ? [] : app.visibleDevices.flatMap((device) => {
  const task = device.currentTask;
  if (!task || task.status === "PAUSED" || device.interruptedAt != null) return [];
  const taskNow = device.taskServerNow != null && device.taskServerNowReceivedAt != null
    ? projectServerNow(device.taskServerNow, device.taskServerNowReceivedAt, monotonicNow.value) : now.value;
  const pct = taskProgressPercent(task, taskNow, device.interruptedAt);
  return pct === null || pct >= 100 ? [] : [{ id: `${device.id}:${task.id}`, model: task.model, client: task.client, reward: task.reward, pct }];
}).slice(0, props.limit));
watch(() => rows.value.length, count => emit("count", count), { immediate: true });
</script>
