<template>
  <AppChassis active="team"><view class="pb-6" style="color:var(--v5-ink)">
    <SubPageHeader back="/pages/team/team" :title="w.title" :action-label="w.rules" :action="openRules" plain />
    <view class="px-4" style="display:flex;flex-direction:column;gap:16px">
      <GlassSegments v-model="period" :label="w.period" :options="periodOptions" layout="scroll" />
      <view class="nx-glass-card" style="padding:18px;border-radius:20px">
        <text style="display:block;font-size:14px">{{ w.total }}</text>
        <view style="display:flex;gap:24px;margin-top:10px;flex-wrap:wrap">
          <view><text class="block font-display tabular-nums" style="font-size:28px;color:var(--v5-brand);overflow-wrap:anywhere">{{ summary.amountUSDT.toFixed(2) }}</text><text>USDT</text></view>
          <view><text class="block font-display tabular-nums" style="font-size:28px;color:var(--v5-brand-2);overflow-wrap:anywhere">{{ summary.amountNEX.toFixed(2) }}</text><text>NEX</text></view>
        </view>
        <text class="block" style="margin-top:10px;font-size:12px;color:var(--v5-ink-3)">{{ summary.count }} {{ w.groups }}</text>
        <text class="block" style="margin-top:8px;font-size:12px;line-height:1.6;color:var(--v5-ink-3)">{{ w.netHint }}</text>
      </view>
      <GlassSegments v-model="category" :label="w.source" :options="categories" layout="wrap" />
      <text v-if="category==='device_earning'" style="font-size:13px;line-height:1.6;color:var(--v5-ink-3)">{{ w.platformPays }}</text>
      <view role="button" tabindex="0" style="min-height:44px;display:flex;align-items:center;color:var(--v5-brand)" @click="refresh"><text>{{ w.refresh }}</text></view>
      <EmptyState v-if="!result.count" kind="no-filter-results" :title="w.empty" :desc="w.emptyDesc" :cta-label="w.invite" @cta="navTo('/pages/team/team')" />
      <view v-for="event in result.events" :key="event.id" class="nx-unilevel-member-row" style="padding:14px 0;border-bottom:1px solid var(--v5-border)">
        <view style="display:flex;justify-content:space-between;gap:16px">
          <view style="min-width:0;flex:1"><text class="block" style="font-size:14px;overflow-wrap:anywhere">{{ event.sourceUserName }}</text><text class="block" style="font-size:12px;color:var(--v5-ink-3);margin-top:4px">{{ new Date(event.ts).toLocaleDateString(dateLocale()) }}</text></view>
          <view style="max-width:60%;text-align:right;overflow-wrap:anywhere"><text class="block font-mono-tabular" style="color:var(--v5-brand)">{{ event.amountUSDT.toFixed(2) }} USDT</text><text class="block font-mono-tabular" style="color:var(--v5-brand-2)">{{ event.amountNEX.toFixed(2) }} NEX</text></view>
        </view>
        <text class="block" style="font-size:12px;color:var(--v5-ink-3);margin-top:6px;overflow-wrap:anywhere">{{ category==='device_earning'?w.receipt:w.order }} · {{ event.sourceRef??event.orderId??event.id }}</text>
        <text v-if="category==='extended'" class="block" style="font-size:12px;color:var(--v5-ink-3)">L{{ event.layer }}</text>
        <text v-if="event.sourceDeviceId" class="block" style="font-size:12px;color:var(--v5-ink-3)">{{ w.device }} · {{ event.sourceDeviceId }}</text>
        <text class="block" style="font-size:12px;color:var(--v5-ink-3);margin-top:6px">{{ status(event) }}</text>
        <text v-if="event.status==='recovery_pending'" class="block" style="font-size:12px;color:var(--v5-warning)">{{ w.pending }} · {{ (event.recoveryPendingUSDT??0).toFixed(2) }} USDT · {{ (event.recoveryPendingNEX??0).toFixed(2) }} NEX</text>
      </view>
      <view v-if="result.events.length<result.count" role="button" tabindex="0" class="nx-unilevel-load-more" style="min-height:44px;display:flex;align-items:center;justify-content:center" @click="page++"><text>{{ w.more }}</text></view>
      <view role="button" tabindex="0" style="min-height:44px;display:flex;align-items:center;color:var(--v5-brand)" @click="openRules"><text>{{ w.rules }}</text></view>
    </view>
  </view></AppChassis>
</template>
<script setup lang="ts">
import { computed,ref,watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppChassis from '@/components/app-chassis.vue';
import SubPageHeader from '@/components/sub-page-header.vue';
import GlassSegments from '@/components/glass-segments.vue';
import EmptyState from '@/components/empty-state.vue';
import { useT } from '@/i18n/use-t';
import { dateLocale } from '@/i18n/format';
import { useApp } from '@/store/app';
import { useCommission,type CommissionEvent } from '@/store/commission';
import { teamRewardPage,commissionAssetStatus,type TeamRewardCategory,type TeamRewardPeriod } from '@/lib/prototype-team-rewards';
import { navTo } from '@/lib/route';
const t=useT(),w=computed(()=>t.value.prototypeBusiness),app=useApp(),commission=useCommission();
const period=ref<TeamRewardPeriod>('month'),category=ref<TeamRewardCategory>('direct'),page=ref(1),now=ref(Date.now());
const result=computed(()=>teamRewardPage(commission.events,category.value,period.value,page.value,now.value));
const summary=computed(()=>{if(category.value==='device_earning')return result.value;const direct=teamRewardPage(commission.events,'direct',period.value,1,now.value),extended=teamRewardPage(commission.events,'extended',period.value,1,now.value);return {amountUSDT:direct.amountUSDT+extended.amountUSDT,amountNEX:direct.amountNEX+extended.amountNEX,count:direct.count+extended.count};});
const periodOptions=computed(()=>(['today','week','month','all'] as const).map(value=>({value,label:w.value[value]})));
const categories=computed(()=>[{value:'direct',label:w.value.purchase},{value:'extended',label:w.value.networkPurchase},{value:'device_earning',label:w.value.deviceEarning}]);
function status(event:CommissionEvent){const usdt=commissionAssetStatus(event,'USDT'),nex=commissionAssetStatus(event,'NEX');return usdt===nex?w.value[usdt]:`USDT ${w.value[usdt]} · NEX ${w.value[nex]}`;}
function refresh(){commission.bindAccount(app.accountKey);commission.unlockMatured();now.value=Date.now();page.value=1;}
function openRules(){void navTo('/pages/team/unilevel-how');}
watch([period,category,()=>app.accountKey],()=>{page.value=1;now.value=Date.now();});onShow(refresh);
</script>
