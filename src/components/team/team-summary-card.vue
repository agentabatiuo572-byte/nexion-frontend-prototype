<template>
  <view class="team-summary" data-testid="team-summary" :role="canOpen ? 'link' : undefined" :tabindex="canOpen ? 0 : undefined" :aria-label="canOpen ? t.team.summaryView : undefined" :aria-busy="status === 'idle' || status === 'loading'" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open">
    <view class="team-summary__header"><text class="team-summary__title">{{ copy.myTeam }}</text><text v-if="canOpen" class="team-summary__arrow" aria-hidden="true">›</text></view>
    <view class="team-summary__body"><view class="team-summary__metrics"><view><text class="team-summary__number">{{ status === 'ready' ? total : '—' }}</text><text class="team-summary__label">{{ copy.members }}</text></view><view><text class="team-summary__number">{{ status === 'ready' ? direct : '—' }}</text><text class="team-summary__label">{{ copy.directInvites }}</text></view></view><TeamArt kind="members" :size="124" /></view>
    <view v-if="status === 'ready' && !total" class="team-summary__empty"><text>{{ t.team.summaryEmpty }}</text><NxButton :label="copy.inviteFriends" size="medium" @click="$emit('invite')" /></view>
    <view v-else-if="status !== 'ready'" class="team-summary__status" role="status"><text>{{ status === 'error' ? t.team.summaryUnavailable : t.team.summaryLoading }}</text><NxButton v-if="status === 'error'" :label="t.network.retry" size="medium" @click="$emit('retry')" /></view>
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
function open(){if(canOpen.value)emit('open');}
</script>
<style scoped>
.team-summary { padding: var(--ui-space-inline) 0 16px; color: var(--v5-ink); border-bottom: 1px solid var(--v5-border); }
.team-summary__header { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: var(--ui-space-inline); }
.team-summary__title { font: 600 20px/1.4 var(--font-v5); }
.team-summary__arrow { font-size: 26px; color: var(--v5-ink-3); }
.team-summary__body { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.team-summary__metrics { display: grid; flex: 1; min-width: 0; grid-template-columns: 1fr 1.25fr; gap: 14px; }
.team-summary__number { display: block; font: 600 clamp(24px,8vw,34px)/1.2 var(--font-v5); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.team-summary__label { display: block; margin-top: 7px; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.team-summary__empty,.team-summary__status { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; }
.team-summary[role='link'] { cursor: pointer; }
.team-summary[role='link']:active { opacity: .8; }
.team-summary:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
