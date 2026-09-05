<!--
  UsdtGuide — 「如何获取 USDT」静态指引页(PAY-规格 [FEAT-PAY01] ⑥ 点击流,
  充值页「如何获取 USDT」入口进入)。真平台口吻 4 步:交易所/P2P 购买 →
  提现选一致网络 → 粘贴专属地址 → 等待到账;尾部错网络警示 + 返回充值 CTA。
  壳与 wallet 子页同款:<AppChassis active="me"> + <SubPageHeader>。纯静态零状态。
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet-topup" :title="t.usdtGuide.title" :subtitle="t.usdtGuide.subtitle" />

      <view class="mx-4" style="padding: 0 2px">
        <!-- intro -->
        <view>
          <text class="block" :style="introTitleStyle">{{ t.usdtGuide.introTitle }}</text>
          <text class="block" :style="introBodyStyle">{{ t.usdtGuide.introBody }}</text>
        </view>

        <!-- steps -->
        <view style="margin-top: 20px; display: flex; flex-direction: column; gap: 18px">
          <view v-for="(s, i) in steps" :key="i" class="flex" style="gap: 12px">
            <view class="grid place-items-center shrink-0" :style="stepBadgeStyle">
              <text :style="stepNumStyle">{{ i + 1 }}</text>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" :style="stepTitleStyle">{{ s.title }}</text>
              <text class="block" :style="stepBodyStyle">{{ s.body }}</text>
            </view>
          </view>
        </view>

        <!-- warning note -->
        <view class="flex" :style="warnlineStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          <view class="flex-1 min-w-0">
            <text class="block" :style="warnTitleStyle">{{ t.usdtGuide.noteTitle }}</text>
            <text class="block" :style="warnBodyStyle">{{ t.usdtGuide.noteBody }}</text>
          </view>
        </view>

        <!-- back to top-up CTA -->
        <view class="nx-usdt-guide-back-cta grid place-items-center active:opacity-85" :style="backCtaStyle" role="button" tabindex="0" @click="goBack">
          <text :style="backCtaTextStyle">{{ t.usdtGuide.backCta }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { navBack } from "@/lib/route";

const t = useT();

const steps = computed(() => {
  const g = t.value.usdtGuide;
  return [
    { title: g.step1Title, body: g.step1Body },
    { title: g.step2Title, body: g.step2Body },
    { title: g.step3Title, body: g.step3Body },
    { title: g.step4Title, body: g.step4Body },
  ];
});

function goBack() {
  navBack("/pages/me/wallet-topup");
}

// ── styles ──
const introTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const introBodyStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.55,
};
const stepBadgeStyle: CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
};
const stepNumStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const stepTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1.35,
};
const stepBodyStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.55,
};
const warnlineStyle: CSSProperties = {
  marginTop: "22px",
  padding: "10px 12px",
  gap: "8px",
  borderRadius: "12px",
  background: "var(--v5-warning-soft)",
};
const warnTitleStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-warning)",
  lineHeight: 1.4,
};
const warnBodyStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-warning)",
  lineHeight: 1.45,
};
const backCtaStyle: CSSProperties = {
  marginTop: "20px",
  marginBottom: "8px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
};
const backCtaTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
</script>
