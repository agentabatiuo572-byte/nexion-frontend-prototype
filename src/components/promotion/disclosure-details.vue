<template>
  <view>
    <text class="promotion-copy" style="white-space:pre-wrap;margin-top:12px">{{ localized(disclosure.benefitDescription,locale.code) }}</text>
    <view v-if="disclosure.deviceRights" class="promotion-entitlements"><view v-for="row in rights" :key="row.label" class="promotion-summary"><text>{{ row.label }}</text><text>{{ row.value }}</text></view></view>
    <text class="promotion-copy" style="white-space:pre-wrap;margin-top:12px">{{ localized(disclosure.terms,locale.code) }}</text>
    <text class="promotion-title" style="margin-top:16px;font-size:15px">{{ t.promotion.returnPolicy }}</text><text class="promotion-copy" style="white-space:pre-wrap">{{ localized(disclosure.refundTerms,locale.code) }}</text>
  </view>
</template>
<script setup lang="ts">
import{computed}from'vue';import{useT}from'@/i18n/use-t';import{useLocaleStore}from'@/store/locale';import{localized}from'@/lib/promotion-display';import type{RewardDisclosure}from'@/api/promotion-contracts';
const props=defineProps<{disclosure:RewardDisclosure}>(),t=useT(),locale=useLocaleStore();
const rights=computed(()=>{const d=props.disclosure.deviceRights;if(!d)return[];const copy=t.value.promotion;return[{label:copy.activation,value:d.activationMode==='AUTO'?copy.automatic:copy.manual},{label:copy.effective,value:d.effectiveOn==='ISSUED'?copy.onIssued:copy.onActivated},{label:copy.duration,value:d.durationDays===null?copy.noExpirySchedule:String(d.durationDays)+' '+copy.days},{label:copy.tasks,value:d.taskEnabled?copy.allowed:copy.notAllowed},{label:copy.holding,value:d.countsAsDeviceHolding?copy.yes:copy.no},{label:copy.rank,value:d.countsForRank?copy.yes:copy.no},{label:copy.transfer,value:d.transferable?copy.allowed:copy.notAllowed},{label:copy.exchange,value:d.exchangeable?copy.allowed:copy.notAllowed},{label:copy.revocation,value:d.revocationMode==='REVOKE_IF_UNUSED'?copy.revokeUnused:copy.reviewAfterUse}];});
</script>
<style src="./promotion.css"></style>
