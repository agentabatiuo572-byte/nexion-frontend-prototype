<template>
  <AppChassis>
    <view class="px-4 py-6" role="status">{{ t.computeShare.disabledToast }}</view>
  </AppChassis>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import { useT } from "@/i18n/use-t";
import { navReplace } from "@/lib/route";

const t = useT();
// Old bookmarks return to the ordinary device inventory; without external requests.
onMounted(() => navReplace("/pages/me/devices"));
</script>
