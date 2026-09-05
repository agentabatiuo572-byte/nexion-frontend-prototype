<!--
  Earning goals — ported from Nexion-prototype/app/(main)/me/goals/page.tsx.
  Set a USDT target + deadline; page recommends a device tier to close the gap,
  then lists active goals with a scroll-grow progress bar each.

  Wrapped in <AppChassis active="me">; SubPageHeader (back chevron) scrolls
  with content. <input> → uni <input>; per-goal bar extracted to
  GoalProgressBar (own IntersectionObserver per row). On-warning text uses
  var(--v5-on-brand) (project convention); the source's #14130A/#0F0F0F hero
  gradient is rebuilt from tokens.
-->
<template>
  <AppChassis active="me">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="t.goals.navTitle" />

      <!-- Hero -->
      <view class="mx-4" :style="heroStyle">
        <view class="flex items-center" style="gap: 8px; margin-bottom: 6px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
          <text class="font-mono-tabular" :style="heroLabelStyle">{{ t.goals.heroLabel }}</text>
        </view>
        <text class="block" :style="heroTitleStyle">{{ t.goals.heroTitle }}</text>
        <text class="block" :style="heroSubStyle">{{ heroSubLine }}</text>
      </view>

      <!-- Setter — de-carded: labels + L1-filled input sit on the page floor -->
      <view class="mx-4" :style="setterWrapStyle">
        <text class="block" :style="fieldLabelStyle">{{ t.goals.targetLabel }}</text>
        <view class="flex items-center" :style="inputBoxStyle">
          <text :style="dollarStyle">$</text>
          <input class="flex-1" :style="targetInputStyle" type="digit" :value="String(target)" @input="onTarget" />
        </view>
        <view class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px">
          <view
            v-for="p in PRESET_TARGETS"
            :key="p"
            class="flex items-center justify-center active:opacity-70"
            :style="presetTargetStyle(p)"
            @click="target = p"
          >
            <text :style="presetTargetLabelStyle(p)">${{ p >= 1000 ? `${p / 1000}K` : p }}</text>
          </view>
        </view>

        <text class="block" :style="[fieldLabelStyle, { marginTop: '18px' }]">{{ t.goals.deadlineLabel }}</text>
        <view class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 6px">
          <view
            v-for="d in PRESET_DEADLINES_DAYS"
            :key="d"
            class="flex items-center justify-center active:opacity-70"
            :style="presetDeadlineStyle(d)"
            @click="days = d"
          >
            <text :style="presetDeadlineLabelStyle(d)">{{ d }}d</text>
          </view>
        </view>
      </view>

      <!-- Recommendation -->
      <view v-if="target > 0" class="mx-4" :style="recCardStyle">
        <text class="block" :style="recHeaderStyle">{{ t.goals.recHeader }}</text>
        <text class="block" :style="recPathStyle">{{ recPathLine }}</text>
        <text class="block" :style="recReasonStyle">{{ recommendation.reason }}</text>
        <view class="inline-flex items-center active:opacity-80" :style="recCtaStyle" @click="goStore">
          <text :style="recCtaLabelStyle">{{ t.goals.shopCta }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- Save -->
      <view style="padding: 0 16px; margin-top: 12px">
        <view class="w-full flex items-center justify-center active:scale-[0.98]" :style="saveBtnStyle" role="button" tabindex="0" :aria-label="t.goals.saveCta" @click="onSave">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
          <text :style="saveLabelStyle" style="pointer-events: none">{{ t.goals.saveCta }}</text>
        </view>
      </view>

      <!-- Active goals — de-carded: transparent hairline group on the page floor -->
      <view v-if="goals.length > 0">
        <text class="block" :style="sectionLabelStyle">{{ t.goals.activeGoals }}</text>
        <view :style="goalGroupStyle">
          <view v-for="(g, gi) in goals" :key="g.id" :style="goalRowStyle(gi === goals.length - 1)">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="goalTargetStyle">${{ g.targetUSDT.toLocaleString() }}</text>
              <view class="grid place-items-center active:opacity-70" :style="goalRemoveStyle" @click="remove(g.id)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </view>
            </view>
            <text class="block" :style="goalDeadlineStyle">{{ deadlineLine(g.deadlineMs) }}</text>
            <GoalProgressBar :pct="goalPct(g.targetUSDT)" />
            <view class="flex items-center justify-between font-mono-tabular" style="margin-top: 4px">
              <text :style="goalFootMutedStyle">${{ lifeTimeEarnings.toFixed(0) }} / ${{ g.targetUSDT.toLocaleString() }}</text>
              <text :style="goalFootPctStyle">{{ goalPct(g.targetUSDT).toFixed(0) }}%</text>
            </view>
            <view v-if="g.achieved" class="inline-flex items-center" :style="achievedBadgeStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
              <text :style="achievedLabelStyle">{{ t.goals.achievedBadge }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import GoalProgressBar from "@/components/me/goal-progress-bar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useGoals } from "@/store/goals";
import { useApp } from "@/store/app";
import { toast } from "@/store/ui";

const PRESET_TARGETS = [500, 1000, 5000, 10000];
const PRESET_DEADLINES_DAYS = [30, 90, 180, 365];
const ONE_DAY_MS = 86400000;

const t = useT();
const goalsStore = useGoals();
const app = useApp();

const lifeTimeEarnings = computed(() => app.earnings.total);
const goals = computed(() => goalsStore.goals);
const target = ref(1000);
const days = ref(90);

const recommendation = computed(() => {
  const perDay = target.value / days.value;
  if (perDay <= 0.19) return { tier: "Cloud Share", reason: t.value.goals.recCloudShare };
  if (perDay <= 7) return { tier: "NexGridBox S1", reason: t.value.goals.recS1 };
  if (perDay <= 13) return { tier: "NexGridBox Pro", reason: t.value.goals.recPro };
  return { tier: "NexGridRack P1", reason: t.value.goals.recRack };
});

const heroSubLine = computed(() =>
  fmt(t.value.goals.heroSubtitle, { current: lifeTimeEarnings.value.toFixed(2) }),
);
const recPathLine = computed(() =>
  fmt(t.value.goals.recPath, {
    target: target.value.toLocaleString(),
    days: days.value,
    tier: recommendation.value.tier,
    perDay: (target.value / days.value).toFixed(2),
  }),
);

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onTarget(e: Event) {
  target.value = Math.max(0, parseFloat(detailVal(e)) || 0);
}

function deadlineLine(deadlineMs: number): string {
  const daysLeft = Math.max(0, Math.ceil((deadlineMs - Date.now()) / ONE_DAY_MS));
  return fmt(t.value.goals.deadlineRow, { n: daysLeft });
}
function goalPct(targetUSDT: number): number {
  return Math.min(100, (lifeTimeEarnings.value / targetUSDT) * 100);
}

function onSave() {
  if (target.value < 100) {
    toast.warn(t.value.goals.minTargetWarn);
    return;
  }
  goalsStore.setGoal({ targetUSDT: target.value, deadlineMs: Date.now() + days.value * ONE_DAY_MS });
  toast.success(fmt(t.value.goals.savedToast, { amount: target.value, days: days.value }));
  target.value = 1000;
  days.value = 90;
}

function remove(id: string) {
  goalsStore.remove(id);
}

function goStore() {
  uni.reLaunch({ url: "/pages/store/store", fail: () => {} });
}

// ── styles ──
function presetTargetStyle(p: number): CSSProperties {
  return {
    height: "44px",
    borderRadius: "8px",
    // 未选中原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),预设块直接坐在页面底上 → 改 L1
    background: target.value === p ? "var(--v5-warning)" : "var(--v5-surface)",
  };
}
function presetTargetLabelStyle(p: number): CSSProperties {
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    color: target.value === p ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
function presetDeadlineStyle(d: number): CSSProperties {
  return {
    height: "44px",
    borderRadius: "8px",
    // 同上:与目标预设同容器同尺寸,未选中态一并改 L1
    background: days.value === d ? "var(--v5-brand)" : "var(--v5-surface)",
  };
}
function presetDeadlineLabelStyle(d: number): CSSProperties {
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    fontWeight: days.value === d ? 600 : 400,
    color: days.value === d ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}

// De-carded: hero intro sits on the page floor — surface/border + the warning
// radial dropped (a page-floor aura per owner call: deleted, not re-tuned).
// 2px inset (mx-4 + this) aligns with the labels + groups below at 18px.
const heroStyle: CSSProperties = { padding: "0 2px" };
const heroLabelStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-warning)",
};
const heroTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1.25,
};
const heroSubStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.6,
};
// Setter — de-carded floor block; the $ input box sits on the page floor at L1
// surface (de-card white-list: input = filled box, no border).
const setterWrapStyle: CSSProperties = { marginTop: "18px", padding: "0 2px" };
const fieldLabelStyle: CSSProperties = {
  marginBottom: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const inputBoxStyle: CSSProperties = {
  gap: "8px",
  height: "52px",
  padding: "0 14px",
  borderRadius: "12px",
  // 输入框直接坐在页面底上,surface-3 对页面底亮色 ΔE 2.7 不可辨(内凹读不出来)→ 改 L1 surface。
  background: "var(--v5-surface)",
};
const dollarStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  color: "var(--v5-warning)",
};
const targetInputStyle: CSSProperties = {
  height: "40px",
  background: "transparent",
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const recCardStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "16px",
  padding: "16px",
  background: "color-mix(in srgb, var(--v5-brand) 6%, transparent)",
};
const recHeaderStyle: CSSProperties = {
  marginBottom: "6px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  letterSpacing: "0.14em",
  color: "var(--v5-brand)",
};
const recPathStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1.375,
};
const recReasonStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.6,
};
const recCtaStyle: CSSProperties = {
  marginTop: "12px",
  gap: "4px",
  minHeight: "44px",
  alignItems: "center",
};
const recCtaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const saveBtnStyle: CSSProperties = {
  gap: "6px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-warning)",
};
const saveLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
const sectionLabelStyle: CSSProperties = {
  margin: "22px 18px 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
// Active goals — transparent hairline group (leaderboard rest-list idiom): the
// container border-top opens the group, each row carries its own divider.
const goalGroupStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function goalRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "14px 0",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const goalTargetStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const goalRemoveStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  background: "var(--v5-surface-2)",
};
const goalDeadlineStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const goalFootMutedStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const goalFootPctStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-warning)",
};
const achievedBadgeStyle: CSSProperties = {
  marginTop: "8px",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
};
const achievedLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand)",
};
</script>
