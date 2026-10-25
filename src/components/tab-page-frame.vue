<template>
  <template v-if="hosted">
    <slot name="pageTop" />
    <slot />
  </template>
  <AppChassis v-else-if="!native" v-bind="$attrs" :active="active">
    <template #pageTop><slot name="pageTop" /></template>
    <slot />
  </AppChassis>
  <view v-else />
</template>
<script setup lang="ts">
import { inject, onMounted } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import { TAB_HOST } from "@/composables/use-tab-page-lifecycle";
import { navReplace } from "@/lib/route";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ active?: "home" | "earn" | "store" | "team" | "me" }>();
const hosted = inject(TAB_HOST, false);
let native = false;
// #ifdef APP-PLUS
native = true;
// Legacy external tab URLs enter the shared host once; normal navigation maps before opening a page.
onMounted(() => {
  if (hosted) return;
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as unknown as { route: string; options?: Record<string, string> };
  const query = Object.entries(page.options ?? {}).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  void navReplace(`/${page.route}${query ? `?${query}` : ""}`);
});
// #endif
</script>
