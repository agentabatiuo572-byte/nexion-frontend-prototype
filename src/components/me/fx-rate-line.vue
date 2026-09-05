<!--
  FxRateLine — 汇率牌价行 + 「牌价说明」半屏(PAY-规格 [FEAT-PAY03] ⑤⑥)。
  设计参照 PRD/prototypes/pay-vn-rails.html 的 .ratebar 与 #sheet(牌价说明)。

  自足组件:setup 即拉 fx store(load 内部并发去重,父层重复调用无害),
  零 props / 零 emit;父层(A4 银行转账 pane)只读 useFx().fxAvailable 决定
  禁不禁下单,本组件不管下单闸。
  4 态:加载骨架(<300ms 完成不闪,CSS 延迟显现)/ 未返回占位「—」不显示 0 /
  syncFailed·异常数据「牌价更新中」灰态 / 正常牌价行。
  半屏循 device-deactivate-sheet 先例(scrim z79 + sheet z80,tokens.css 的
  nx-sheet-fade-in / nx-sheet-slide-up 全局关键帧)。
-->
<template>
  <view>
    <view class="flex items-center" style="gap: 6px; padding: 0 4px; min-height: 28px">
      <template v-if="status === 'ready'">
        <text :style="capStyle">{{ t.fx.rateLabel }}</text>
        <text class="whitespace-nowrap" :style="valueStyle">{{ rateLine }}</text>
        <text :style="capStyle">{{ lockLine }}</text>
      </template>
      <view v-else-if="status === 'loading'" class="nx-fx-skel" />
      <template v-else-if="status === 'empty'">
        <text :style="capStyle">{{ t.fx.rateLabel }}</text>
        <text :style="valueStyle">—</text>
      </template>
      <text v-else :style="capStyle">{{ t.fx.updating }}</text>

      <!-- 信息 icon:视觉 28px 圆,点击热区 44×44(负 margin 不撑行高) -->
      <view
        class="shrink-0 grid place-items-center"
        :style="infoHitStyle"
        :aria-label="t.fx.infoAria"
        @click="sheetOpen = true"
      >
        <view class="grid place-items-center transition active:bg-[var(--v5-surface-3)]" :style="infoBtnStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
        </view>
      </view>
    </view>

    <!-- 「牌价说明」半屏 -->
    <view v-if="sheetOpen">
      <view class="nx-sheet-fade-in" :style="scrimStyle" @click="sheetOpen = false" />
      <view class="nx-sheet-slide-up" :style="sheetStyle">
        <text class="block" :style="titleStyle">{{ t.fx.sheetTitle }}</text>
        <text class="block" :style="bodyStyle">{{ sheetBody1 }}</text>
        <text class="block" :style="bodyStyle">{{ t.fx.sheetBody2 }}</text>
        <view class="w-full flex items-center justify-center transition active:scale-[0.98]" :style="okBtnStyle" @click="sheetOpen = false">
          <text :style="okLabelStyle">{{ t.fx.sheetOk }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useFx } from "@/store/fx";
import { fmtVnd } from "@/store/fx-core";

const t = useT();
const fx = useFx();
// 自足加载:组件出现即拉牌价(store 内并发去重)。
void fx.load();

const sheetOpen = ref(false);

// 4 态判定:失败/异常数据 → unavailable;拉取中 → loading;从未返回 → empty。
const status = computed<"loading" | "empty" | "unavailable" | "ready">(() => {
  if (fx.syncFailed || (fx.syncedAt !== null && !fx.fxAvailable)) return "unavailable";
  if (fx.loading) return "loading";
  if (fx.syncedAt === null) return "empty";
  return "ready";
});

const rateLine = computed(() => fmt(t.value.fx.rateValue, { vnd: fmtVnd(fx.quoteRate) }));
const lockLine = computed(() => fmt(t.value.fx.lockNote, { min: fx.lockWindowMin }));
// 半屏正文的锁价分钟数:未返回时用占位「—」,不显示 0(规格 ⑤ 空状态同口径)。
const sheetBody1 = computed(() =>
  fmt(t.value.fx.sheetBody1, { min: fx.lockWindowMin > 0 ? fx.lockWindowMin : "—" }),
);

const capStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const valueStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink-2)",
};
const infoHitStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  marginTop: "-8px",
  marginBottom: "-8px",
  marginRight: "-8px",
  marginLeft: "auto",
};
const infoBtnStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
// 🔴 790/800 = 业务半屏带(理由同 device-deactivate-sheet.vue:原 79/80 低于庆祝 780,
// 会被盖住并吞点击;写成 JS 样式对象所以此前逃过机器门,2026-08-17 补齐)。
const scrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 790,
  background: "rgba(8,8,12,0.45)",
  backdropFilter: "blur(8px) saturate(150%)",
};
const sheetStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 800,
  borderTopLeftRadius: "16px",
  borderTopRightRadius: "16px",
  background: "var(--v5-surface)",
  borderTop: "1px solid var(--v5-border)",
  padding: "18px 16px calc(env(safe-area-inset-bottom) + 38px)",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const bodyStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.55,
};
const okBtnStyle: CSSProperties = {
  marginTop: "16px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const okLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
</script>

<style scoped>
/* 骨架短条:前 300ms 不显现(<300ms 完成不闪,规格 ⑤ 加载态),之后脉冲。 */
.nx-fx-skel {
  width: 172px;
  height: 12px;
  border-radius: 6px;
  background: var(--v5-surface-3);
  opacity: 0;
  animation: nx-fx-skel-pulse 1.2s ease-in-out 0.3s infinite;
}
@keyframes nx-fx-skel-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
</style>
