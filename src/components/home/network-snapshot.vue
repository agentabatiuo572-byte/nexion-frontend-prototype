<template><NetworkPulseCard v-if="available" compact-view :registered-display="memberCount" estimated /></template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { onShow, onHide } from '@/composables/use-tab-page-lifecycle';
import { useConfig } from '@/store/config';
import { derivedRegisteredUsers, publicStatsHealth } from '@/lib/platform-stats';
import NetworkPulseCard from './network-pulse-card.vue';
const cfg = useConfig(), now = ref(Date.now());
let timer: ReturnType<typeof setTimeout> | undefined, visible = true;
const estimate = computed(() => derivedRegisteredUsers(cfg.config.publicStats, now.value));
const estimateAvailable = computed(() => !cfg.syncFailed && publicStatsHealth(cfg.config.publicStats).membersOk && Number.isSafeInteger(estimate.value) && estimate.value >= 0);
const memberCount = computed(() => estimateAvailable.value ? estimate.value : null);
const available = computed(() => estimateAvailable.value && Number.isSafeInteger(cfg.config.networkPulse?.onlineDevices) && cfg.config.networkPulse!.onlineDevices! >= 0);
function stop() { if (timer) clearTimeout(timer); timer = undefined; }
function tick() {
  stop(); now.value = Date.now();
  if (!visible || !estimateAvailable.value) return;
  const ps = cfg.config.publicStats, period = ps.registeredUsersTickIntervalSec! * 1000;
  const delay = period - Math.max(0, now.value - ps.registeredUsersAnchorAt) % period;
  timer = setTimeout(tick, delay);
}
watch(() => [cfg.config.publicStats, cfg.loading, cfg.syncFailed], tick, { immediate: true, deep: true });
onShow(() => { visible = true; tick(); });
onHide(() => { visible = false; stop(); });
onUnmounted(stop);
</script>
<style scoped>
.network-snapshot__estimate { display: block; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-2); margin-top: 4px; }
.network-snapshot__totals { display: flex; flex-wrap: wrap; gap: 4px 12px; font: 500 var(--ui-type-list-subtitle)/1.6 var(--font-v5); color: var(--v5-ink-2); }
.network-snapshot__row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--v5-border); font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-2); }
</style>
