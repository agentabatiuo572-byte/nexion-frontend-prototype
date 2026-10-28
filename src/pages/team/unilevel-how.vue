<template>
  <AppChassis active="team">
    <RewardPageSurface>
      <HowPublishedContent v-if="howMode === 'published'" :heading="t.unilevelHowItWorks.navTitle" :back-label="w.ctaBack" kind="members" content-key="team-unilevel-how" back="/pages/team/unilevel" />
      <view v-if="howMode === 'local'" class="pb-8">
        <SubPageHeader :title="t.unilevelHowItWorks.navTitle" back="/pages/team/unilevel" />
        <HowHero kind="members" :title="copy.title" :sub="copy.intro" />
        <HowSection :title="copy.sources" initial-open>
          <HowRow :title="copy.direct" :body="copy.directBody" />
          <HowRow :title="copy.network" :body="copy.networkBody" />
          <HowRow :title="copy.device" :body="copy.deviceBody" />
        </HowSection>
        <HowSection :title="copy.settlement"><text>{{ copy.settlementBody }}</text></HowSection>
        <HowSection :title="copy.references"><text>{{ copy.referencesBody }}</text></HowSection>
        <view class="team-guide-unavailable" role="status">
          <text>{{ t.howPublished.unavailableTitle }}</text>
          <text>{{ t.howPublished.unavailableBody }}</text>
        </view>
        <view class="mx-4 mt-6">
          <view class="reward-cta reward-cta--wide" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><text>{{ w.ctaBack }}</text></view>
        </view>
      </view>
    </RewardPageSurface>
  </AppChassis>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import AppChassis from '@/components/app-chassis.vue';
import RewardPageSurface from '@/components/team/reward-page-surface.vue';
import HowPublishedContent from '@/components/team/team-rule-published.vue';
import HowHero from '@/components/team/team-rule-hero.vue';
import HowSection from '@/components/team/team-rule-section.vue';
import HowRow from '@/components/team/team-rule-section.vue';
import SubPageHeader from '@/components/sub-page-header.vue';
import { teamRuleGuideCopy } from '@/components/team/team-rule-guide-copy';
import { remoteApiEnabled } from '@/api/runtime';
import { howContentMode } from '@/lib/team-how-content-mode';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { navBack } from '@/lib/route';
const t = useT(), locale = useLocaleStore();
const w = computed(() => t.value.unilevelHowItWorks);
const copy = computed(() => teamRuleGuideCopy(locale.code));
const howMode = howContentMode(remoteApiEnabled);
function goBack() { navBack('/pages/team/unilevel'); }
</script>
<style scoped>
.team-guide-unavailable { margin: 24px 16px 0; padding: 16px 0; display: flex; flex-direction: column; gap: 8px; color: var(--v5-ink-3); font-size: 13px; line-height: 1.75; }
</style>
