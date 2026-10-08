<template>
  <AppChassis active="me">
    <SubPageHeader back="/pages/me/rewards" :title="t.promotion.rewardCategory" />
    <PromotionRewardList :activity-id="activityId" :order-no="orderNo" />
  </AppChassis>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import PromotionRewardList from "@/components/promotion/promotion-reward-list.vue";
import { useT } from "@/i18n/use-t";
import { takeNavigationQuery } from "@/lib/route";
const t = useT(), activityId = ref(""), orderNo = ref("");
onLoad(options => {
  const query = new URLSearchParams(takeNavigationQuery("/pages/events/promotion-rewards"));
  activityId.value = String(options?.activityId ?? query.get("activityId") ?? "").trim();
  orderNo.value = String(options?.orderNo ?? query.get("orderNo") ?? "").trim();
});
</script>
