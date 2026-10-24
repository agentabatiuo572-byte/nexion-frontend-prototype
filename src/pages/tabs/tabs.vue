<template>
  <AppChassis :key="accountScope" :active="location.tab" :logical-route="location.route" :tab-location-key="location.href" :tab-host="true" :host-visible="visible">
    <NativeTabContent :key="contentKey" :content="content" :query="location.query" :visible="visible" />
  </AppChassis>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, shallowRef } from "vue";
import { onLoad, onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import NativeTabContent from "@/components/native-tab-content.vue";
import Home from "@/pages/index/index.vue";
import Earn from "@/pages/earn/earn.vue";
import Store from "@/pages/store/store.vue";
import Team from "@/pages/team/team.vue";
import Me from "@/pages/me/me.vue";
import { TAB_HOST } from "@/composables/use-tab-page-lifecycle";
import { nativeTabEntry, registerNativeTabHost } from "@/lib/native-tab-navigation";
import { useApp } from "@/store/app";
const app = useApp();
const location = shallowRef(nativeTabEntry());
const visible = ref(true);
const components = { home: Home, earn: Earn, store: Store, team: Team, me: Me };
const content = computed(() => components[location.value.tab]);
const accountScope = computed(() => `${app.accountKey}:${app.accountBindingEpoch}`);
const contentKey = computed(() => `${accountScope.value}:${location.value.href}`);
provide(TAB_HOST, true);
let unregister = () => {};
onLoad(options => {
  location.value = nativeTabEntry(options);
  const pages = getCurrentPages();
  unregister = registerNativeTabHost({
    page: pages[pages.length - 1], location: () => location.value,
    select: value => { location.value = value; },
  });
});
onShow(() => { visible.value = true; });
onHide(() => { visible.value = false; });
onBeforeUnmount(() => { visible.value = false; unregister(); });
</script>
