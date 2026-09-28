<template>
  <view class="phone-web-guide">
    <text>{{ t.phonePolicy.webNotice }}</text>
    <navigator url="/pages/register/success?download=1" open-type="reLaunch">{{ t.phonePolicy.download }}</navigator>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { useT } from "@/i18n/use-t";
const t = useT();
onLoad(() => {
  uni.reLaunch({ url: "/pages/register/success?download=1", fail: () => {} });
});
</script>

<style scoped>
.phone-web-guide { padding: 32px 20px; display: flex; flex-direction: column; gap: 24px; color: var(--v5-ink); }
navigator { color: var(--v5-brand); padding: 12px 0; }
</style>
