<template>
  <view v-if="open" class="promotion-overlay">
    <view class="promotion-overlay-dismiss" aria-hidden="true" @click="emit('close')" />
    <view class="promotion-modal promotion-terms" role="dialog" aria-modal="true" :aria-label="t.promotion.rules" tabindex="-1">
      <LiquidGlass :radius="28" tone="navigation" />
      <view class="promotion-modal-content">
      <text class="promotion-title">{{ title || t.promotion.rules }}</text>
      <text class="promotion-copy" style="white-space:pre-wrap;margin-top:14px">{{ terms }}</text>
      <template v-for="(entry,index) in disclosures" :key="index">
        <view class="promotion-row"><view class="promotion-grow"><text class="promotion-title">{{ localized(entry.title,locale.code) }}</text><DisclosureDetails :disclosure="entry" /></view></view>
      </template>
      <PromotionAction class="promotion-action primary" style="margin-top:24px" role="button" tabindex="0" @click="emit('close')"><text>{{ t.promotion.back }}</text></PromotionAction>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import PromotionAction from '@/components/promotion/promotion-action.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { toRef } from 'vue';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import { localized } from '@/lib/promotion-display';
import type { RewardDisclosure } from '@/api/promotion-contracts';
import DisclosureDetails from './disclosure-details.vue';
const props=defineProps<{open:boolean;title?:string;terms?:string;disclosures?:RewardDisclosure[]}>();
const emit=defineEmits<{(e:'close'):void}>();const t=useT();const locale=useLocaleStore();
useDialogA11y(toRef(props,'open'),'.promotion-terms',()=>emit('close'));
</script>
<style src="./promotion.css"></style>
