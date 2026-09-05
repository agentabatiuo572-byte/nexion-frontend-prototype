<!--
  OpenSeaModal — full-screen fake "Connecting to OpenSea…" overlay that always
  times out into a believable error, reinforcing the "external secondary market
  exists" illusion while keeping users inside NexGrid (marketplace/page.tsx
  OpenSeaModal). Controlled via `v-model:open`. The 2.4s loading→error timer
  uses Vue onMounted/onUnmounted (component lifecycle, P-021), restarted on each
  open via a watcher. Spinner uses the shared `spin` keyframe in tokens.css.
-->
<template>
  <view v-if="open" class="nx-os-overlay" role="dialog" aria-modal="true" @click="emitClose">
    <view class="nx-os-card text-center" @click.stop>
      <!-- OpenSea brand line -->
      <view class="flex items-center justify-center" style="gap: 8px; margin-bottom: 16px">
        <view class="grid place-items-center" :style="brandDotStyle">
          <text style="color: var(--v5-ink); font-size: 14px; font-weight: 500; line-height: 1">⚓</text>
        </view>
        <text :style="brandTitleStyle">{{ t.marketplace.openSeaTitle }}</text>
      </view>

      <!-- Loading -->
      <view v-if="phase === 'loading'" style="padding: 24px 0">
        <view class="nx-os-spin" :style="spinnerStyle" />
        <text class="block" :style="loadingTitleStyle">{{ t.marketplace.openSeaLoading }}</text>
        <text class="block" :style="loadingSubStyle">{{ t.marketplace.openSeaLoadingSub }}</text>
      </view>

      <!-- Error -->
      <view v-else style="padding: 8px 0">
        <view class="grid place-items-center" :style="errIconStyle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
        <text class="block" :style="errTitleStyle">{{ t.marketplace.openSeaErrorTitle }}</text>
        <text class="block" :style="errMsgStyle">{{ errorMsg }}</text>
        <text class="block" :style="errSubStyle">{{ t.marketplace.openSeaErrorSub }}</text>
        <text class="inline-block" :style="errHintStyle">💡 {{ t.marketplace.openSeaErrorHint }}</text>
        <view class="grid grid-cols-2" style="gap: 8px; margin-top: 16px">
          <view class="active:scale-[0.97]" :style="retryBtnStyle" role="button" tabindex="0" :aria-label="t.marketplace.openSeaRetry" @click="handleRetry">
            <text style="pointer-events: none">{{ t.marketplace.openSeaRetry }}</text>
          </view>
          <view class="active:scale-[0.97]" :style="backBtnStyle" role="button" tabindex="0" :aria-label="t.marketplace.openSeaBack" @click="emitClose">
            <text style="pointer-events: none">{{ t.marketplace.openSeaBack }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

type ErrorKey = "rateLimit" | "syncPending" | "bridge" | "verifyPending" | "cf";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const t = useT();

const phase = ref<"loading" | "error">("loading");
const errorKey = ref<ErrorKey>("rateLimit");
let timer: ReturnType<typeof setTimeout> | null = null;

const errorMsg = computed(() => t.value.marketplace.openSeaErrorPool[errorKey.value]);

function startLoading() {
  phase.value = "loading";
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const keys: ErrorKey[] = ["rateLimit", "syncPending", "bridge", "verifyPending", "cf"];
    errorKey.value = keys[Math.floor(Math.random() * keys.length)];
    phase.value = "error";
  }, 2400);
}

watch(
  () => props.open,
  (o) => {
    if (o) startLoading();
    else if (timer) clearTimeout(timer);
  },
);

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

function handleRetry() {
  startLoading();
}
function emitClose() {
  emit("update:open", false);
}

const brandDotStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #2081E2 0%, #0e6cd6 100%)",
};
const brandTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const spinnerStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  margin: "0 auto",
  borderRadius: "999px",
  border: "2px solid rgba(32,129,226,0.30)",
  borderTopColor: "#2081E2",
};
const loadingTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const loadingSubStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const errIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  margin: "0 auto",
  borderRadius: "999px",
  background: "var(--v5-brand-2-soft)",
};
const errTitleStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1.3,
};
const errMsgStyle: CSSProperties = {
  marginTop: "8px",
  marginLeft: "auto",
  marginRight: "auto",
  maxWidth: "280px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand-2)",
  lineHeight: 1.55,
};
const errSubStyle: CSSProperties = { marginTop: "12px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.55 };
const errHintStyle: CSSProperties = {
  marginTop: "8px",
  padding: "3px 10px",
  borderRadius: "6px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontSize: "12px",
  fontWeight: 500,
};
const retryBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border-strong)",
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const backBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => props.open), ".nx-os-overlay", emitClose);
</script>

<style scoped>
/* 🔴 790 = 业务半屏带(秩序表单源见 captcha-slider.vue)。原值 120 低于里程碑庆祝
   (780):这块是阻断式外链弹窗,自带 2.4s loading→error 自迁移,被庆祝盖住时用户
   既看不到失败态也点不到「返回」,而计时器照样在走。 */
.nx-os-overlay {
  position: fixed;
  inset: 0;
  z-index: 790;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  background: rgba(8, 11, 20, 0.92);
  backdrop-filter: blur(8px);
}
.nx-os-card {
  width: 100%;
  max-width: 360px;
  border-radius: 16px;
  background: var(--v5-surface);
  border: 1px solid var(--v5-border);
  padding: 20px;
}
.nx-os-spin {
  animation: spin 0.8s linear infinite;
}
</style>
