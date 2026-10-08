<template>
  <view class="promotion promotion-main" data-testid="promotion-bundle">
    <view>
      <text class="promotion-title">{{ activity ? localized(activity.title,locale.code) : t.promotion.bundle }}</text>
      <text class="promotion-copy">{{ t.promotion.quantityLimit }}</text>
      <text v-if="scopeId&&(contextStatus==='loading'||contextStatus==='idle')" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
      <view v-if="scopeId&&contextStatus==='error'" role="alert"><text class="promotion-copy">{{ t.promotion.errorNote }}</text><view class="promotion-link" role="button" tabindex="0" @click="refreshContext"><text>{{ t.promotion.retry }}</text></view></view>
      <text v-if="scopeId&&contextStatus==='ready'&&!available" class="promotion-copy">{{ localized(activity?.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
    </view>
    <view class="promotion-flat">
      <text class="promotion-title">{{ t.promotion.selected }}</text>
      <text v-if="!selection.length" class="promotion-copy">{{ t.promotion.selectTwo }}</text>
      <view v-for="item in selection" :key="item.productNo" class="bundle-item">
        <view class="promotion-row">
          <image v-if="imageFor(item.productNo)" class="promotion-image" :src="imageFor(item.productNo)" mode="aspectFill" :alt="nameFor(item.productNo)" />
          <view class="promotion-grow">
            <text class="bundle-name">{{ nameFor(item.productNo) }}</text>
            <text v-if="!productFor(item.productNo)" class="promotion-copy">{{ t.promotion.noMatchingProducts }}</text>
            <view class="bundle-stepper" :aria-label="nameFor(item.productNo)+' · '+t.promotion.quantity">
              <view role="button" :tabindex="item.quantity<=1?-1:0" :aria-disabled="item.quantity<=1" :aria-label="t.uiChrome.decreaseQty" @click="changeQuantity(item.productNo,-1)">−</view>
              <text aria-live="polite">{{ item.quantity }}</text>
              <view role="button" :aria-label="t.uiChrome.increaseQty" :tabindex="totalUnits>=100?-1:0" :aria-disabled="totalUnits>=100" @click="changeQuantity(item.productNo,1)">+</view>
            </view>
          </view>
          <view class="bundle-remove" role="button" tabindex="0" :aria-label="t.promotion.removeSelection+' · '+nameFor(item.productNo)" @click="remove(item.productNo)">×</view>
        </view>
      </view>
    </view>
    <view v-if="catalogStatus!=='ready'" class="promotion-flat" role="status"><text class="promotion-copy">{{ catalogStatus==='error'?t.store.catalogErrorBody:t.store.catalogLoadingBody }}</text><view class="promotion-link" role="button" tabindex="0" @click="refreshProductCatalog(true)"><text>{{ t.promotion.retry }}</text></view></view>
    <view v-if="suggestions.length" class="promotion-flat">
      <text class="promotion-title">{{ t.promotion.buyMore }}</text>
      <view v-for="product in suggestions" :key="product.id" class="promotion-row">
        <image v-if="imageFor(product.id)" class="promotion-image" :src="imageFor(product.id)" mode="aspectFill" :alt="product.name" />
        <view class="promotion-grow"><text class="bundle-name">{{ product.name }}</text><view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionDetailHref(product.id,scopeId))"><text>{{ t.promotion.detail }}</text></view></view>
        <view class="bundle-add" role="button" :aria-label="t.promotion.selected+' · '+product.name" :tabindex="selection.length>=8||totalUnits>=100?-1:0" :aria-disabled="selection.length>=8||totalUnits>=100" @click="add(product.id)">+</view>
      </view>
    </view>
    <view class="promotion-flat">
      <text class="promotion-title">{{ t.promotion.expected }}</text>
      <text v-if="quoteStatus==='loading'" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
      <text v-else-if="quoteStatus==='error'" class="promotion-copy" role="alert">{{ t.promotion.errorNote }}</text>
      <text v-else-if="!quote" class="promotion-copy">{{ t.promotion.awaitingQuote }}</text>
      <template v-if="quote">
        <RewardRows :expected="quote.expectedRewards" :lines="quote.items" />
        <text v-for="(warning,index) in quote.warnings" :key="index" class="promotion-copy">{{ localized(warning,locale.code) }}</text>
        <text v-if="quote.eligibility!=='ELIGIBLE'" class="promotion-notice">{{ t.promotion.disabledNote }}</text>
        <view class="promotion-summary"><text>{{ t.promotion.subtotal }}</text><text>{{ quote.subtotalUsdt }} USDT</text></view>
        <view class="promotion-summary"><text>{{ t.promotion.discount }}</text><text>{{ quote.discountUsdt }} USDT</text></view>
        <view class="promotion-summary total"><text>{{ t.promotion.total }}</text><text>{{ quote.amountUsdt }} USDT</text></view>
      </template>
      <text class="promotion-copy">{{ t.promotion.rewardNote }}</text>
    </view>
    <view v-if="activity" class="promotion-link" role="button" tabindex="0" @click="termsOpen=true"><text>{{ t.promotion.rulesLink }}</text></view>
    <view v-if="!signedIn" class="promotion-action primary" role="button" tabindex="0" @click="signIn"><LiquidGlass :radius="999" tone="control" /><text>{{ t.promotion.signIn }}</text></view>
    <view v-else class="promotion-action" role="button" :tabindex="canQuote?0:-1" :aria-disabled="!canQuote" @click="refreshQuote"><LiquidGlass :radius="999" tone="control" /><text>{{ t.promotion.quote }}</text></view>
    <text v-if="selection.length<2" class="promotion-copy">{{ t.promotion.selectTwo }}</text>
    <view class="promotion-action primary" role="button" :tabindex="canContinue?0:-1" :aria-disabled="!canContinue" @click="continueCheckout"><LiquidGlass :radius="999" tone="control" /><text>{{ t.promotion.continue }}</text></view>
    <view v-if="scopeId" class="promotion-link" role="button" tabindex="0" @click="clearScope"><text>{{ t.promotion.ordinary }}</text></view>
    <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionStoreHref(scopeId))"><text>{{ t.promotion.buyMore }}</text></view>
    <PromotionTerms :open="termsOpen" :title="localized(activity?.title,locale.code)" :terms="ruleTerms" :disclosures="promotionDisclosures(activity)" @close="termsOpen=false" />
  </view>
</template>
<script setup lang="ts">
import { computed,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import { onHide,onShow } from '@dcloudio/uni-app';
import { promotionApi,sessionVault } from '@/api/runtime';
import type { Quote } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { productCatalogPresentation,productCatalogState,refreshProductCatalog } from '@/store/product-catalog';
import { useProductPhase } from '@/composables/use-product-phase';
import { isProductAvailable } from '@/store/product-availability';
import { usePromotionContext } from '@/composables/use-promotion-context';
import { readAccountRow,writeAccountRow } from '@/store/account-scoped-storage';
import { catalogProductImageUrl } from '@/lib/product-image';
import { localized,displayDeadline,rewardAmount } from '@/lib/promotion-display';
import { navTo } from '@/lib/route';
import { createPromotionReadFence,isEntryQuoteFresh,restoreEntrySelection,promotionBundleHref,promotionCheckoutHref,promotionDetailHref,promotionDisclosures,promotionStoreHref,validEntryItems,type EntryItem,type EntrySelectionDraft } from '@/lib/promotion-entry';
import LiquidGlass from '@/components/liquid-glass.vue';
import RewardRows from './reward-rows.vue';
import PromotionTerms from './promotion-terms.vue';
const props=defineProps<{activityId:string;initialItems:EntryItem[]}>();
const app=useApp(),locale=useLocaleStore(),t=useT(),phase=useProductPhase();
const scopeId=ref(props.activityId),selection=ref<EntryItem[]>([]),termsOpen=ref(false);
const {activity,status:contextStatus,available,refresh:refreshContext}=usePromotionContext(scopeId);
const quote=ref<Quote|null>(null),quoteStatus=ref<'idle'|'loading'|'ready'|'error'>('idle');
const fence=createPromotionReadFence();let visible=true;
const clockNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
let quoteReceivedAt=0;let expiryTimer:ReturnType<typeof setInterval>|null=null;
const storageKey='growth-promotion-selection:'+props.activityId;
function restore(initial:EntryItem[]=props.initialItems){
  const saved=readAccountRow<EntrySelectionDraft>(storageKey,app.accountKey);
  selection.value=restoreEntrySelection(initial,saved);
}
restore(props.initialItems);
const catalogStatus=computed(()=>productCatalogState.status);
const catalog=computed(()=>productCatalogPresentation.value?.products??[]);
const productFor=(id:string)=>catalog.value.find(product=>product.id===id);
const nameFor=(id:string)=>productFor(id)?.name??id;
const imageFor=(id:string)=>catalogProductImageUrl(productFor(id)?.imageUrl,'')??'';
const ruleTerms=computed(()=>activity.value?[
  localized(activity.value.terms,locale.code),
  ...activity.value.rewardRules.map(rule=>[
    `${nameFor(rule.productNo)} · ${t.value.promotion.rulePer} ${rule.minBuyQty} · ${rule.repeatMode==='PER_GROUP'?t.value.promotion.perGroup:t.value.promotion.oncePerOrder}`,
    `${t.value.promotion.orderGroupLimit} · ${rule.maxGroups.mode==='LIMITED'?rule.maxGroups.value:t.value.promotion.unlimitedGroups}`,
    `${t.value.promotion.personGroupLimit} · ${rule.maxGroupsPerPerson.mode==='LIMITED'?rule.maxGroupsPerPerson.value:t.value.promotion.unlimitedGroups}`,
    ...[rule.buyerReward,rule.inviterReward].filter(reward=>!!reward).map(reward=>reward?`${reward.beneficiaryRole==='BUYER'?t.value.promotion.buyer:t.value.promotion.inviter} · ${reward.type==='DEVICE'?(reward.disclosure.deviceName || t.value.promotion.unknown)+' × '+rewardAmount(reward):rewardAmount(reward)+' '+reward.type}`:''),
  ].join('\n')),
  `${t.value.promotion.deadline} · ${displayDeadline(activity.value.endsAt,locale.code)}`,
].join('\n\n'):'');
const totalUnits=computed(()=>selection.value.reduce((total,item)=>total+item.quantity,0));
const signedIn=computed(()=>{void app.accountBindingEpoch;void app.accountKey;return !!sessionVault.read();});
const suggestions=computed(()=>catalog.value.filter(product=>!selection.value.some(item=>item.productNo===product.id)&&product.productType!=='SHARE'&&isProductAvailable(product,phase.value)&&(!scopeId.value||activity.value?.productNos.includes(product.id))));
const productsReady=computed(()=>catalogStatus.value==='ready'&&selection.value.every(item=>{const product=productFor(item.productNo);return product&&isProductAvailable(product,phase.value)&&(!scopeId.value||activity.value?.productNos.includes(item.productNo));}));
const canQuote=computed(()=>signedIn.value&&validEntryItems(selection.value,2)&&productsReady.value&&(!scopeId.value||available.value)&&quoteStatus.value!=='loading');
const canContinue=computed(()=>canQuote.value&&quoteStatus.value==='ready'&&quote.value?.eligibility==='ELIGIBLE');
function invalidate(){fence.invalidate();quote.value=null;quoteStatus.value='idle';}
watch(selection,()=>{invalidate();writeAccountRow(storageKey,app.accountKey,{items:selection.value,entryItems:props.initialItems});},{deep:true,flush:'sync'});
watch([scopeId,()=>activity.value?.version],invalidate);
watch([()=>app.accountKey,()=>app.accountBindingEpoch],()=>{invalidate();termsOpen.value=false;restore();});
function add(productNo:string){if(selection.value.length>=8||totalUnits.value>=100||!suggestions.value.some(product=>product.id===productNo))return;selection.value=[...selection.value,{productNo,quantity:1}];}
function remove(productNo:string){selection.value=selection.value.filter(item=>item.productNo!==productNo);}
function changeQuantity(productNo:string,delta:number){const item=selection.value.find(entry=>entry.productNo===productNo);if(!item||item.quantity+delta<1||totalUnits.value+delta>100)return;selection.value=selection.value.map(entry=>entry.productNo===productNo?{...entry,quantity:entry.quantity+delta}:entry);}
function clearScope(){invalidate();void navTo(promotionStoreHref());}
function signIn(){void navTo('/pages/login/login?return='+encodeURIComponent(promotionBundleHref(scopeId.value,selection.value)));}
async function refreshQuote(){
  if(!canQuote.value)return;
  const ticket=fence.next(),identity=`${app.accountKey}:${app.accountBindingEpoch}`,chosen=selection.value.map(item=>({...item}));
  quote.value=null;quoteStatus.value='loading';
  try{
    const result=await promotionApi.quote(chosen,scopeId.value||null);
    if(!visible||!fence.current(ticket)||identity!==`${app.accountKey}:${app.accountBindingEpoch}`)return;
    quoteReceivedAt=clockNow();quote.value=result;quoteStatus.value='ready';
  }catch{if(visible&&fence.current(ticket))quoteStatus.value='error';}
}
function freshQuote(){return !!quote.value&&isEntryQuoteFresh(quote.value.expiresAt,quote.value.serverTime,clockNow()-quoteReceivedAt);}
function continueCheckout(){if(!freshQuote()){invalidate();return;}if(canContinue.value)void navTo(promotionCheckoutHref(selection.value,scopeId.value));}
onMounted(()=>{expiryTimer=setInterval(()=>{if(quote.value&&!freshQuote())invalidate();},1000);});
onHide(()=>{visible=false;invalidate();termsOpen.value=false;});
onShow(()=>{visible=true;invalidate();});
onBeforeUnmount(()=>{visible=false;fence.invalidate();if(expiryTimer)clearInterval(expiryTimer);});
</script>
<style src="./promotion.css"></style>
<style scoped>
.bundle-name { display:block;font-size:15px;font-weight:600;overflow-wrap:anywhere; }
.bundle-stepper { display:flex;align-items:center;border:1px solid var(--v5-border);border-radius:999px;width:max-content;max-width:100%;margin-top:10px;overflow:hidden; }
.bundle-stepper view,.bundle-add,.bundle-remove { min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;font-size:20px; }
.bundle-stepper view { background:var(--v5-surface-2); }
.bundle-stepper text { min-width:32px;text-align:center;font-variant-numeric:tabular-nums; }
.bundle-add { color:var(--v5-brand); }
[aria-disabled=true] { opacity:.4; }
.promotion-action { position:relative;isolation:isolate;overflow:hidden; }
.promotion-action text { position:relative;z-index:1; }
@media(max-width:340px){.promotion-image{width:52px;height:52px}.promotion-row{gap:9px}}
</style>
