<template>
  <view class="ticket-record" :class="{ 'ticket-record--agent': message.author === 'agent' }">
    <view v-if="showDate" class="ticket-record-date"><text>{{ dateLabel }}</text></view>
    <view class="ticket-record-row">
      <view class="ticket-record-rail" aria-hidden="true">
        <view class="ticket-record-avatar">
          <svg v-if="message.author === 'agent'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Zm0 6v1a3 3 0 0 1-3 3h-3" /></svg>
          <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
        </view>
        <view class="ticket-record-connector" />
      </view>
      <view class="ticket-record-main">
        <view class="ticket-record-heading">
          <text class="ticket-record-author">{{ authorLabel }}</text>
          <text class="ticket-record-time">{{ timeLabel }}</text>
        </view>
        <view class="ticket-record-content">
          <text :id="bodyId" class="ticket-record-body" :class="{ 'ticket-record-body--preview': foldable && !expanded }">{{ message.body }}</text>
          <view v-if="foldable" class="family-control ticket-record-toggle" role="button" tabindex="0" :aria-expanded="expanded ? 'true' : 'false'" :aria-controls="bodyId" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
            <LiquidGlass :radius="24" />
            <svg class="ticket-record-chevron" :class="{ 'ticket-record-chevron--expanded': expanded }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            <text>{{ expanded ? t.tickets.detail.collapseMessage : t.tickets.detail.expandMessage }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { formatJoinedDate } from '@/lib/profile-date';
import type { TicketMessage } from '@/domain/support';

const props = defineProps<{ message: TicketMessage; scope: string; showDate: boolean }>();
const t = useT();
const locale = useLocaleStore();
const expanded = ref(false);
const foldable = computed(() => props.message.body.length > 160 || props.message.body.split('\n').length > 4);
const bodyId = computed(() => `ticket-body-${encodeURIComponent(props.scope)}-${encodeURIComponent(props.message.id)}`);
const authorLabel = computed(() => props.message.author === 'user' ? t.value.tickets.detail.youLabel : props.message.agentName?.trim() || t.value.tickets.detail.agentFallback);
const dateLabel = computed(() => formatJoinedDate(props.message.ts, locale.code));
const timeLabel = computed(() => {
  const date = new Date(props.message.ts);
  return !Number.isFinite(props.message.ts) || props.message.ts <= 0 || Number.isNaN(date.getTime()) ? '—' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
});
watch(() => [props.scope, props.message.id, props.message.body], () => { expanded.value = false; });

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value) return;
  await nextTick();
  // H5 uses an inner chassis scroller. Keep the same record visible when a
  // long disclosure closes, without scrolling the outer device preview.
  // #ifdef H5
  if (typeof document !== 'undefined') {
    const record = document.getElementById(bodyId.value)?.closest('.ticket-record');
    const scroller = record?.closest('.nx-content.nx-scroll');
    if (record instanceof HTMLElement && scroller instanceof HTMLElement && record.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
      scroller.scrollTop += record.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
    }
  }
  // #endif
}
</script>

<style scoped>
.ticket-record-date { display: flex; align-items: center; gap: 14px; margin: 4px 0 22px; color: var(--v5-ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.ticket-record-date::before, .ticket-record-date::after { content: ''; flex: 1; height: 1px; background: var(--v5-border); }
.ticket-record-row { display: flex; gap: 12px; }
.ticket-record-rail { flex: 0 0 34px; display: flex; align-items: center; flex-direction: column; }
.ticket-record-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--v5-surface-2); color: var(--v5-ink-2); }
.ticket-record--agent .ticket-record-avatar { background: color-mix(in srgb, var(--v5-tech-cyan) 18%, var(--v5-surface)); color: var(--v5-tech-cyan); }
.ticket-record-connector { width: 1px; flex: 1; min-height: 12px; margin: 10px 0; background: var(--v5-border); }
.ticket-record-main { flex: 1; min-width: 0; padding-bottom: 26px; }
.ticket-record-heading { min-height: 34px; display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
.ticket-record-author { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 15px; font-weight: 600; color: var(--v5-ink); line-height: 1.5; }
.ticket-record-time { flex-shrink: 0; font-size: 12px; color: var(--v5-ink-3); font-variant-numeric: tabular-nums; }
.ticket-record-content { padding: 14px 16px; border-radius: 4px 16px 16px 16px; background: var(--v5-surface); }
.ticket-record-body { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; font-weight: 400; color: var(--v5-ink-2); line-height: 1.85; }
.ticket-record-body--preview { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.ticket-record-toggle { display: flex; width: 100%; margin-top: 16px; font-size: 13px; }
.ticket-record-chevron { flex-shrink: 0; transition: transform 180ms ease; }
.ticket-record-chevron--expanded { transform: rotate(180deg); }
@media (max-width: 360px) { .ticket-record-row { gap: 8px; } .ticket-record-rail { flex-basis: 30px; } .ticket-record-avatar { width: 30px; height: 30px; } .ticket-record-content { padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .ticket-record-chevron { transition: none; } }
</style>
