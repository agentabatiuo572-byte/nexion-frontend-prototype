<template><NetworkPulseCard compact-view :registered-display="memberCount" :estimated="estimateAvailable" /></template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { onShow, onHide } from '@/composables/use-tab-page-lifecycle';
import { useConfig } from '@/store/config';
import { derivedRegisteredUsers, publicStatsHealth } from '@/lib/platform-stats';
import { useApp } from '@/store/app';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { fmt } from '@/i18n/format';
import { navTo } from '@/lib/route';
import NetworkPulseCard from './network-pulse-card.vue';
const app = useApp(), copy = useAuditUiCopy();
const grid = computed(() => app.homeTruth?.onGrid);
const available = computed(() => app.homeTruthStatus !== 'error' && grid.value?.activeDevices != null && grid.value?.activeJobs != null);
const cfg = useConfig(), now = ref(Date.now());
let timer: ReturnType<typeof setTimeout> | undefined, visible = true;
const estimate = computed(() => derivedRegisteredUsers(cfg.config.publicStats, now.value));
const estimateAvailable = computed(() => !cfg.syncFailed && publicStatsHealth(cfg.config.publicStats).membersOk && Number.isFinite(estimate.value));
// Retain published H9 display values until the new tick settings are available.
const memberCount = computed(() => {
  if (cfg.syncFailed) return null;
  if (estimateAvailable.value) return estimate.value;
  const count = cfg.config.networkPulse?.registeredUsers;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
});
function stop() { if (timer) clearTimeout(timer); timer = undefined; }
function tick() {
  stop(); now.value = Date.now();
  if (!visible || !estimateAvailable.value) return;
  const ps = cfg.config.publicStats, period = ps.registeredUsersTickIntervalSec! * 1000;
  const delay = period - Math.max(0, now.value - ps.registeredUsersAnchorAt) % period;
  timer = setTimeout(tick, delay);
}
watch(() => cfg.config.publicStats, tick, { immediate: true });
onShow(() => { visible = true; tick(); });
onHide(() => { visible = false; stop(); });
onUnmounted(stop);
const clients = computed(() => (available.value ? grid.value?.clients ?? [] : []).slice(0,3));
</script>
<style scoped>
.network-snapshot__estimate { display: block; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-2); margin-top: 4px; }
.network-snapshot__totals { display: flex; flex-wrap: wrap; gap: 4px 12px; font: 500 13px/1.6 var(--font-v5); color: var(--v5-ink-2); }
.network-snapshot__row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--v5-border); font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-2); }
</style>
