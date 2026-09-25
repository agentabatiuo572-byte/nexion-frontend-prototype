<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/commissions" :title="t.publicCopy.helpTitle" />
      <HowHero :label="t.publicCopy.helpTitle" :title="t.commissions.pageTitle" :sub="t.publicCopy.earningsHelp" accent="lemon" />
      <HowSection :title="t.publicCopy.helpTitle" accent="lemon">
        <template #icon><text aria-hidden="true">ⓘ</text></template>
        <text class="block" style="font-size: 13px; line-height: 1.65; color: var(--v5-ink-2)">{{ t.publicCopy.pendingHelp }}</text>
        <view class="mt-4" style="display: flex; flex-wrap: wrap; gap: 12px">
          <text v-for="kind in kinds" :key="kind" style="font-size: 13px; color: var(--v5-ink-2)">{{ t.commissions.kind[kind] }}</text>
        </view>
        <text class="block mt-4" style="font-size: 13px; line-height: 1.65; color: var(--v5-ink-2)">{{ t.publicCopy.refundHelp }}</text>
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
const kinds = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis"] as const;
</script>
