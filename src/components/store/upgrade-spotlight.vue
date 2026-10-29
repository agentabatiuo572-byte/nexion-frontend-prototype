<template>
  <view class="upgrade-spotlight" :data-images-ready="baseReady && targetReady">
    <text class="upgrade-eyebrow">{{ copy.upgrade }}</text>
    <view class="upgrade-title"><text class="upgrade-title__base">{{ base.name }}</text><text class="upgrade-title__target">→ {{ target.name }}</text></view>
    <view class="upgrade-art" aria-hidden="true">
      <view v-if="baseReady" class="upgrade-art__base-shadow" />
      <CatalogMachineImage class="upgrade-art__base" v-bind="baseImageProps" />
      <view class="upgrade-art__arrow" />
      <view v-if="targetReady" class="upgrade-art__target-shadow" />
      <CatalogMachineImage class="upgrade-art__target" :class="{ 'upgrade-art__target--ready': targetReady }" v-bind="targetImageProps" />
    </view>
    <view class="upgrade-comparison">
      <view><text class="upgrade-comparison__label">{{ comparisonCopy.current }}</text><text class="upgrade-comparison__value">{{ fmtMoney(base.baseRate) }}{{ t.store.cardPerDaySuffix }}</text></view>
      <view><text class="upgrade-comparison__label">{{ comparisonCopy.upgraded }}</text><text class="upgrade-comparison__value upgrade-comparison__value--target">{{ fmtMoney(target.dailyEarn) }}{{ t.store.cardPerDaySuffix }}</text></view>
    </view>
    <text class="upgrade-note">{{ t.store.cardYouEarn }}</text>
    <NxButton class="upgrade-action" variant="secondary" size="medium" :label="copy.details" @click="open" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CatalogMachineImage from '@/components/catalog-machine-image.vue';
import { catalogMachineImageIdentity } from '@/components/catalog-machine-image';
import { useApp } from '@/store/app';
import { productCatalogState } from '@/store/product-catalog';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { fmtMoney } from '@/i18n/format';
import { navTo } from '@/lib/route';
import NxButton from '@/components/ui/nx-button.vue';
import type { DeviceKind } from '@/store/types';
const props = defineProps<{ base: { kind: DeviceKind; name: string; baseRate: number }; baseImageUrl?: string | null; target: { id: string; name: string; imageUrl?: string | null; dailyEarn: number } }>();
const copy = useAuditUiCopy(), t = useT();
const locale = useLocaleStore();
const comparisonCopy = computed(() => locale.code === 'zh'
  ? { current: '现在 · 预估', upgraded: '升级后 · 预估' }
  : locale.code === 'vi'
    ? { current: 'Hiện tại · ước tính', upgraded: 'Sau nâng cấp · ước tính' }
    : { current: 'Now · estimated', upgraded: 'After upgrade · estimated' });
const baseReady = ref(false), targetReady = ref(false);
const baseRefreshKey = ref(0), targetRefreshKey = ref(0);
const app = useApp();
const baseIdentity = computed(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, props.base.kind, catalogMachineImageIdentity(props.baseImageUrl), baseRefreshKey.value]));
const targetIdentity = computed(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, props.target.id, catalogMachineImageIdentity(props.target.imageUrl), targetRefreshKey.value]));
const baseImageProps = computed(() => {
  const identity = baseIdentity.value;
  return { sku: props.base.kind, imageUrl: props.baseImageUrl, scopeKey: 'upgrade-base', refreshKey: baseRefreshKey.value,
    onReady: (ready: boolean) => { if (identity === baseIdentity.value) baseReady.value = ready; } };
});
const targetImageProps = computed(() => {
  const identity = targetIdentity.value;
  return { sku: props.target.id, imageUrl: props.target.imageUrl, scopeKey: 'upgrade-target', refreshKey: targetRefreshKey.value,
    onReady: (ready: boolean) => { if (identity === targetIdentity.value) targetReady.value = ready; } };
});
watch(baseIdentity, () => { baseReady.value = false; }, { flush: 'sync' });
watch(targetIdentity, () => { targetReady.value = false; }, { flush: 'sync' });
watch(() => productCatalogState.status, status => {
  if (status !== 'ready') return;
  if (!baseReady.value && props.baseImageUrl) baseRefreshKey.value++;
  if (!targetReady.value && props.target.imageUrl) targetRefreshKey.value++;
}, { flush: 'post' });
function open() { navTo('/pages/store/detail?id=' + encodeURIComponent(props.target.id)); }
</script>
<style scoped>
.upgrade-spotlight { position:relative; overflow:hidden; padding:18px; border:1px solid var(--v5-border); border-radius:22px; background:radial-gradient(60% 55% at 78% 46%,color-mix(in srgb,var(--v5-brand) 20%,transparent),transparent 70%),linear-gradient(180deg,var(--ui-ticket-top),var(--ui-ticket-bottom)); }
.upgrade-eyebrow { display:block; font:500 12.5px/18px var(--font-v5); color:var(--ui-lime-soft); }
.upgrade-title { margin-top:6px; overflow-wrap:anywhere; }
.upgrade-title__base { display:block; color:var(--v5-ink-2); font:500 var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); }
.upgrade-title__target { display:block; margin-top:4px; color:var(--v5-brand); font:600 var(--ui-type-profile)/var(--ui-type-profile-lh) var(--font-v5); }
.upgrade-art { position:relative; height:118px; margin-top:6px; }
.upgrade-art__base { position:absolute; left:10px; bottom:10px; width:min(96px,34%); aspect-ratio:1; opacity:.75; }
.upgrade-art__target { position:absolute; right:0; bottom:6px; width:min(150px,50%); aspect-ratio:1; }
.upgrade-art__target--ready { animation:upgrade-float 4.2s ease-in-out infinite; }
.upgrade-art__arrow { position:absolute; left:43%; top:44px; width:46px; height:32px; transform:translateX(-50%); background:url('/static/promotion/upgrade-arrow-dark.png') center/contain no-repeat; pointer-events:none; }
:global([data-theme="light"] .upgrade-art__arrow) { background-image:url('/static/promotion/upgrade-arrow-light.png'); }
.upgrade-art__base-shadow { position:absolute; left:16px; bottom:12px; width:86px; height:14px; border-radius:50%; background:radial-gradient(closest-side,color-mix(in srgb,var(--v5-ink) 18%,transparent),transparent); }
.upgrade-art__target-shadow { position:absolute; right:6px; bottom:8px; width:150px; height:22px; border-radius:50%; background:radial-gradient(closest-side,color-mix(in srgb,var(--ui-lime-soft) 45%,transparent),transparent); }
.upgrade-comparison { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:4px; }
.upgrade-comparison__label { display:block; font:400 12.5px/18px var(--font-v5); color:var(--v5-ink-3); }
.upgrade-comparison__value { display:block; margin-top:2px; font:600 16px/22px var(--font-v5); font-variant-numeric:tabular-nums; }
.upgrade-comparison__value--target { color:var(--v5-brand); }
.upgrade-note { display:block; margin-top:10px; font:400 12.5px/18px var(--font-v5); color:var(--v5-ink-3); }
.upgrade-spotlight .upgrade-action { display:flex; margin-top:14px; min-height:44px; padding:0; }
.upgrade-action :deep(.nx-button__surface) { min-height:44px; }
@keyframes upgrade-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
@media(max-width:350px) { .upgrade-art__base { left:0; width:min(84px,34%); }.upgrade-art__target { width:min(136px,50%); }.upgrade-art__arrow { left:42%; width:42px; height:29px; } }
@media(prefers-reduced-motion:reduce) { .upgrade-art__target { animation:none; } }
</style>
