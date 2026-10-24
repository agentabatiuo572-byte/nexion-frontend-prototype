<template>
  <view class="promotion promotion-main">
    <text class="promotion-title">{{ activity ? localized(activity.title,locale.code) : p.unavailable }}</text>
    <text class="promotion-copy">{{ t.promotion.quantityLimit }}</text>
    <view v-if="store.error" role="alert" class="promotion-flat"><text>{{ p.localError }}</text><view role="button" tabindex="0" class="promotion-link" @click="store.refresh"><text>{{ t.promotion.retry }}</text></view></view>
    <view v-if="activity" class="nx-glass-card promotion-flat">
      <view v-for="product in products" :key="product.id" class="promotion-row">
        <view class="promotion-grow"><text>{{ product.name }}</text><text class="promotion-copy">{{ product.price.toFixed(2) }} USDT</text><text v-for="rule in activity.rewardRules.filter(r=>r.productNo===product.id)" :key="rule.ruleId" class="promotion-copy">{{ t.promotion.rulePer }} {{ rule.minBuyQty }} · {{ rule.repeatMode==='PER_GROUP'?t.promotion.perGroup:t.promotion.oncePerOrder }}</text><view role="button" tabindex="0" class="promotion-link" @click="navTo(promotionDetailHref(product.id,activityId))"><text>{{ t.promotion.detail }}</text></view></view>
        <view style="display:flex;gap:12px;align-items:center">
          <view role="button" tabindex="0" :aria-label="t.uiChrome.decreaseQty+' · '+product.name" :aria-disabled="quantity(product.id)===0" class="promotion-action" @click="change(product.id,-1)">−</view>
          <text aria-live="polite">{{ quantity(product.id) }}</text>
          <view role="button" tabindex="0" :aria-label="t.uiChrome.increaseQty+' · '+product.name" :aria-disabled="totalUnits>=100" class="promotion-action" @click="change(product.id,1)">+</view>
        </view>
      </view>
    </view>
    <text v-if="error" role="alert" class="promotion-notice">{{ error }}</text>
    <view v-if="quote" class="nx-glass-card promotion-flat"><RewardRows :expected="quote.expectedRewards" :lines="quote.items" /><view class="promotion-summary total"><text>{{ t.promotion.total }}</text><text>{{ Number(quote.amountUsdt).toFixed(2) }} USDT</text></view></view>
    <view role="button" tabindex="0" class="promotion-action" :aria-disabled="!selection.length||busy" @click="readQuote"><text>{{ busy?t.promotion.loading:t.promotion.quote }}</text></view>
    <view v-if="quote" role="button" tabindex="0" class="promotion-action primary" @click="continueCheckout"><text>{{ t.promotion.continue }}</text></view>
    <view v-if="activity" role="button" tabindex="0" class="promotion-link" @click="termsOpen=true"><text>{{ t.promotion.rulesLink }}</text></view>
    <view role="button" tabindex="0" class="promotion-link" @click="navTo(promotionStoreHref())"><text>{{ t.promotion.allProducts }}</text></view>
    <PromotionTerms :open="termsOpen" :title="localized(activity?.title,locale.code)" :terms="localized(activity?.terms,locale.code)" :disclosures="promotionDisclosures(activity)" @close="termsOpen=false" />
  </view>
</template>
<script setup lang="ts">
import { computed,ref,watch } from 'vue';import { useApp } from '@/store/app';import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { usePromotion } from '@/store/promotion';import { PRODUCTS } from '@/mock/products';import { useProductPhase } from '@/composables/use-product-phase';import { isProductAvailable } from '@/store/product-availability';import type { Item,Quote } from '@/api/promotion-contracts';import { localized } from '@/lib/promotion-display';import { parseEntryItems,promotionDisclosures,promotionDetailHref,promotionCheckoutHref,promotionStoreHref } from '@/lib/promotion-entry';import { navTo } from '@/lib/route';import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=withDefaults(defineProps<{activityId:string;items?:Item[]}>(),{items:()=>[]}),t=useT(),p=computed(()=>t.value.prototypeBusiness),locale=useLocaleStore(),store=usePromotion(),app=useApp(),phase=useProductPhase();
const selection=ref<Item[]>([]),quote=ref<Quote|null>(null),error=ref(''),busy=ref(false),termsOpen=ref(false);
const activity=computed(()=>store.error?null:store.activities.find(a=>a.activityId===props.activityId)??null);
const products=computed(()=>PRODUCTS.filter(product=>activity.value?.productNos.includes(product.id)&&isProductAvailable(product,phase.value)));
const totalUnits=computed(()=>selection.value.reduce((total,item)=>total+item.quantity,0));
const draftKey=()=>`nexgrid-promotion-selection:${app.accountKey}:${props.activityId}`;
watch(()=>[props.activityId,app.accountKey,JSON.stringify(props.items)],()=>{quote.value=null;error.value='';try{const saved=uni.getStorageSync(draftKey());selection.value=props.items.length?props.items.map(i=>({...i})):parseEntryItems(typeof saved==='string'?saved:'')??[];}catch{selection.value=[];error.value=p.value.storage;}},{immediate:true});
function quantity(id:string){return selection.value.find(i=>i.productNo===id)?.quantity??0;}
function change(id:string,delta:number){if(delta>0&&totalUnits.value>=100)return;const count=quantity(id)+delta;if(count<0)return;const next=selection.value.filter(i=>i.productNo!==id);if(count)next.push({productNo:id,quantity:count});if(next.length>8)return;try{uni.setStorageSync(draftKey(),JSON.stringify(next));selection.value=next;quote.value=null;error.value='';}catch{error.value=p.value.storage;}}
function readQuote(){if(!selection.value.length||busy.value)return;busy.value=true;error.value='';try{quote.value=store.quote(selection.value,props.activityId);}catch(e){quote.value=null;error.value=p.value[(e instanceof Error?e.message:'storage') as keyof typeof p.value]??p.value.storage;}finally{busy.value=false;}}
function continueCheckout(){if(!quote.value)return;void navTo(promotionCheckoutHref(selection.value,props.activityId));}
</script>
<style src="./promotion.css"></style>
