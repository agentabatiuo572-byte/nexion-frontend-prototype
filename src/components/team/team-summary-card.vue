<template>
  <view class="nx-glass-card team-summary" data-testid="team-summary" :aria-busy="status === 'idle' || status === 'loading'">
    <view class="team-summary__header">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <text class="team-summary__title">{{ t.team.summaryTitle }}</text>
      <view v-if="status === 'ready' && total > 0" class="team-summary__arrow" role="link" tabindex="0" :aria-label="t.team.summaryView" @click="$emit('open')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </view>
    </view>
    <text class="team-summary__tagline">{{ t.team.inviteTagline }}</text>
    <template v-if="status === 'ready' && total > 0">
      <view class="team-summary__metrics">
        <view><text class="team-summary__number">{{ total }}</text><text class="team-summary__label">{{ t.team.summaryMembers }}</text></view>
        <view><text class="team-summary__number">{{ direct }}</text><text class="team-summary__label">{{ t.team.summaryDirect }}</text></view>
      </view>
      <view class="team-summary__cta" role="link" tabindex="0" @click="$emit('open')"><text>{{ t.team.summaryView }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></view>
    </template>
    <template v-else-if="status === 'ready'">
      <view class="team-summary__empty">
        <svg width="84" height="72" viewBox="0 0 84 72" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="42" cy="25" r="10"/><circle cx="17" cy="34" r="8"/><circle cx="67" cy="34" r="8"/><path d="M25 66V56a17 17 0 0 1 34 0v10M5 66v-8a12 12 0 0 1 17-11M79 66v-8a12 12 0 0 0-17-11M42 3v5M18 8l4 5M66 8l-4 5"/></svg>
        <text class="team-summary__empty-title">{{ t.team.summaryEmpty }}</text>
      </view>
      <view class="team-summary__cta" role="button" tabindex="0" @click="$emit('invite')"><text>{{ t.team.summaryInvite }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></view>
    </template>
    <view v-else class="team-summary__status" role="status">
      <text>{{ status === 'error' ? t.team.summaryUnavailable : t.team.summaryLoading }}</text>
      <view v-if="status === 'error'" class="team-summary__retry" role="button" tabindex="0" @click="$emit('retry')"><text>{{ t.network.retry }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useT } from "@/i18n/use-t";
defineProps<{ status: "idle" | "loading" | "ready" | "error"; total: number; direct: number }>();
defineEmits<{ (event: "invite"): void; (event: "open"): void; (event: "retry"): void }>();
const t = useT();
</script>

<style scoped>
.team-summary { padding: 20px; }
.team-summary__header { display: flex; align-items: center; gap: 12px; }
.team-summary__title { font-size: 20px; font-weight: 600; }
.team-summary__arrow { display: grid; place-items: center; min-width: 44px; min-height: 44px; margin: -8px -10px -8px auto; }
.team-summary__tagline { display: block; margin-top: 10px; font-size: 13px; line-height: 1.5; color: var(--v5-ink-3); }
.team-summary__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 24px 0; }
.team-summary__metrics > view { min-width: 0; }
.team-summary__metrics > view + view { border-left: 1px solid var(--v5-border); padding-left: 24px; }
.team-summary__number { display: block; font-size: clamp(18px, 6vw, 30px); line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.team-summary__label { display: block; margin-top: 6px; font-size: 13px; color: var(--v5-ink-3); }
.team-summary__cta { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 48px; padding: 10px 14px; border-radius: 999px; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 15px; font-weight: 600; }
.team-summary__cta:active, .team-summary__retry:active, .team-summary__arrow:active { opacity: .75; }
.team-summary__empty { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 26px 0; }
.team-summary__empty-title { font-size: 20px; font-weight: 500; }
.team-summary__status { display: flex; flex-direction: column; gap: 16px; padding: 26px 0 4px; color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; }
.team-summary__retry { min-height: 44px; display: grid; place-items: center; border-radius: 999px; background: var(--v5-brand-soft); color: var(--v5-brand); }
.team-summary [tabindex="0"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
