<template>
  <view class="home-action-row" :data-action-key="row.key" :role="row.action ? undefined : 'link'" :tabindex="row.action ? undefined : 0"
    @click="!row.action && emit('open')" @keydown.enter.prevent="activateRow">
    <view v-if="row.progress" class="home-action-ring" :aria-label="visibility.hidden ? row.title + ' · ' + visibility.mask('') : row.progressLabel">
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--v5-surface-3)" stroke-width="3"/><circle v-if="!visibility.hidden && row.progress.total" cx="18" cy="18" r="14" fill="none" stroke="var(--v5-brand)" stroke-width="3" stroke-linecap="round" :stroke-dasharray="`${row.progress.done! / row.progress.total * 87.965} 87.965`" transform="rotate(-90 18 18)"/></svg>
      <text class="home-action-ring__count" aria-hidden="true">{{ visibility.mask(row.progress.total ? `${row.progress.done}/${row.progress.total}` : '–') }}</text>
    </view>
    <view v-else class="home-action-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><template v-if="row.key==='phone'"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></template><template v-else-if="row.key==='security'"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-6"/></template><template v-else><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M8 12h8M8 16h4"/></template></svg></view>
    <view class="home-action-copy">
      <text class="home-action-title">{{ row.title }}</text>
      <view class="home-action-subtitle">
        <template v-if="row.reward"><text>{{ row.rewardLabel }}</text><text class="home-action-reward">{{ row.reward }} UVT</text></template>
        <text v-else :class="row.tone === 'attention' ? 'home-action-status' : 'home-action-hint'">{{ row.subtitle }}</text>
        <text v-if="row.remaining" class="home-action-countdown"><text class="home-action-separator" aria-hidden="true">·</text>{{ row.remaining }}</text>
      </view>
    </view>
    <NxButton v-if="row.action" class="home-action-bind nx-design-glass" size="small" :label="row.action" @click="emit('open')" />
    <svg v-else class="home-action-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
  </view>
</template>
<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import NxButton from '@/components/ui/nx-button.vue';
export type HomeActionRow = { key: string; title: string; subtitle?: string; action?: string; href: string;
  progress?: { done: number | null; total: number | null }; progressLabel?: string; reward?: string; rewardLabel?: string; remaining?: string;
  /** attention: something waiting on the user (amber); otherwise the subtitle is a plain hint. */
  tone?: 'attention' };
const visibility = useDataVisibility();
const props = defineProps<{ row: HomeActionRow }>();
const emit = defineEmits<{ (event: 'open'): void }>();
function activateRow(event: KeyboardEvent) { if (!props.row.action && !event.repeat) emit('open'); }
</script>
<style scoped>
.home-action-row { display:flex;align-items:center;gap:var(--ui-space-inline);min-height:64px;padding:var(--ui-space-row-y) var(--ui-space-inset);box-sizing:border-box; }
.home-action-row + .home-action-row { border-top:1px solid var(--v5-border); }
.home-action-row[role=link] { cursor:pointer; }
.home-action-row[role=link]:active { background:var(--v5-surface-2); }
.home-action-row:focus-visible { outline:2px solid var(--v5-brand);outline-offset:-3px;border-radius:var(--ui-radius-icon); }
.home-action-icon,.home-action-ring { width:36px;height:36px;flex:none;position:relative;display:grid;place-items:center; }
.home-action-icon { border-radius:var(--ui-radius-icon);background:var(--v5-surface-2);color:var(--v5-ink-2); }
.home-action-ring__count { position:absolute;inset:0;display:grid;place-items:center;font:600 9.5px/1 var(--font-v5);font-variant-numeric:tabular-nums;color:var(--v5-ink); }
.home-action-copy { flex:1;min-width:0; }
.home-action-title { display:block;font-size:var(--ui-text-body);font-weight:500;line-height:20px;color:var(--v5-ink);overflow-wrap:anywhere; }
.home-action-subtitle { display:flex;flex-wrap:wrap;align-items:baseline;column-gap:4px;margin-top:2px;font-size:var(--ui-text-caption);line-height:18px;color:var(--v5-ink-3);overflow-wrap:anywhere; }
.home-action-hint { color:var(--v5-ink-2); }
.home-action-status { color:var(--ui-attention);font-weight:500; }
.home-action-reward { color:var(--v5-quest-violet-ink); }
.home-action-countdown { color:var(--ui-attention);white-space:nowrap; }
.home-action-separator { color:var(--v5-ink-3);margin-right:4px; }
.home-action-bind { flex:none;min-height:32px;height:32px;box-sizing:border-box;padding:0 14px;font-size:var(--ui-text-caption);white-space:nowrap; }
.home-action-bind::after { content:'';position:absolute;inset:-6px 0; }
.home-action-chevron { flex:none;color:var(--v5-ink-3); }
</style>
