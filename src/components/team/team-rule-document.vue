<template>
  <view class="team-rule-document" :class="{ 'team-rule-document--compact': compact }">
    <template v-if="compact">
      <view v-for="block in blocks" :key="block.id" class="team-rule-document__block">
        <text class="team-rule-document__title">{{ block.title }}</text>
        <text v-if="block.body" class="team-rule-document__body">{{ block.body }}</text>
        <view v-if="block.items?.length" class="team-rule-document__items">
          <view v-for="(entry, index) in block.items" :key="index" class="team-rule-document__item"><text class="team-rule-document__marker" aria-hidden="true">{{ index + 1 }}.</text><text>{{ entry }}</text></view>
        </view>
      </view>
    </template>
    <template v-else>
      <template v-for="block in blocks" :key="block.id">
        <TeamRuleSection v-if="block.kind === 'callout'" class="team-rule-note--block" :title="block.title" :body="block.body" tone="note">
          <view v-if="block.items?.length" class="team-rule-document__items">
            <view v-for="(entry, index) in block.items" :key="index" class="team-rule-document__item"><text class="team-rule-document__marker" aria-hidden="true">{{ index + 1 }}.</text><text>{{ entry }}</text></view>
          </view>
        </TeamRuleSection>
        <TeamRuleSection v-else :anchor="block.id" :title="block.title" :lead="block.kind === 'list' ? block.body : undefined" :body="block.kind === 'list' ? undefined : block.body" :list="block.kind === 'list'">
          <view v-if="block.items?.length" :class="{ 'team-rule-document__after-body': block.kind !== 'list' }">
            <TeamRuleSection v-for="(entry, index) in block.items" :key="index" :n="index + 1" :body="entry" />
          </view>
        </TeamRuleSection>
      </template>
    </template>
  </view>
</template>
<script setup lang="ts">
import type { HowContentBlock } from '@/api/how-content-api';
import TeamRuleSection from './team-rule-section.vue';
// Published blocks (design system 04.7): text -> section, list -> numbered items, callout -> note,
// ruleRef -> rule card. `compact` renders the complete published text inside the collapsed fold.
defineProps<{ blocks: HowContentBlock[]; compact?: boolean }>();
</script>
<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-document__block { padding: 12px 0; }
.team-rule-document__block + .team-rule-document__block { border-top: 1px solid var(--v5-border); }
.team-rule-document__title { display: block; color: var(--v5-ink); font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); overflow-wrap: anywhere; }
.team-rule-document__body { display: block; margin-top: 4px; color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); white-space: pre-line; text-wrap: pretty; overflow-wrap: anywhere; }
.team-rule-document__items { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.team-rule-document__item { display: flex; align-items: baseline; gap: 8px; color: var(--v5-ink-2); font: var(--ui-type-guide-body-weight) var(--ui-type-guide-body)/var(--ui-type-guide-body-lh) var(--font-v5); }
.team-rule-document__item > text:last-child { min-width: 0; overflow-wrap: anywhere; }
.team-rule-document__after-body { margin-top: 4px; }
.team-rule-document__marker { flex: 0 0 20px; color: var(--v5-ink-3); font-variant-numeric: tabular-nums; }
:deep(.team-rule-note--block) { margin: var(--ui-space-section-gap) 16px 0; padding: 16px; border-radius: var(--ui-radius-surface); }
</style>
