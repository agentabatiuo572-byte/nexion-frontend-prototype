<template>
  <view class="team-rule-published">
    <SubPageHeader :back="back" :title="heading" />
    <view v-if="loading && !content" class="team-rule-published__notice" role="status"><text>{{ t.howPublished.loading }}</text></view>
    <template v-if="content">
      <view v-if="languageFallback" class="team-rule-published__notice" role="status" aria-live="polite">
        <text>{{ t.howPublished.languageFallback }}</text>
        <view class="nx-card-recovery-action nx-card-recovery-action--glass" role="button" tabindex="0" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ t.ui.retry }}</text></view>
      </view>
      <TeamRuleHero :kind="kind" :title="copy.overview" />
      <TeamRuleDocument :blocks="content.blocks" :locale="locale.code" />
    </template>
    <view v-if="error" class="team-rule-published__notice" role="alert" aria-live="polite">
      <text class="team-rule-published__error-title">{{ t.howPublished.unavailableTitle }}</text>
      <text>{{ t.howPublished.unavailableBody }}</text>
      <view class="nx-card-recovery-action nx-card-recovery-action--glass" role="button" tabindex="0" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ t.ui.retry }}</text></view>
    </view>
    <view class="mx-4 mt-6"><view class="reward-cta reward-cta--wide" role="button" tabindex="0" @click="navBack(back)" @keydown.enter.prevent="navBack(back)" @keydown.space.prevent="navBack(back)"><text>{{ backLabel }}</text></view></view>
  </view>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import SubPageHeader from '@/components/sub-page-header.vue';
import TeamRuleHero from './team-rule-hero.vue';
import TeamRuleDocument from './team-rule-document.vue';
import { teamRuleGuideCopy } from './team-rule-guide-copy';
import { ApiError } from '@/api/errors';
import { howContentApi, remoteApiEnabled } from '@/api/runtime';
import type { HowContentDocument, HowContentKey } from '@/api/how-content-api';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { navBack } from '@/lib/route';
import { PublishedContentRequestFence } from '@/components/how/p3-14-published-request-fence';

const props = defineProps<{ contentKey: HowContentKey; back: string; backLabel: string; kind: 'members' | 'balance'; heading: string }>();
const locale = useLocaleStore(), t = useT();
const copy = computed(() => teamRuleGuideCopy(locale.code));
const content = ref<HowContentDocument | null>(null);
const loading = ref(true), error = ref(false);
const requestFence = new PublishedContentRequestFence();
const languageFallback = computed(() => !!content.value && content.value.locale.split(/[-_]/)[0].toLowerCase() !== locale.code.split(/[-_]/)[0].toLowerCase());

// Keep the existing publication acceptance and refresh boundary. Only its
// presentation is scoped here; shared wallet/rank guides stay on their own UI.
async function load() {
  const generation = requestFence.begin(`${props.contentKey}:${locale.code}`);
  if (generation === null) return;
  loading.value = true; error.value = false;
  try {
    const next = await howContentApi.published(props.contentKey, locale.code);
    if (!requestFence.isCurrent(generation)) return;
    if (next.blocks.some(block => [block.title, block.body, ...(block.items ?? [])].some(text => text.includes('{value}')))) throw new Error('HOW_CONTENT_RULE_VALUE_UNRESOLVED');
    if (props.contentKey === 'team-unilevel-how' && (!next.blocks.some(block => block.id === 'direct-referral-scope')
      || (next.schemaVersion === 2 && (next.templateId !== 'unilevel-v2' || !next.blocks.some(block => block.id === 'seven-layer-scope'))))) throw new Error('TEAM_PUBLICATION_REQUIRED');
    content.value = next;
  } catch (failure) {
    if (!requestFence.isCurrent(generation)) return;
    if (!(failure instanceof ApiError && failure.kind === 'network')) content.value = null;
    error.value = true;
  } finally {
    if (requestFence.isCurrent(generation)) { loading.value = false; requestFence.settle(generation); }
  }
}
watch(() => [props.contentKey, locale.code], () => {
  requestFence.invalidate(); content.value = null; error.value = false;
  if (remoteApiEnabled) void load();
  else loading.value = false;
}, { immediate: true, flush: 'sync' });
onUnmounted(() => requestFence.invalidate());
</script>
<style src="./team-rule-type.css"></style>
<style scoped>
.team-rule-published__notice { margin: 16px; padding: 20px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; color: var(--v5-ink-2); font-size: var(--team-guide-body); line-height: var(--team-guide-body-lh); }
.team-rule-published__error-title { color: var(--v5-ink); font-size: var(--team-guide-heading); line-height: var(--team-guide-heading-lh); font-weight: 600; }
</style>
