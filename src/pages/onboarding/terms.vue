<!--
  Terms of Service — onboarding legal page reached from intro's "Terms" link.
  Chassis-less top-level page (like intro / login / register): fixed full-screen
  scrollable dark surface, own sticky back header (no tab chrome). Content is a
  10-section numbered agreement, fully i18n-driven (terms namespace, en/zh
  mirror), believable real-platform tone (no meta / reverse-education copy).
  Opened via navigateTo from intro; back = navBack() helper (stack-aware:
  pops real history, else reLaunch→intro on cold load).
-->
<template>
  <StandalonePageShell class="tos-root" :reserve-bottom="false">
    <!-- Sticky back header + brand -->
    <view class="tos-top">
      <view class="tos-back active:opacity-60" role="button" tabindex="0" :aria-label="t.login.back" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="tos-brand">
        <view class="tos-brand__n"><text class="tos-brand__n-t">N</text></view>
        <text class="tos-brand__name">{{ t.terms.navTitle }}</text>
      </view>
      <view class="tos-top__spacer" />
    </view>

    <view class="tos-wrap">
      <!-- Hero -->
      <view class="tos-hero">
        <text class="tos-eyebrow">{{ t.terms.effectiveLabel }}</text>
        <text class="tos-title">{{ t.terms.heroTitle }}</text>
        <text class="tos-sub">{{ t.terms.heroSubtitle }}</text>
      </view>

      <!-- Numbered sections -->
      <view class="tos-sections">
        <view v-for="b in blocks" :key="b.n" class="tos-block">
          <view class="tos-block__head">
            <text class="tos-block__num">{{ pad(b.n) }}</text>
            <text class="tos-block__title">{{ b.title }}</text>
          </view>
          <text class="tos-block__body">{{ b.body }}</text>
        </view>
      </view>

      <!-- Risk disclosure cross-link -->
      <view class="tos-risk active:opacity-80" role="link" tabindex="0" @click="goRisk" @keydown.enter.prevent="goRisk" @keydown.space.prevent="goRisk">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
        <text class="tos-risk__t">{{ t.terms.riskLink }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </view>

      <!-- Footer entity / contact -->
      <text class="tos-footer">{{ t.terms.footer }}</text>

      <!-- Acknowledge & return -->
      <view class="tos-cta active:opacity-90 active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
        <text class="tos-cta__t">{{ t.terms.gotIt }}</text>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { navBack } from "@/lib/route";

const t = useT();

const blocks = computed(() => {
  const w = t.value.terms;
  return [
    { n: 1, title: w.s1Title, body: w.s1Body },
    { n: 2, title: w.s2Title, body: w.s2Body },
    { n: 3, title: w.s3Title, body: w.s3Body },
    { n: 4, title: w.s4Title, body: w.s4Body },
    { n: 5, title: w.s5Title, body: w.s5Body },
    { n: 6, title: w.s6Title, body: w.s6Body },
    { n: 7, title: w.s7Title, body: w.s7Body },
    { n: 8, title: w.s8Title, body: w.s8Body },
    { n: 9, title: w.s9Title, body: w.s9Body },
    { n: 10, title: w.s10Title, body: w.s10Body },
  ];
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function goBack() {
  navBack("/pages/onboarding/intro");
}
function goRisk() {
  uni.navigateTo({
    url: "/pages/me/risk-disclosure?return=/pages/onboarding/intro",
    fail: () => {},
  });
}
</script>

<style scoped>
.tos-root {
  position: fixed;
  inset: 0;
  background: var(--v5-bg);
  overflow-y: auto;
}

/* Top bar */
.tos-top {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--v5-bg) 86%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--v5-border);
}
.tos-back {
  width: 44px;
  height: 44px;
  margin-left: -8px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
}
.tos-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: center;
}
.tos-brand__n {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--v5-ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tos-brand__n-t {
  color: var(--v5-surface);
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 12px;
}
.tos-brand__name {
  color: var(--v5-ink);
  font-weight: 600;
  font-family: var(--font-v5);
  font-size: 15px;
  letter-spacing: -0.02em;
}
.tos-top__spacer {
  justify-self: end;
}

/* Body */
.tos-wrap {
  padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 40px);
}
.tos-hero {
  margin-bottom: 18px;
}
.tos-eyebrow {
  display: block;
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--v5-brand);
}
.tos-title {
  display: block;
  margin-top: 8px;
  font-family: var(--font-v5);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--v5-ink);
}
.tos-sub {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--v5-ink-3);
}

/* Numbered sections */
.tos-sections {
  border-radius: 16px;
  background: var(--v5-surface);
  padding: 2px 18px;
  display: flex;
  flex-direction: column;
}
.tos-block {
  padding: 14px 0;
}
.tos-block:not(:last-child) {
  border-bottom: 1px solid var(--v5-border);
}
.tos-block__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 5px;
}
.tos-block__num {
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 12px;
  color: var(--v5-brand);
}
.tos-block__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  letter-spacing: -0.01em;
}
.tos-block__body {
  display: block;
  font-size: 13px;
  color: var(--v5-ink-2);
  line-height: 1.65;
}

/* Risk cross-link */
.tos-risk {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--v5-brand-2) 10%, transparent);
}
.tos-risk__t {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-brand-2);
}

/* Footer + CTA */
.tos-footer {
  display: block;
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--v5-ink-4);
  text-align: center;
}
.tos-cta {
  margin-top: 20px;
  height: 52px;
  border-radius: 9999px;
  background: var(--v5-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}
.tos-cta__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
</style>
