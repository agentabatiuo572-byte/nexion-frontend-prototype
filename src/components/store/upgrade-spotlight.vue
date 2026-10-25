<template>
  <view class="upgrade-spotlight" :data-images-ready="baseReady && targetReady">
    <text class="upgrade-eyebrow">{{ copy.upgrade }}</text>
    <view class="upgrade-title"><text>{{ nexGridBrandText(base.name) }}</text><text class="upgrade-title__target">→ {{ nexGridBrandText(target.name) }}</text></view>
    <view class="upgrade-art" aria-hidden="true">
      <view v-if="baseReady" class="upgrade-art__base-shadow" />
      <view class="upgrade-art__base" :data-image-state="baseReady ? 'ready' : baseImage ? 'loading' : 'unavailable'">
        <view v-if="!baseReady" class="upgrade-art__placeholder"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" /></svg></view>
        <image v-if="baseImage" :key="baseImage" class="upgrade-art__image" :class="{ 'upgrade-art__image--ready': baseReady }" :src="baseImage" mode="aspectFit" @load="baseReady = true" @error="baseImageError" />
      </view>
      <svg class="upgrade-art__arrow" width="40" height="20" viewBox="0 0 40 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h34" stroke-dasharray="3 4" /><path d="m30 4 6 6-6 6" /></svg>
      <view v-if="targetReady" class="upgrade-art__target-shadow" />
      <view class="upgrade-art__target" :class="{ 'upgrade-art__target--ready': targetReady }" :data-image-state="targetReady ? 'ready' : imageSrc ? 'loading' : 'unavailable'">
        <view v-if="!targetReady" class="upgrade-art__placeholder"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" /></svg></view>
        <image v-if="imageSrc" :key="imageSrc" class="upgrade-art__image" :class="{ 'upgrade-art__image--ready': targetReady }" :src="imageSrc" mode="aspectFit" @load="targetReady = true" @error="imageError" />
      </view>
    </view>
    <view class="upgrade-comparison">
      <view><text class="upgrade-comparison__label">{{ comparisonCopy.current }}</text><text class="upgrade-comparison__value">{{ fmtMoney(base.baseRate) }}{{ t.store.cardPerDaySuffix }}</text></view>
      <view><text class="upgrade-comparison__label">{{ comparisonCopy.upgraded }}</text><text class="upgrade-comparison__value upgrade-comparison__value--target">{{ fmtMoney(target.dailyEarn) }}{{ t.store.cardPerDaySuffix }}</text></view>
    </view>
    <text class="upgrade-note">{{ t.store.cardYouEarn }} · {{ t.store.cardEstimateNote }}</text>
    <NxButton class="upgrade-action" variant="secondary" size="medium" :label="copy.details" @click="open" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProductImage } from '@/composables/use-product-image';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { fmtMoney } from '@/i18n/format';
import { nexGridBrandText } from '@/lib/brand-copy';
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
const { imageSrc, imageError } = useProductImage(() => props.target.imageUrl ?? undefined);
const { imageSrc: baseImage, imageError: baseImageError } = useProductImage(() => props.baseImageUrl
  || (props.base.kind === 'phone' ? '/static/img/home-glass-20260928/phone.webp' : undefined));
const baseReady = ref(false), targetReady = ref(false);
// A resolved URL is not a decoded image. Keep a neutral placeholder until @load;
// URL changes and native-cache retries reset readiness before the next render.
watch(baseImage, () => { baseReady.value = false; }, { flush: 'sync' });
watch(imageSrc, () => { targetReady.value = false; }, { flush: 'sync' });
function open() { navTo('/pages/store/detail?id=' + encodeURIComponent(props.target.id)); }
</script>
<style scoped>
.upgrade-spotlight { position:relative; overflow:hidden; padding:18px; border:1px solid var(--v5-border); border-radius:22px; background:radial-gradient(60% 55% at 78% 46%,color-mix(in srgb,var(--v5-brand) 20%,transparent),transparent 70%),linear-gradient(180deg,var(--ui-ticket-top),var(--ui-ticket-bottom)); }
.upgrade-eyebrow { display:block; font:500 12.5px/18px var(--font-v5); color:var(--ui-lime-soft); }
.upgrade-title { margin-top:6px; font:600 19px/25px var(--font-v5); color:var(--v5-ink); overflow-wrap:anywhere; }
.upgrade-title__target { display:block; }
.upgrade-art { position:relative; height:118px; margin-top:6px; }
.upgrade-art__base { position:absolute; left:10px; bottom:10px; width:min(96px,34%); aspect-ratio:1; opacity:.75; }
.upgrade-art__target { position:absolute; right:0; bottom:6px; width:min(150px,50%); aspect-ratio:1; }
.upgrade-art__target--ready { animation:upgrade-float 4.2s ease-in-out infinite; }
.upgrade-art__image { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
.upgrade-art__image--ready { opacity:1; }
.upgrade-art__placeholder { position:absolute; inset:12%; display:grid; place-items:center; border:1px solid var(--v5-border-strong); border-radius:18px; color:var(--v5-ink-3); background:linear-gradient(145deg,var(--ui-content-surface-3),var(--ui-content-surface-2)); }
.upgrade-art__arrow { position:absolute; left:42%; top:46px; color:var(--v5-ink-3); }
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
@media(max-width:350px) { .upgrade-art__base { left:0; width:min(84px,34%); }.upgrade-art__target { width:min(136px,50%); }.upgrade-art__arrow { left:36%; } }
@media(prefers-reduced-motion:reduce) { .upgrade-art__target { animation:none; } }
</style>
