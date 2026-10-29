<template>
  <AppChassis :key="accountScope" :active="location.tab" :logical-route="location.route" :tab-location-key="location.href" :tab-host="true" :host-visible="visible">
    <NativeTabContent v-for="entry in visited" :key="`${accountScope}:${entry.href}`" :content="components[entry.tab]" :query="entry.query" :location-key="entry.href" :active="entry.href === location.href" :visible="visible && entry.href === location.href" />
  </AppChassis>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, shallowRef, watch } from "vue";
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
import { useLocaleStore } from "@/store/locale";
import { apiRuntimeConfig } from "@/api/runtime";
import { notifyPageActivation } from "@/lib/passive-read-window";
const app = useApp();
const locale = useLocaleStore();
const location = shallowRef(nativeTabEntry());
const visible = ref(true);
const components = { home: Home, earn: Earn, store: Store, team: Team, me: Me };
const accountScope = computed(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl]));
// Only the latest query of each visited tab survives; scope changes discard all five.
const visited = shallowRef([location.value]);
watch([accountScope, location], ([scope, current], [previousScope]) => {
  visited.value = scope !== previousScope ? [current]
    : visited.value.some(entry => entry.tab === current.tab)
      ? visited.value.map(entry => entry.tab === current.tab ? current : entry)
      : [...visited.value, current];
}, { flush: "sync" });
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
onShow(() => { notifyPageActivation(location.value.href); visible.value = true; });
onHide(() => { visible.value = false; });
onBeforeUnmount(() => { visible.value = false; unregister(); });
</script>
