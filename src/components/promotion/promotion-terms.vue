<template>
  <NxSheet :open="open" :title="title || t.promotion.rules" @close="emit('close')">
    <view v-for="(entry,index) in uniqueDisclosures" :key="index" class="promotion-rule-section">
      <text class="promotion-title">{{ localized(entry.title,locale.code) }}</text>
      <DisclosureDetails :disclosure="entry" />
    </view>
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
const props=defineProps<{open:boolean;title?:string;terms?:string;disclosures?:RewardDisclosure[]}>();
const emit=defineEmits<{(e:'close'):void}>();const t=useT();const locale=useLocaleStore();
const uniqueDisclosures = computed(() => Array.from(new Map((props.disclosures ?? []).map(entry => [JSON.stringify(entry), entry])).values()));
const uniqueTerms = computed(() => {
  const value = props.terms?.trim() ?? '';
  return uniqueDisclosures.value.some(entry => localized(entry.terms,locale.code).trim() === value) ? '' : value;
});
</script>
<style src="./promotion.css"></style>

<style scoped>.promotion-rule-section + .promotion-rule-section { margin-top:24px;padding-top:24px;border-top:1px solid var(--v5-border); }</style>
