<template><view v-show="active" class="nx-tab-content" :data-tab-content-key="locationKey"><component :is="content" /></view></template>
<script setup lang="ts">
import { provide, watch, onBeforeUnmount, type Component } from "vue";
import { createTabLifecycle, TAB_LIFECYCLE } from "@/composables/use-tab-page-lifecycle";
import type { TabQuery } from "@/lib/native-tab-navigation";
const props = defineProps<{ content: Component; query: TabQuery; active: boolean; visible: boolean; locationKey?: string }>();
const lifecycle = createTabLifecycle(props.query, props.visible);
provide(TAB_LIFECYCLE, lifecycle);
watch(() => props.visible, value => lifecycle.setVisible(value), { flush: "sync" });
onBeforeUnmount(() => lifecycle.setVisible(false));
</script>
