<!--
  CapacityExplainerSheet(W-CAP1)— FEAT-DEV01 任务产能与新机补贴说明弹层。
  入口:设备卡产能行 / 新机补贴 badge / earn 任务池提示线(共用 use-capacity-explainer)。
  纯展示层:两段说明 + 升级 CTA;不读写任何业务状态。
-->
<template>
  <view v-if="visible" class="fixed inset-0" style="z-index: 900">
    <!-- 仅 @click(uni 编译器小程序端自动映射 tap;H5 双绑会双触发) -->
    <view class="absolute inset-0" style="background: var(--v5-bg-color-mask)" @click="close" />
    <view class="absolute left-0 right-0 bottom-0" :style="sheetStyle">
      <view class="flex items-center justify-between">
        <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 650; color: var(--v5-ink)">{{ t.earn.capExplainTitle }}</text>
        <view class="grid place-items-center active:opacity-70" :style="closeBtnStyle" @click.stop="close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <view class="mt-4">
        <view class="flex items-center gap-1.5" :style="secTitleStyle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text>{{ t.earn.capExplainS1Title }}</text>
        </view>
        <view style="margin-top: 6px"><text :style="secBodyStyle">{{ t.earn.capExplainS1Body }}</text></view>
      </view>

      <view class="mt-4">
        <view class="flex items-center gap-1.5" :style="secTitleStyle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m4.9 19.1 2.9-2.9" /><path d="M2 12h4" /><path d="m4.9 4.9 2.9 2.9" /></svg>
          <text>{{ t.earn.capExplainS2Title }}</text>
        </view>
        <view style="margin-top: 6px"><text :style="secBodyStyle">{{ t.earn.capExplainS2Body }}</text></view>
      </view>

      <view class="mt-5 w-full grid place-items-center active:scale-[0.98]" :style="ctaStyle" @click.stop="goStore">
        <text :style="ctaLabelStyle">{{ t.earn.capExplainCta }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";

const t = useT();
const { visible, close } = useCapacityExplainer();

function goStore() {
  close();
  navTo("/pages/store/store");
}

const sheetStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 18px 30px",
  boxShadow: "var(--v5-card-shadow-lift-strong)",
};
const closeBtnStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "10px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
};
const secTitleStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-2)",
};
const secBodyStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.65,
  color: "var(--v5-ink-3)",
};
const ctaStyle: CSSProperties = {
  height: "46px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const ctaLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
</script>
