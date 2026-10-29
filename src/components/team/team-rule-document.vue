<template>
  <view class="team-rule-document">
    <view class="team-rule-document__tools">
      <view class="team-rule-document__expand" role="button" tabindex="0" :aria-expanded="allOpen" @click="toggleAll" @keydown.enter.prevent="toggleAll" @keydown.space.prevent="toggleAll"><text>{{ allOpen ? copy.collapseAll : copy.expandAll }}</text></view>
    </view>
    <TeamRuleSection v-for="block in blocks" :key="block.id" :title="block.title" :open="opened.includes(block.id)" @update:open="setOpen(block.id, $event)">
      <text class="team-rule-document__body">{{ block.body }}</text>
      <view v-if="block.items?.length" class="team-rule-document__items">
        <view v-for="(item, index) in block.items" :key="index" class="team-rule-document__item"><text class="team-rule-document__marker" aria-hidden="true">{{ index + 1 }}.</text><text>{{ item }}</text></view>
      </view>
    </TeamRuleSection>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { HowContentBlock } from '@/api/how-content-api';
import TeamRuleSection from './team-rule-section.vue';
import { teamRuleGuideCopy } from './team-rule-guide-copy';
const props = defineProps<{ blocks: HowContentBlock[]; locale: string }>();
const copy = computed(() => teamRuleGuideCopy(props.locale));
const opened = ref<string[]>([]);
const allOpen = computed(() => props.blocks.length > 0 && props.blocks.every(block => opened.value.includes(block.id)));
function toggleAll() { opened.value = allOpen.value ? [] : props.blocks.map(block => block.id); }
function setOpen(id: string, value: boolean) { opened.value = value ? [...opened.value, id] : opened.value.filter(key => key !== id); }
watch(() => [props.blocks, props.locale], () => { opened.value = []; });
</script>
<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-document__tools { margin: 0 16px 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; }
.team-rule-document__expand { display: flex; align-items: center; min-height: 44px; margin-left: auto; color: var(--v5-brand); font-size: 13px; font-weight: 600; cursor: pointer; }
.team-rule-document__expand:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-rule-document__body { display: block; white-space: pre-line; text-wrap: pretty; }
.team-rule-document__items { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.team-rule-document__item { display: flex; align-items: baseline; gap: 12px; }
.team-rule-document__item > text:last-child { min-width: 0; }
.team-rule-document__marker { flex: 0 0 20px; color: var(--v5-ink-3); font-variant-numeric: tabular-nums; }
</style>
