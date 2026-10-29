<template>
  <AppChassis active="team">
    <RewardPageSurface>
      <HowPublishedContent v-if="howMode === 'published'" :heading="t.headerTitles.teamBinary + t.headerTitles.howItWorksSuffix" :back-label="w.ctaBack" kind="balance" content-key="team-binary-how" back="/pages/team/binary" />
      <view v-if="howMode === 'local'" class="pb-8" style="color: var(--v5-ink)">
        <SubPageHeader :title="t.headerTitles.teamBinary + t.headerTitles.howItWorksSuffix" back="/pages/team/binary" />
        <HowHero kind="balance" :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" />

        <HowSection :title="w.s1Title" initial-open>
          <text class="block">{{ w.s1Para1 }}</text>
          <text class="block" style="margin-top: 10px">{{ t.binary.spilloverHint }}</text>
        </HowSection>

        <HowSection :title="w.s4Title">
          <text class="block">{{ t.binary.gapHint }}</text>
          <view class="binary-how-unavailable" role="status">
            <text class="block">{{ t.howPublished.unavailableTitle }}</text>
            <text class="block" style="margin-top: 8px">{{ t.howPublished.unavailableBody }}</text>
          </view>
        </HowSection>

        <HowSection :title="w.faqTitle">
          <HowFaqRow :q="w.faqQ1" :a="t.binary.spilloverHint" />
          <HowFaqRow :q="w.faqQ2" :a="t.binary.blockReasons.BINARY_THRESHOLD_NOT_MET" />
          <HowFaqRow :q="w.faqQ3" :a="t.howPublished.unavailableBody" />
        </HowSection>

        <view class="mx-4 mt-6">
          <view class="reward-cta reward-cta--wide" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
            <text>{{ w.ctaBack }}</text>
          </view>
        </view>
      </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import HowPublishedContent from "@/components/team/team-rule-published.vue";
import { remoteApiEnabled } from "@/api/runtime";
import { howContentMode } from "@/lib/team-how-content-mode";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/team/team-rule-hero.vue";
import HowSection from "@/components/team/team-rule-section.vue";
import HowFaqRow from "@/components/team/team-rule-section.vue";
import { useT } from "@/i18n/use-t";
import { navBack } from "@/lib/route";

const t = useT();
const howMode = howContentMode(remoteApiEnabled);
const w = computed(() => t.value.binaryHowItWorks);
// The local runtime has no published point-to-reward rules. Keep their absence
// explicit; the former USD examples and static thresholds are not point data.
function goBack() { navBack("/pages/team/binary"); }
</script>

<style scoped>
.binary-how-unavailable { margin-top: var(--ui-space-inset); padding: var(--ui-space-inset) 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink-3); }
</style>
