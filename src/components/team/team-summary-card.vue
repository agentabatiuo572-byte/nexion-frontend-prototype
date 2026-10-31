<template>
  <view class="team-summary nx-viz-press" data-testid="team-summary" :role="canOpen ? 'link' : undefined" :tabindex="canOpen ? 0 : undefined" :aria-label="canOpen ? t.team.summaryView : undefined" :aria-busy="status === 'idle' || status === 'loading'" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open">
    <view class="team-summary__header"><text class="team-summary__title">{{ copy.myTeam }}</text><text class="team-summary__arrow" :style="{ visibility: canOpen ? 'visible' : 'hidden' }" aria-hidden="true">›</text></view>
    <view class="team-summary__body" :class="{ 'team-summary__body--long-count': readable && !visibility.hidden && String(total).length > 6 }"><TeamArt kind="members" :size="56" /><view class="team-summary__metrics"><text class="team-summary__number" :style="{ '--team-summary-count-units': countUnits }">{{ totalText }}</text><text class="team-summary__label">{{ copy.members }}</text></view></view>
    <view class="team-summary__direct"><text>{{ copy.directInvites }}</text><text>{{ visibility.mask(readable ? direct : '—') }}</text></view>
    <view v-if="readable && !total && status !== 'error'" class="team-summary__empty"><text v-if="!visibility.hidden">{{ t.team.summaryEmpty }}</text><NxButton class="team-summary__action" :label="copy.inviteFriends" variant="secondary" size="medium" @click="$emit('invite')" /></view>
    <view v-else-if="status === 'error'" class="team-summary__status" role="status"><text>{{ t.team.summaryUnavailable }}</text><NxButton v-if="status === 'error'" class="team-summary__action" :label="t.network.retry" variant="text" size="medium" @click="$emit('retry')" /></view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import TeamArt from './team-art.vue';
import NxButton from '@/components/ui/nx-button.vue';
import { useDataVisibility } from '@/store/data-visibility';
const props=defineProps<{status:'idle'|'loading'|'ready'|'error'; total:number; direct:number; hasSnapshot?:boolean;transientFailure?:boolean}>();
const emit=defineEmits<{(event:'invite'):void;(event:'open'):void;(event:'retry'):void}>();
const t=useT(), locale=useLocaleStore(), copy=computed(()=>teamRedesignCopy(locale.code));
const visibility=useDataVisibility();
const canOpen=computed(()=>props.status==='ready' && props.total>0);
const readable=computed(()=>props.status==='ready'||(props.hasSnapshot&&(props.status==='loading'||(props.status==='error'&&props.transientFailure))));
// Size the rendered text so masking also conceals the original digit count.
const totalText=computed(()=>visibility.mask(readable.value ? props.total : '—'));
const countUnits=computed(()=>Math.max(1, totalText.value.length * .7));
function open(){if(canOpen.value)emit('open');}
</script>
<style scoped>
.team-summary { container: team-summary / inline-size; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 176px; box-sizing: border-box; padding: var(--ui-space-inset); color: var(--v5-ink); border-radius: 24px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--ui-device-ink) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.team-summary__header { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 24px; gap: 4px; }
.team-summary__title { min-width: 0; overflow-wrap: anywhere; font: 600 14px/20px var(--font-v5); }
.team-summary__arrow { flex: none; font-size: 18px; color: var(--v5-ink-4); }
.team-summary__body { --team-art-size: 64px; display: flex; flex-direction: column; flex: 1; justify-content: flex-end; }
.team-summary__body :deep(.team-art) { position: absolute; top: 30px; right: -10px; opacity: .9; pointer-events: none; }
.team-summary__metrics { position: relative; container-type: inline-size; display: flex; align-items: baseline; gap: 4px; width: 100%; min-width: 0; }
.team-summary__number { display: block; max-width: 100%; font: 600 32px/36px var(--font-metric); font-size: clamp(18px, calc(100cqi / var(--team-summary-count-units)), 32px); font-variant-numeric: tabular-nums; white-space: nowrap; overflow-x: auto; }
.team-summary__label { flex: none; color: var(--v5-ink-3); font: 400 13px/18px var(--font-v5); }
.team-summary__direct { position: relative; display: flex; flex-wrap: wrap; gap: 0 6px; color: var(--v5-ink-3); font: 400 12px/16px var(--font-v5); }
.team-summary__direct > text { min-width: 0; overflow-wrap: anywhere; }
.team-summary__direct > text:last-child { max-width: 100%; white-space: nowrap; overflow-x: auto; color: var(--ui-device-ink); font: 600 12px/16px var(--font-metric); }
.team-summary__number,.team-summary__direct > text:last-child { overflow-y: hidden; scrollbar-width: none; }
.team-summary__number::-webkit-scrollbar,.team-summary__direct > text:last-child::-webkit-scrollbar { display: none; }
.team-summary__empty,.team-summary__status { position: relative; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-inline); color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.team-summary__action { max-width: 100%; }
.team-summary__status .team-summary__action { font: 600 13px/20px var(--font-v5); }
.team-summary[role='link'] { cursor: pointer; }
.team-summary:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
/* Content-box widths: the art grows with the card; a very long count drops below it. */
@container team-summary (min-width: 110px) { .team-summary__body { --team-art-size: 72px; } }
@container team-summary (min-width: 140px) { .team-summary__body { --team-art-size: 88px; } .team-summary__body--long-count :deep(.team-art) { opacity: .35; } }
@container team-summary (min-width: 260px) { .team-summary__body { --team-art-size: 104px; } }
</style>
