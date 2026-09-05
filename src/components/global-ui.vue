<template>
  <!-- Toast host -->
  <view v-if="showBusinessOverlays" class="nx-toast-host">
    <view
      v-for="t in ui.toasts"
      :key="t.id"
      class="nx-toast"
      :class="`nx-toast--${t.kind}`"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      @click="ui.dismissToast(t.id)"
    >
      <view class="nx-toast__bar" />
      <view class="nx-toast__body">
        <text class="nx-toast__title">{{ t.title }}</text>
        <text v-if="t.description" class="nx-toast__desc">{{ t.description }}</text>
      </view>
    </view>
  </view>

  <!-- Confirm dialog (renders top of queue) -->
  <!-- 🔴 这个确认框被约 15 处资金操作复用(提现 / 充值 / 兑换 / 注销账户 / 解绑卡…)。
       此前两个按钮是裸 <view @click>:读屏不知道那是按钮、Tab 停不上去,于是键盘用户
       既确认不了也取消不了,而 confirm() 返回的 Promise 会永久悬空 —— 钱的流程卡死在这里。 -->
  <view
    v-if="topConfirm"
    class="nx-mask nx-mask--confirm"
    role="dialog"
    aria-modal="true"
    :aria-label="topConfirm.title"
    @click="ui.resolveConfirm(topConfirm.id, false)"
  >
    <view class="nx-modal" @click.stop>
      <text class="nx-modal__title">{{ topConfirm.title }}</text>
      <text v-if="topConfirm.message" class="nx-modal__msg">{{ topConfirm.message }}</text>
      <view class="nx-modal__actions">
        <view
          v-if="!topConfirm.hideCancel"
          class="nx-btn nx-btn--ghost active:opacity-70"
          role="button"
          tabindex="0"
          @click="ui.resolveConfirm(topConfirm.id, false)"
        >
          <text class="nx-btn__label nx-btn__label--ghost">{{ topConfirm.cancelLabel || t.ui.cancel }}</text>
        </view>
        <view
          class="nx-btn active:opacity-85"
          :class="topConfirm.danger ? 'nx-btn--danger' : 'nx-btn--primary'"
          role="button"
          tabindex="0"
          @click="ui.resolveConfirm(topConfirm.id, true)"
        >
          <text class="nx-btn__label">{{ topConfirm.confirmLabel || t.ui.confirm }}</text>
        </view>
      </view>
    </view>
  </view>

  <!-- Network-error overlay -->
  <view v-if="ui.netError.visible" class="nx-mask nx-mask--neterr" role="dialog" aria-modal="true" :aria-label="ui.netError.title">
    <view class="nx-modal">
      <text class="nx-modal__title">{{ ui.netError.title }}</text>
      <text class="nx-modal__msg">{{ ui.netError.message }}</text>
      <view class="nx-modal__actions">
        <!-- 断网遮罩没有关闭出口,「重试」是唯一的路;键盘按不到它就等于被锁死在这一屏。 -->
        <view class="nx-btn nx-btn--primary active:opacity-85" role="button" tabindex="0" @click="onRetry">
          <text class="nx-btn__label">{{ t.ui.retry }}</text>
        </view>
      </view>
    </view>
  </view>

  <!-- Earnings milestone celebration (driven by useMilestones().active; App.vue
       polls + fires via store.show()) -->
  <MilestoneCelebration v-if="showBusinessOverlays" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useUI } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import MilestoneCelebration from "@/components/milestone-celebration.vue";
import { isStaticReviewRoute } from "@/lib/static-review-routes";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const ui = useUI();
const t = useT();
// Last enqueued confirm renders on top (LIFO), matching the original.
const topConfirm = computed(() => ui.confirmQueue[ui.confirmQueue.length - 1] || null);
const route = ref(readRoute());
let routeTimer: ReturnType<typeof setInterval> | undefined;
const showBusinessOverlays = computed(() => !!route.value && !isStaticReviewRoute(route.value));

function readRoute(): string {
  try {
    const ps = getCurrentPages();
    const route = ps.length ? ((ps[ps.length - 1] as { route?: string }).route ?? "") : "";
    if (route) return route;
  } catch {
    // fall through to H5 hash fallback
  }
  // #ifdef H5
  try {
    return window.location.hash.replace(/^#\/?/, "").replace(/^\//, "");
  } catch {
    return "";
  }
  // #endif
  return "";
}

onMounted(() => {
  routeTimer = setInterval(() => {
    route.value = readRoute();
  }, 250);
});
onUnmounted(() => {
  if (routeTimer) {
    clearInterval(routeTimer);
    routeTimer = undefined;
  }
});

function onRetry() {
  const cb = ui.netError.onRetry;
  ui.hideNetError();
  cb?.();
}

// 确认框:Esc = 取消(与点遮罩同义),Tab 只在框内循环,关掉后焦点回到触发它的按钮。
useDialogA11y(
  computed(() => topConfirm.value !== null),
  ".nx-mask--confirm",
  () => { if (topConfirm.value) ui.resolveConfirm(topConfirm.value.id, false); },
);
// 断网遮罩:**不传 close** —— 它只有「重试」一条路,没有取消语义。
// 给它接 Esc 会凭空造出一个"看起来关掉了、其实什么都没做"的出口。
useDialogA11y(computed(() => ui.netError.visible), ".nx-mask--neterr");
</script>

<style scoped>
/* ───── Toasts ───── */
.nx-toast-host {
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.nx-toast {
  pointer-events: auto;
  display: flex;
  align-items: stretch;
  width: 86%;
  max-width: 360px;
  background: var(--v5-toast-bg);
  border: 1px solid var(--v5-toast-border);
  border-radius: 14px;
  box-shadow: var(--v5-toast-shadow);
  overflow: hidden;
}
.nx-toast__bar {
  width: 4px;
  flex-shrink: 0;
}
.nx-toast--success .nx-toast__bar { background: var(--v5-success); }
.nx-toast--info .nx-toast__bar { background: var(--v5-brand); }
.nx-toast--warn .nx-toast__bar { background: var(--v5-warning); }
.nx-toast--error .nx-toast__bar { background: var(--v5-danger); }
.nx-toast__body {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  gap: 2px;
}
.nx-toast__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.nx-toast__desc {
  font-size: 12px;
  color: var(--v5-ink-3);
}

/* ───── Modal (confirm + netError) ───── */
.nx-mask {
  position: fixed;
  inset: 0;
  z-index: 9100;
  background: var(--v5-bg-color-mask);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.nx-modal {
  width: 100%;
  max-width: 320px;
  background: var(--v5-surface);
  border: 1px solid var(--v5-border);
  border-radius: 18px;
  box-shadow: var(--v5-card-shadow-lift-strong);
  padding: 22px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nx-modal__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.nx-modal__msg {
  font-size: 13px;
  line-height: 1.5;
  color: var(--v5-ink-3);
}
.nx-modal__actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.nx-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  border-radius: 12px;
}
.nx-btn--primary { background: var(--v5-brand); }
.nx-btn--danger { background: var(--v5-danger); }
.nx-btn--ghost { background: var(--v5-surface-2); }
.nx-btn__label {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
/* Cancel is visually subordinate to the primary CTA (NexGrid conversion rule). */
.nx-btn__label--ghost {
  font-weight: 400;
  color: var(--v5-ink-3);
}
</style>
