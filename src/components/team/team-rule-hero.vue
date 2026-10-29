<template>
  <view class="team-rule-hero">
    <view class="team-rule-hero__heading" :class="{ 'team-rule-hero__heading--plain': !sub }">
      <view class="team-rule-hero__copy">
        <text class="team-rule-hero__title">{{ title || label }}</text>
        <text v-if="sub" class="team-rule-hero__intro">{{ sub }}</text>
      </view>
      <TeamArt :kind="kind" :size="56" class="team-rule-hero__art" />
    </view>
    <view v-if="sections && sections.length > 1" class="team-rule-hero__nav" role="navigation" :aria-label="navLabel">
      <view v-for="item in sections" :key="item.id" class="team-rule-hero__jump nx-frosted-button" role="link" tabindex="0" @click="jump(item.id)"><text>{{ item.title }}</text></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import TeamArt from '@/components/team/team-art.vue';
defineProps<{ kind: 'members' | 'balance' | 'ledger' | 'growth'; label?: string; title?: string; sub?: string; sections?: { id: string; title: string }[]; navLabel?: string }>();
// In-page directory (design system 04.7). H5 reaches the DOM directly; the App logic layer
// runs the same call inside the page WebView, as device-detail does.
function jump(id: string) {
  const anchor = `team-rule-${id}`;
  if (typeof document !== 'undefined') { document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  // #ifdef APP-PLUS
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as unknown as { $getAppWebview?: () => { evalJS: (script: string) => void } };
  page?.$getAppWebview?.().evalJS(`var target=document.getElementById(${JSON.stringify(anchor)});if(target){target.scrollIntoView({block:'start',behavior:'smooth'});}`);
  // #endif
}
</script>
<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-hero { margin: 8px 16px 0; padding: var(--ui-space-inset-hero); border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.team-rule-hero__heading { display: flex; align-items: flex-start; gap: 12px; }
/* Published guides have no intro line; centre the title on the art instead of leaving a gap. */
.team-rule-hero__heading--plain { align-items: center; }
.team-rule-hero__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.team-rule-hero__title { color: var(--v5-ink); font: var(--ui-type-hero-title-weight) var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); text-wrap: balance; overflow-wrap: anywhere; }
.team-rule-hero__intro { color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); white-space: pre-line; text-wrap: pretty; overflow-wrap: anywhere; }
.team-rule-hero__art { --team-art-size: var(--team-guide-art-size); flex: 0 0 var(--team-guide-art-size); }
.team-rule-hero__nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
/* Neutral glass S buttons: 32px surface, 44px hit area. */
.team-rule-hero__jump { position: relative; display: inline-flex; align-items: center; box-sizing: border-box; height: 32px; max-width: 100%; padding: 0 12px; border-radius: 999px; font: var(--ui-type-compact-button-weight) var(--ui-type-compact-button)/var(--ui-type-compact-button-lh) var(--font-v5); cursor: pointer; }
.team-rule-hero__jump::after { content: ""; position: absolute; inset: -6px 0; }
.team-rule-hero__jump > text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.team-rule-hero__jump:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
