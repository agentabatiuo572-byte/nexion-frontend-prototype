<template>
  <view>
    <text class="promotion-copy" style="white-space:pre-wrap;margin-top:12px">{{ localized(disclosure.benefitDescription,locale.code) }}</text>
    <view v-if="disclosure.deviceRights" class="promotion-entitlements" role="list"><view v-for="(sentence,index) in rights" :key="index" class="disclosure-right" role="listitem"><text aria-hidden="true">·</text><text>{{ sentence }}</text></view></view>
    <text v-if="terms" class="promotion-copy" style="white-space:pre-wrap;margin-top:12px">{{ terms }}</text>
    <text class="promotion-title" style="margin-top:16px;font-size:var(--ui-type-body)">{{ t.promotion.returnPolicy }}</text><text class="promotion-copy" style="white-space:pre-wrap">{{ localized(disclosure.refundTerms,locale.code) }}</text>
  </view>
</template>
<script setup lang="ts">
import{computed}from'vue';import{useT}from'@/i18n/use-t';import{useLocaleStore}from'@/store/locale';import{localized}from'@/lib/promotion-display';import type{RewardDisclosure}from'@/api/promotion-contracts';
const props=defineProps<{disclosure:RewardDisclosure}>(),t=useT(),locale=useLocaleStore();
import { uniquePromotionParagraphs } from '@/lib/promotion-paragraphs';
const terms=computed(()=>uniquePromotionParagraphs(localized(props.disclosure.terms,locale.code),[localized(props.disclosure.benefitDescription,locale.code),localized(props.disclosure.refundTerms,locale.code)]));
const rights=computed(()=>{
  const d=props.disclosure.deviceRights;if(!d)return[];
  if(locale.code==='zh')return[
    `${d.activationMode==='AUTO'?'赠送设备自动激活':'赠送设备需要手动激活'}，${d.effectiveOn==='ISSUED'?'权益在发放后生效':'权益在激活后生效'}。`,
    d.durationDays===null?'这台赠送设备暂无自动到期日期。':`权益有效期为 ${d.durationDays} 天。`,
    d.taskEnabled?'这台设备可以执行算力作业。':'这台设备不能执行算力作业。',
    `${d.countsAsDeviceHolding?'计入':'不计入'}设备持有数，${d.countsForRank?'计入':'不计入'}等级资格核验。`,
    `${d.transferable?'可以转让':'不可转让'}，${d.exchangeable?'可以兑换':'不可兑换'}。`,
    d.revocationMode==='REVOKE_IF_UNUSED'?'未使用的赠送设备可撤回。':'使用后的赠送设备需人工核验。',
  ];
  if(locale.code==='vi')return[
    `${d.activationMode==='AUTO'?'Thiết bị tặng được kích hoạt tự động':'Thiết bị tặng cần được kích hoạt thủ công'}; ${d.effectiveOn==='ISSUED'?'quyền lợi có hiệu lực khi được cấp':'quyền lợi có hiệu lực khi kích hoạt'}.`,
    d.durationDays===null?'Thiết bị tặng chưa có ngày tự động hết hạn.':`Quyền lợi có hiệu lực trong ${d.durationDays} ngày.`,
    d.taskEnabled?'Thiết bị có thể thực hiện tác vụ tính toán.':'Thiết bị không thể thực hiện tác vụ tính toán.',
    `${d.countsAsDeviceHolding?'Được tính':'Không được tính'} vào số thiết bị sở hữu; ${d.countsForRank?'được tính':'không được tính'} khi xét điều kiện cấp bậc.`,
    `${d.transferable?'Có thể chuyển nhượng':'Không thể chuyển nhượng'}; ${d.exchangeable?'có thể quy đổi':'không thể quy đổi'}.`,
    d.revocationMode==='REVOKE_IF_UNUSED'?'Thiết bị tặng có thể bị thu hồi khi chưa sử dụng.':'Thiết bị tặng đã sử dụng cần được kiểm tra thủ công.',
  ];
  return[
    `${d.activationMode==='AUTO'?'The gift device activates automatically':'The gift device needs manual activation'}; ${d.effectiveOn==='ISSUED'?'benefits take effect when issued':'benefits take effect when activated'}.`,
    d.durationDays===null?'No automatic expiry date is scheduled for this gift device.':`Benefits last ${d.durationDays} days.`,
    d.taskEnabled?'This device can run compute jobs.':'This device cannot run compute jobs.',
    `${d.countsAsDeviceHolding?'Counts':'Does not count'} toward devices held; ${d.countsForRank?'counts':'does not count'} toward rank eligibility.`,
    `${d.transferable?'Can be transferred':'Cannot be transferred'}; ${d.exchangeable?'can be exchanged':'cannot be exchanged'}.`,
    d.revocationMode==='REVOKE_IF_UNUSED'?'The gift device may be revoked while unused.':'A used gift device requires manual review.',
  ];
});
</script>
<style src="./promotion.css"></style>
<style scoped>
.promotion-entitlements { margin-top:12px; }
.disclosure-right { display:flex; align-items:flex-start; gap:8px; padding:6px 0; color:var(--v5-ink-2); font:400 14px/22px var(--font-v5); }
.disclosure-right > :last-child { min-width:0; overflow-wrap:anywhere; }
</style>
