<template>
  <StandalonePageShell class="est-root" :top-inset="24">
    <!-- Progress -->
    <view class="est-bars">
      <view class="est-back active:opacity-60" role="button" tabindex="0" :aria-label="t.login.back" @click="leaveEstimator" @keydown.enter.prevent="leaveEstimator" @keydown.space.prevent="leaveEstimator">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill" /></view>
    </view>

    <view>
      <text class="est-step">{{ t.onboarding.step2of3 }}</text>
      <text class="est-title">{{ t.onboarding.estimatorTitleH }}</text>
      <text class="est-hint">{{ detected ? t.onboarding.estimatorHint : t.onboarding.detecting }}</text>
    </view>

    <!-- Device reveal: loading → phone card -->
    <view class="est-reveal">
      <transition name="est-fade" mode="out-in">
        <view v-if="!detected" key="loading" class="est-loading">
          <svg class="est-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <text class="est-loading__t">{{ t.onboarding.detecting }}</text>
        </view>
        <view v-else key="reveal" class="est-phone anim-up">
          <view class="est-phone__pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <text class="est-phone__pill-t">{{ t.onboarding.detected }}</text>
          </view>
          <view class="est-phone__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
          </view>
          <view class="est-phone__body">
            <text class="est-phone__name">{{ t.onboarding.yourPhone }}</text>
            <text class="est-phone__spec">{{ t.onboarding.mobileNpu }}</text>
          </view>
          <view class="est-phone__rate">
            <text class="est-phone__rate-v">~$0.06</text>
            <text class="est-phone__rate-u">{{ t.onboarding.perDay }}</text>
          </view>
        </view>
      </transition>
    </view>

    <!-- Upgrade comparison -->
    <view v-if="detected" class="est-compare anim-up-delay">
      <text class="est-compare__h">{{ t.onboarding.unlockMore }}</text>
      <view class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ t.onboarding.withS1 }}</text>
          <text class="cmp__sub">{{ multS1 }}× {{ t.onboarding.yourCurrentRate }}</text>
        </view>
        <text class="cmp__val">${{ s1.toFixed(2) }}{{ t.onboarding.perDay }}</text>
      </view>
      <view class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ t.onboarding.withPro }}</text>
          <text class="cmp__sub">~${{ (pro * 30).toFixed(0) }}{{ t.onboarding.perMonth }}</text>
        </view>
        <text class="cmp__val">${{ pro.toFixed(2) }}{{ t.onboarding.perDay }}</text>
      </view>
    </view>

    <!-- CTA -->
    <view class="est-cta">
      <view class="est-go" :class="{ 'est-go--on': detected, 'active:scale-[0.98]': detected }" role="button" :tabindex="detected ? 0 : -1" :aria-disabled="!detected" data-system-chrome-primary @click="goConnect" @keydown.enter.prevent="goConnect" @keydown.space.prevent="goConnect">
        <text class="est-go__t">{{ t.onboarding.startEarning }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="detected ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";

const t = useT();
const detected = ref(false);

const PHONE_RATE = 0.06;
const s1 = 7;
const pro = 13;
const multS1 = Math.round(s1 / PHONE_RATE);

let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  timer = setTimeout(() => {
    detected.value = true;
  }, 1200);
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

function goConnect() {
  if (!detected.value) return;
  uni.reLaunch({ url: "/pages/onboarding/connect", fail: () => {} });
}
function leaveEstimator() {
  uni.reLaunch({ url: "/pages/register/success", fail: () => uni.reLaunch({ url: "/pages/onboarding/intro", fail: () => {} }) });
}
</script>

<style scoped>
.est-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  background: var(--v5-bg);
  overflow-y: auto;
}
.est-bars {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  min-height: 44px;
}
.est-back { width: 44px; height: 44px; margin-left: -12px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 9999px; }
.est-bar {
  flex: 1;
  height: 4px;
  border-radius: 9999px;
  background: var(--v5-surface);
  overflow: hidden;
}
.est-bar__fill {
  height: 100%;
  width: 0;
  background: var(--v5-brand);
  transition: width 0.5s;
}
.est-bar__fill--full {
  width: 100%;
}
.est-step {
  display: block;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.est-title {
  display: block;
  font-family: var(--font-v5);
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--v5-ink);
}
.est-hint {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--v5-ink-3);
}
.est-reveal {
  margin-top: 20px;
}
.est-loading {
  height: 88px;
  background: var(--v5-surface);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.est-spin {
  animation: est-spin 0.9s linear infinite;
}
@keyframes est-spin {
  to { transform: rotate(360deg); }
}
.est-loading__t {
  font-size: 13px;
  color: var(--v5-ink-3);
}
.est-phone {
  position: relative;
  background: linear-gradient(135deg, color-mix(in oklab, var(--v5-brand) 12%, transparent), var(--v5-surface) 60%);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 0 24px -4px rgba(198, 255, 58, 0.35);
}
.est-phone__pill {
  position: absolute;
  top: -10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--v5-brand);
}
.est-phone__pill-t {
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
.est-phone__icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--v5-brand) 25%, transparent);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--v5-brand) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.est-phone__body {
  flex: 1;
  min-width: 0;
}
.est-phone__name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.est-phone__spec {
  display: block;
  font-size: 12px;
  color: color-mix(in oklab, var(--v5-brand) 90%, transparent);
  margin-top: 2px;
}
.est-phone__rate {
  text-align: right;
  flex-shrink: 0;
}
.est-phone__rate-v {
  display: block;
  font-family: var(--font-v5);
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 600;
  color: var(--v5-brand);
}
.est-phone__rate-u {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-4);
}
.est-compare {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.est-compare__h {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-ink-3);
  padding: 0 4px;
}
.cmp {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  padding: 12px 16px;
  background: var(--v5-surface);
}
.cmp__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  /* 原 --v5-surface 与外层 .cmp 同色 → 图标框隐形(双主题)。surface-3 = 内凹 inset 语义。 */
  background: var(--v5-surface-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cmp__body {
  flex: 1;
  min-width: 0;
}
.cmp__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink);
}
.cmp__sub {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 2px;
}
.cmp__val {
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--v5-ink);
}
.est-cta {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin-top: auto;
  padding-top: 24px;
  margin-right: 4px;
  margin-left: 4px;
  background: linear-gradient(to bottom, transparent, var(--v5-bg) 24px);
}
.est-go {
  width: 100%;
  height: 48px;
  border-radius: 9999px;
  background: var(--v5-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease, background 0.3s ease;
}
.est-go--on {
  background: var(--v5-brand);
}
.est-go__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink-4);
}
.est-go--on .est-go__t {
  color: var(--v5-on-brand);
}

/* entrance */
.anim-up {
  animation: est-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.anim-up-delay {
  animation: est-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}
@keyframes est-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.est-fade-enter-active,
.est-fade-leave-active {
  transition: opacity 0.25s;
}
.est-fade-enter-from,
.est-fade-leave-to {
  opacity: 0;
}
</style>
