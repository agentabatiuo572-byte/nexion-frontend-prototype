<template>
  <view class="team-summary" data-testid="team-summary" :role="canOpen ? 'link' : undefined" :tabindex="canOpen ? 0 : undefined" :aria-label="canOpen ? t.team.summaryView : undefined" :aria-busy="status === 'idle' || status === 'loading'" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open">
    <view class="team-summary__header"><text class="team-summary__title">{{ copy.myTeam }}</text><text v-if="canOpen" class="team-summary__arrow" aria-hidden="true">›</text></view>
    <view class="team-summary__body" :class="{ 'team-summary__body--long-count': status === 'ready' && String(total).length > 6 }"><TeamArt kind="members" :size="56" /><view class="team-summary__metrics"><text class="team-summary__number" :style="{ '--team-summary-count-units': countUnits }">{{ status === 'ready' ? total : '—' }}</text><text class="team-summary__label">{{ copy.members }}</text></view></view>
    <view class="team-summary__direct"><text>{{ copy.directInvites }}</text><text>{{ status === 'ready' ? direct : '—' }}</text></view>
    <view v-if="status === 'ready' && !total" class="team-summary__empty"><text>{{ t.team.summaryEmpty }}</text><NxButton class="team-summary__action" :label="copy.inviteFriends" variant="secondary" size="medium" @click="$emit('invite')" /></view>
    <view v-else-if="status !== 'ready'" class="team-summary__status" role="status"><text>{{ status === 'error' ? t.team.summaryUnavailable : t.team.summaryLoading }}</text><NxButton v-if="status === 'error'" class="team-summary__action" :label="t.network.retry" size="medium" @click="$emit('retry')" /></view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import TeamArt from './team-art.vue';
import NxButton from '@/components/ui/nx-button.vue';
const props=defineProps<{status:'idle'|'loading'|'ready'|'error'; total:number; direct:number}>();
const emit=defineEmits<{(event:'invite'):void;(event:'open'):void;(event:'retry'):void}>();
const t=useT(), locale=useLocaleStore(), copy=computed(()=>teamRedesignCopy(locale.code));
const canOpen=computed(()=>props.status==='ready' && props.total>0);
// Size the real count; never abbreviate it to fit a decorative image.
const countUnits=computed(()=>Math.max(1, String(props.status === 'ready' ? props.total : '—').length * .7));
function open(){if(canOpen.value)emit('open');}
</script>
<style scoped>
.team-summary { container: team-summary / inline-size; padding: var(--ui-space-inline); min-width: 0; color: var(--v5-ink); border: 1px solid var(--v5-border); border-radius: 22px; background: var(--v5-surface); }
.team-summary__header { display: flex; align-items: center; justify-content: space-between; min-height: 32px; gap: 4px; }
.team-summary__title { min-width: 0; overflow-wrap: anywhere; font: 600 15px/1.4 var(--font-v5); }
.team-summary__arrow { font-size: 26px; color: var(--v5-ink-3); }
.team-summary__body { --team-art-size: 56px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.team-summary__metrics { container-type: inline-size; width: 100%; min-width: 0; text-align: center; }
.team-summary__number { display: block; max-width: 100%; font: 600 24px/1.3 var(--font-v5); font-size: clamp(18px, calc(100cqi / var(--team-summary-count-units)), 38px); font-variant-numeric: tabular-nums; white-space: nowrap; overflow-x: auto; }
.team-summary__label { display: block; margin-top: 2px; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.team-summary__direct { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--v5-border); color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.team-summary__direct > text { min-width: 0; overflow-wrap: anywhere; }
.team-summary__direct > text:last-child { max-width: 100%; white-space: nowrap; overflow-x: auto; color: var(--v5-ink); font-weight: 600; }
.team-summary__number,.team-summary__direct > text:last-child { overflow-y: hidden; scrollbar-width: none; }
.team-summary__number::-webkit-scrollbar,.team-summary__direct > text:last-child::-webkit-scrollbar { display: none; }
.team-summary__empty,.team-summary__status { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.team-summary__action { max-width: 100%; }
.team-summary[role='link'] { cursor: pointer; }
.team-summary[role='link']:active { opacity: .8; }
.team-summary:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
/* Content-box widths, independent of the viewport or the parent's column count. */
@container team-summary (min-width: 140px) {
  .team-summary__body { --team-art-size: 72px; flex-direction: row-reverse; }
  .team-summary__metrics { flex: 1; width: auto; text-align: left; }
  .team-summary__body--long-count { flex-direction: column; }
  .team-summary__body--long-count .team-summary__metrics { width: 100%; text-align: center; }
}
@container team-summary (min-width: 260px) {
  .team-summary__body { --team-art-size: 80px; flex-direction: row-reverse; }
  .team-summary__metrics,.team-summary__body--long-count .team-summary__metrics { flex: 1; width: auto; text-align: left; }
}
</style>
