<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/leadership-pool" :title="t.publicCopy.helpTitle" />
      <HowHero :label="t.publicCopy.helpTitle" :title="t.pool.pageTitle" :sub="t.publicCopy.earningsHelp" accent="purple" />
      <HowSection :title="t.publicCopy.helpTitle" accent="purple">
        <template #icon><text aria-hidden="true">ⓘ</text></template>
        <text class="block" style="font-size: 13px; line-height: 1.65; color: var(--v5-ink-2)">{{ t.publicCopy.statusHelp }}</text>
      </HowSection>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import { useT } from "@/i18n/use-t";

const t = useT();
</script>
