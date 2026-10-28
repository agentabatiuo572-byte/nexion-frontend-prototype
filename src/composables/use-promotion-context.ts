import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from '@/lib/passive-tab-read';
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { onHide, onShow } from '@/composables/use-tab-page-lifecycle';
import { promotionApi, remoteApiEnabled, sessionVault, apiRuntimeConfig } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { canPreviewPromotion, createPromotionReadFence, isPromotionActive } from '@/lib/promotion-entry';

/** Shared by the existing catalog/detail/bundle surfaces; no qualification calculation. */
export function usePromotionContext(activityId: Ref<string>, retainPresentation = false) {
  const app = useApp();
  const locale = useLocaleStore();
  const activity = ref<PublicPromotion | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const fence = createPromotionReadFence();
  let visible = true;
  let environmentInvalidated = false;
  watch(() => apiRuntimeConfig?.environment, () => {
    environmentInvalidated = true; fence.invalidate(); activity.value = null; status.value = 'error';
  }, { flush: 'sync' });
  async function refresh(passive: unknown = false) {
    const ticket = fence.next();
    const id = activityId.value;
    if (environmentInvalidated) return;
    if (!retainPresentation) activity.value = null;
    if (!visible || !id) { if (!id) activity.value = null; status.value = 'idle'; return; }
    if (passive !== true || status.value !== 'error') status.value = 'loading';
    if (!remoteApiEnabled) { status.value = 'error'; return; }
    const identity = passiveTabReadScope();
    try {
      const read = () => promotionApi.get(id, !!sessionVault.read());
      const result = await (passive === true ? runPassiveTabRead('promotion-detail', read, { id, authenticated: !!sessionVault.read() }) : (invalidatePassiveTabRead('promotion-detail'), read()));
      if (!visible || !fence.current(ticket) || id !== activityId.value || identity !== passiveTabReadScope()) return;
      activity.value = isPromotionActive(result) ? result : null;
      status.value = 'ready';
    } catch {
      if (visible && fence.current(ticket) && identity === passiveTabReadScope()) { activity.value = null; status.value = 'error'; }
    }
  }
  watch(activityId, () => { activity.value = null; void refresh(true); });
  watch([() => app.accountKey, () => app.accountBindingEpoch, () => locale.code], () => {
    fence.invalidate(); activity.value = null; status.value = 'idle';
    if (visible) void refresh(true);
  });
  onMounted(() => { void refresh(true); });
  onShow(() => { visible = true; void refresh(true); });
  onHide(() => { visible = false; fence.invalidate(); status.value = 'idle'; if (!retainPresentation) activity.value = null; });
  onBeforeUnmount(() => { visible = false; fence.invalidate(); activity.value = null; });
  const available = computed(() => !environmentInvalidated && status.value === 'ready' && canPreviewPromotion(activity.value));
  return { activity, status, available, refresh };
}
