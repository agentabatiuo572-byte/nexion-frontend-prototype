<template>
  <NxSheet :open="open" :title="title || t.promotion.rules" @close="emit('close')">
    <view v-for="(entry,index) in uniqueDisclosures" :key="index" class="promotion-rule-section">
      <text class="promotion-title">{{ localized(entry.title,locale.code) }}</text>
      <DisclosureDetails :disclosure="entry" />
    </view>
    <view v-for="rule in rules" :key="rule.id" class="promotion-rule-section"><text class="promotion-copy" style="white-space:pre-wrap">{{ rule.text }}</text></view>
    <text v-if="uniqueTerms" class="promotion-copy" style="white-space:pre-wrap;margin-top:14px">{{ uniqueTerms }}</text>
  </NxSheet>
</template>
<script setup lang="ts">
import NxSheet from '@/components/ui/nx-sheet.vue';
import { computed } from 'vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { localized } from '@/lib/promotion-display';
import type { RewardDisclosure } from '@/api/promotion-contracts';
import DisclosureDetails from './disclosure-details.vue';
import { uniquePromotionParagraphs } from '@/lib/promotion-paragraphs';
const props=defineProps<{open:boolean;title?:string;terms?:string;disclosures?:RewardDisclosure[];rules?:{id:string;text:string}[]}>();
const emit=defineEmits<{(e:'close'):void}>();const t=useT();const locale=useLocaleStore();
const uniqueDisclosures = computed(() => Array.from(new Map((props.disclosures ?? []).map(entry => [JSON.stringify(entry), entry])).values()));
const uniqueTerms = computed(() => {
  const value = props.terms?.trim() ?? '';
  return uniquePromotionParagraphs(value, uniqueDisclosures.value.flatMap(entry => [localized(entry.terms,locale.code),localized(entry.refundTerms,locale.code),localized(entry.benefitDescription,locale.code)]));
});
</script>
<style src="./promotion.css"></style>

<style scoped>.promotion-rule-section + .promotion-rule-section { margin-top:24px;padding-top:24px;border-top:1px solid var(--v5-border); }</style>
