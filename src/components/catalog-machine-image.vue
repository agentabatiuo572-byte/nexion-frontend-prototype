<template>
  <view class="catalog-machine-image" :data-image-state="ready ? 'ready' : frame ? 'loading' : 'unavailable'" aria-hidden="true">
    <view v-if="!ready" class="catalog-machine-image__placeholder"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" /></svg></view>
    <image v-for="request in frame ? [frame] : []" :key="request.key" class="catalog-machine-image__image" :class="{ 'catalog-machine-image__image--ready': ready }" :src="request.src" mode="aspectFit" alt="" @load="request.load" @error="request.error" />
  </view>
</template>
<script setup lang="ts">
import { watch } from 'vue';
import { useApp } from '@/store/app';
import { useCatalogMachineImage } from './catalog-machine-image';
const props = defineProps<{ sku?: string | null; imageUrl?: string | null; scopeKey?: string; refreshKey?: string | number }>();
const emit = defineEmits<{ (event: 'ready', ready: boolean): void }>();
const app = useApp();
const { frame, ready } = useCatalogMachineImage(() => ({
  identity: JSON.stringify([app.accountKey, app.accountBindingEpoch, props.scopeKey, props.sku, props.refreshKey]),
  url: props.imageUrl,
}));
watch(ready, value => emit('ready', value), { immediate: true, flush: 'sync' });
</script>
<style scoped>
:where(.catalog-machine-image) { position:relative; }
.catalog-machine-image__image { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
.catalog-machine-image__image--ready { opacity:1; }
.catalog-machine-image__placeholder { position:absolute; inset:12%; display:grid; place-items:center; border:1px solid var(--v5-border-strong); border-radius:18px; color:var(--v5-ink-3); background:linear-gradient(145deg,var(--ui-content-surface-3),var(--ui-content-surface-2)); }
.catalog-machine-image__placeholder svg { width:60%; height:60%; max-width:56px; max-height:56px; }
</style>
