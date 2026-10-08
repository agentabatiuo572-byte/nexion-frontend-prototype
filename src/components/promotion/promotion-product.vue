<template>
  <view v-if="rules.length" class="promotion promotion-product" data-testid="promotion-product">
    <text class="promotion-copy">{{ t.promotion.conditional }}</text>
    <view v-for="rule in rules" :key="rule.ruleId">
      <text class="promotion-copy">{{ t.promotion.rulePer }} · {{ rule.minBuyQty }} · {{ rule.repeatMode==='PER_GROUP'?t.promotion.perGroup:t.promotion.oncePerOrder }}</text>
      <text class="promotion-copy">{{ limits(rule) }}</text>
      <template v-if="publicOnly"><text v-for="reward in rule.inviterReward?[rule.buyerReward,rule.inviterReward]:[rule.buyerReward]" :key="reward.rewardRuleId" class="promotion-copy">{{ rewardSummary(reward) }}</text></template>
      <RewardRows v-else :specs="rule.inviterReward ? [rule.buyerReward, rule.inviterReward] : [rule.buyerReward]" :product-no="expanded?productNo:undefined" />
    </view>
    <text v-if="activity.eligibilityMessage" class="promotion-copy">{{ localized(activity.eligibilityMessage,locale.code) }}</text>
    <text v-if="expanded" class="promotion-copy">{{ t.promotion.deadline }} · {{ displayDeadline(activity.endsAt,locale.code) }}</text>
    <view class="promotion-link" role="button" tabindex="0" @click.stop="termsOpen=true"><text>{{ t.promotion.rulesLink }}</text></view>
    <template v-if="expanded">
      <DisclosureDetails v-for="(entry,index) in disclosures" :key="index" :disclosure="entry" />
    </template>
    <view @click.stop><PromotionTerms :open="termsOpen" :title="localized(activity.title,locale.code)" :terms="ruleTerms" :disclosures="disclosures" @close="termsOpen=false" /></view>
  </view>
</template>
<script setup lang="ts">
import { computed,ref } from 'vue';
import type { PublicPromotion,PublicRewardSpec } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { localized,displayDeadline,rewardAmount } from '@/lib/promotion-display';
import { getProduct } from '@/mock/products';
import { promotionDisclosures } from '@/lib/promotion-entry';
import RewardRows from './reward-rows.vue';
import PromotionTerms from './promotion-terms.vue';
import DisclosureDetails from './disclosure-details.vue';
const props=defineProps<{activity:PublicPromotion;productNo:string;expanded?:boolean;publicOnly?:boolean}>();
const t=useT(),locale=useLocaleStore(),termsOpen=ref(false);
const rules=computed(()=>props.activity.rewardRules.filter(rule=>rule.productNo===props.productNo));
const disclosures=computed(()=>promotionDisclosures(props.activity,props.productNo));
const productName=(id:string)=>props.publicOnly?id:getProduct(id)?.name??id;
const rewardSummary=(reward:PublicRewardSpec)=>`${reward.beneficiaryRole==='BUYER'?t.value.promotion.buyer:t.value.promotion.inviter} · ${reward.type==='DEVICE'?(reward.disclosure.deviceName || t.value.promotion.unknown)+' × '+rewardAmount(reward):rewardAmount(reward)+' '+reward.type}`;
const limits=(rule:PublicPromotion['rewardRules'][number])=>`${t.value.promotion.orderGroupLimit} · ${rule.maxGroups.mode==='LIMITED'?rule.maxGroups.value:t.value.promotion.unlimitedGroups}\n${t.value.promotion.personGroupLimit} · ${rule.maxGroupsPerPerson.mode==='LIMITED'?rule.maxGroupsPerPerson.value:t.value.promotion.unlimitedGroups}`;
const ruleTerms=computed(()=>[
  localized(props.activity.terms,locale.code),
  ...rules.value.map(rule=>[
    `${productName(rule.productNo)} · ${t.value.promotion.rulePer} ${rule.minBuyQty} · ${rule.repeatMode==='PER_GROUP'?t.value.promotion.perGroup:t.value.promotion.oncePerOrder}`,
    limits(rule),
    ...[rule.buyerReward,rule.inviterReward].filter((reward):reward is NonNullable<typeof reward>=>!!reward).map(rewardSummary),
  ].join('\n')),
  `${t.value.promotion.deadline} · ${displayDeadline(props.activity.endsAt,locale.code)}`,
].join('\n\n'));
</script>
<style src="./promotion.css"></style>
<style scoped>
.promotion-product { margin-top:14px; border-top:1px solid var(--v5-border); padding-top:14px; }
</style>
