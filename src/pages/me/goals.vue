<!--
  Earning goals — ported from Nexion-prototype/app/(main)/me/goals/page.tsx.
  Set a USDT target + deadline; remote/sandbox modes ask the server for a
  catalog-backed recommendation, while mock mode retains the demo fallback.

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
          <input class="flex-1" :style="targetInputStyle" type="digit" :value="String(target)" :disabled="editorBlocked" :aria-label="t.goals.targetLabel" @input="onTarget" />
        </view>
        <view class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px" role="radiogroup" :aria-label="t.goals.targetPresetsLabel">
          <view
            v-for="(p, pi) in PRESET_TARGETS"
            :key="p"
            class="nx-goal-target-preset flex items-center justify-center active:opacity-70"
            :style="presetTargetStyle(p)"
            role="radio"
            :aria-disabled="editorBlocked"
            :tabindex="target === p || (pi === 0 && !PRESET_TARGETS.includes(target)) ? 0 : -1"
            :aria-checked="target === p ? 'true' : 'false'"
            :aria-label="fmt(t.goals.targetPresetOption, { amount: String(p) })"
            @click="selectTarget(p)"



            @keydown.enter.prevent="selectTarget(p)" @keydown.space.prevent="selectTarget(p)" @keydown.left.prevent="moveTarget(pi, -1)" @keydown.right.prevent="moveTarget(pi, 1)"
          >
            <text :style="presetTargetLabelStyle(p)">${{ p >= 1000 ? `${p / 1000}K` : p }}</text>
          </view>
        </view>

        <text class="block" :style="[fieldLabelStyle, { marginTop: '18px' }]">{{ t.goals.deadlineLabel }}</text>
        <view class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 6px" role="radiogroup" :aria-label="t.goals.deadlineLabel">
          <view
            v-for="(d, di) in PRESET_DEADLINES_DAYS"
            :key="d"
            class="nx-goal-deadline-preset flex items-center justify-center active:opacity-70"
            :style="presetDeadlineStyle(d)"
            role="radio"
            :aria-disabled="editorBlocked"
            :tabindex="days === d || (di === 0 && !PRESET_DEADLINES_DAYS.includes(days)) ? 0 : -1"
            :aria-checked="days === d ? 'true' : 'false'"
            :aria-label="fmt(t.goals.deadlinePresetOption, { days: String(d) })"
            @click="selectDays(d)"



            @keydown.enter.prevent="selectDays(d)" @keydown.space.prevent="selectDays(d)" @keydown.left.prevent="moveDays(di, -1)" @keydown.right.prevent="moveDays(di, 1)"
          >
            <text :style="presetDeadlineLabelStyle(d)">{{ d }}d</text>
          </view>
        </view>
      </view>

      <!-- Recommendation -->
      <view v-if="target > 0 && remoteApiEnabled && goalsStore.recommendationStatus === 'loading'" class="nx-glass-card mx-4" :style="recCardStyle">
        <text class="block" :style="recHeaderStyle">{{ t.goals.recHeader }}</text>
        <text class="block" :style="recReasonStyle">{{ t.goals.loading }}</text>
      </view>
      <view v-else-if="target > 0 && remoteApiEnabled && goalsStore.recommendationStatus === 'error'" class="mx-4" :style="recCardStyle">
        <text class="block" :style="recHeaderStyle">{{ t.goals.recHeader }}</text>
        <text class="block" :style="recReasonStyle">{{ goalsStore.recommendationError === 'GOAL_NO_ELIGIBLE_PRODUCT' ? t.goals.noEligibleProduct : t.goals.serverUnavailable }}</text>
        <view v-if="goalsStore.recommendationError !== 'GOAL_NO_ELIGIBLE_PRODUCT'" class="inline-flex items-center active:opacity-80" :style="recCtaStyle" role="button" tabindex="0" :aria-label="t.ui.retry" @click="retryGoals"  @keydown.enter.prevent="retryGoals" @keydown.space.prevent="retryGoals">
          <text :style="recCtaLabelStyle">{{ t.ui.retry }}</text>
        </view>
      </view>
      <view v-else-if="target > 0 && (!remoteApiEnabled || (goalsStore.recommendationStatus === 'ready' && goalsStore.recommendation?.purchaseRequired === true))" class="mx-4" :style="recCardStyle">
        <text class="block" :style="recHeaderStyle">{{ t.goals.recHeader }}</text>
        <text class="block" :style="recPathStyle">{{ recPathLine }}</text>
        <text class="block" :style="recReasonStyle">{{ recommendation.reason }}</text>
        <view class="inline-flex items-center active:opacity-80" :style="recCtaStyle" role="button" tabindex="0" :aria-label="t.goals.shopCta" @click="goStore"  @keydown.enter.prevent="goStore" @keydown.space.prevent="goStore">
          <text :style="recCtaLabelStyle">{{ t.goals.shopCta }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- Save -->
      <view style="padding: 0 16px; margin-top: 12px">
        <view class="w-full flex items-center justify-center active:scale-[0.98]" :style="[saveBtnStyle, saveBlocked ? saveBtnPendingStyle : {}]" role="button" :tabindex="saveBlocked ? -1 : 0" :aria-label="t.goals.saveCta" :aria-disabled="saveBlocked" @click="onSave"  @keydown.enter.prevent="onSave" @keydown.space.prevent="onSave">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
          <text :style="saveLabelStyle" style="pointer-events: none">{{ t.goals.saveCta }}</text>
        </view>
      </view>

      <!-- Active goals — de-carded: transparent hairline group on the page floor -->
      <view v-if="remoteApiEnabled && goalsStore.status === 'loading' && goals.length === 0" class="mx-4" :style="emptyStateStyle"><text>{{ t.goals.loading }}</text></view>
      <view v-else-if="remoteApiEnabled && goalsStore.status === 'error' && goals.length === 0" class="mx-4" :style="emptyStateStyle">
        <text>{{ t.goals.serverUnavailable }}</text>
        <view class="inline-flex items-center active:opacity-80" :style="recCtaStyle" role="button" tabindex="0" :aria-label="t.ui.retry" @click="retryGoals"  @keydown.enter.prevent="retryGoals" @keydown.space.prevent="retryGoals"><text :style="recCtaLabelStyle">{{ t.ui.retry }}</text></view>
      </view>
      <view v-if="remoteApiEnabled && goalsStore.status === 'error' && goals.length > 0" class="mx-4" :style="emptyStateStyle">
        <text>{{ t.goals.serverUnavailable }}</text>
        <view class="inline-flex items-center active:opacity-80" :style="recCtaStyle" role="button" tabindex="0" :aria-label="t.ui.retry" @click="retryGoals"  @keydown.enter.prevent="retryGoals" @keydown.space.prevent="retryGoals"><text :style="recCtaLabelStyle">{{ t.ui.retry }}</text></view>
      </view>
      <view v-if="goals.length > 0">
        <text class="block" :style="sectionLabelStyle">{{ t.goals.activeGoals }}</text>
        <view :style="goalGroupStyle">
          <view v-for="(g, gi) in goals" :key="g.id" :style="goalRowStyle(gi === goals.length - 1)">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="goalTargetStyle">${{ g.targetUSDT.toLocaleString() }}</text>
              <view class="grid place-items-center active:opacity-70" :style="goalRemoveStyle" role="button" tabindex="0" :aria-label="fmt(t.goals.removeGoalLabel, { amount: g.targetUSDT.toLocaleString() })" @click="remove(g.id)"  @keydown.enter.prevent="remove(g.id)" @keydown.space.prevent="remove(g.id)">
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
import { navReset } from "@/lib/route";
import { computed, nextTick, onMounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import GoalProgressBar from "@/components/me/goal-progress-bar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useGoals, type Goal } from "@/store/goals";
import { useApp } from "@/store/app";
import { useUI } from "@/store/ui";
import { remoteApiEnabled } from "@/api/runtime";
import { nexGridBrandText } from "@/lib/brand-copy";

const PRESET_TARGETS = [500, 1000, 5000, 10000];
const PRESET_DEADLINES_DAYS = [30, 90, 180, 365];
const ONE_DAY_MS = 86400000;

const t = useT();
const goalsStore = useGoals();
const app = useApp();
const ui = useUI();

const lifeTimeEarnings = computed(() => remoteApiEnabled ? goalsStore.lifetimeEarningsUsdt : app.earnings.total);
const goals = computed(() => goalsStore.goals);
const target = ref(1000);
const days = ref(90);
const savePending = ref(false);
const restoredGoal = ref<{ targetUSDT: number; days: number } | null>(null);
const editorBlocked = computed(() => savePending.value || (remoteApiEnabled && goalsStore.status !== "ready"));
const saveBlocked = computed(() => editorBlocked.value || (remoteApiEnabled && restoredGoal.value !== null
    && target.value === restoredGoal.value.targetUSDT && days.value === restoredGoal.value.days));
type GoalSaveIntent = { targetUSDT: number; days: number; deadlineMs: number; idempotencyKey: string };
const retryableSaveIntents = new Map<string, GoalSaveIntent>();
let saveEpoch = 0;
let editorReadEpoch = 0;
let restoringEditor = false;

const recommendation = computed(() => {
  if (remoteApiEnabled && goalsStore.recommendation?.purchaseRequired) {
    return {
      tier: nexGridBrandText(goalsStore.recommendation.productName ?? ""),
      reason: fmt(t.value.goals.recReasonServer, { daily: formatGoalDailyRate(goalsStore.recommendation.dailyEarn ?? 0) }),
    };
  }
  if (remoteApiEnabled) return { tier: "", reason: "" };
  const perDay = target.value / days.value;
  if (perDay <= 7) return { tier: "UVELBox S1", reason: t.value.goals.recS1 };
  if (perDay <= 13) return { tier: "UVELBox Pro", reason: t.value.goals.recPro };
  return { tier: "UVELRack P1", reason: t.value.goals.recRack };
});

const heroSubLine = computed(() =>
  fmt(t.value.goals.heroSubtitle, { current: lifeTimeEarnings.value.toFixed(2) }),
);
const recPathLine = computed(() =>
  fmt(t.value.goals.recPath, {
    target: target.value.toLocaleString(),
    days: goalsStore.recommendation?.days ?? days.value,
    tier: recommendation.value.tier,
    perDay: formatGoalDailyRate(goalsStore.recommendation?.requiredDaily ?? target.value / days.value),
  }),
);

function formatGoalDailyRate(value: number): string {
  if (value > 0 && value < 0.01) return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return value.toFixed(2);
}

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onTarget(e: Event) {
  if (editorBlocked.value) return;
  target.value = Math.max(0, parseFloat(detailVal(e)) || 0);
}
function selectTarget(value: number) {
  if (!editorBlocked.value) target.value = value;
}
function selectDays(value: number) {
  if (!editorBlocked.value) days.value = value;
}
/**
 * roving tabindex 的标准行为:方向键移一格并选上,焦点跟到新选中项。
 *
 * 🔴 两个必须点(否则方向键要么跳组、要么把焦点丢掉):
 *  ① 聚焦选择器必须**限定在本组内** —— 本页有两组档位(目标 / 期限),全局
 *     `[role="radio"]` 会命中另一组,方向键一按焦点就跳到隔壁。
 *  ② 锚点按 `tabindex="0"` 取,不按 `aria-checked="true"` —— 用户手输的自定义值
 *     (如 $1500)不在档位里时**没有任何一格是 checked**,按 aria-checked 取到 null,
 *     焦点直接掉回 body,键盘用户被踢出表单(zentao #223)。
 */
function movePreset(selector: string, list: number[], index: number, delta: number, apply: (value: number) => void): void {
  const next = list[(index + delta + list.length) % list.length];
  if (next === undefined) return;
  apply(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(`${selector}[tabindex="0"]`)?.focus();
  });
}
function moveTarget(index: number, delta: number): void { movePreset(".nx-goal-target-preset", PRESET_TARGETS, index, delta, selectTarget); }
function moveDays(index: number, delta: number): void { movePreset(".nx-goal-deadline-preset", PRESET_DEADLINES_DAYS, index, delta, selectDays); }

watch(() => goalsStore.accountEpoch, () => {
  editorReadEpoch += 1;
  restoringEditor = true;
  target.value = 1000;
  days.value = 90;
  restoredGoal.value = null;
  restoringEditor = false;
  saveEpoch += 1;
  savePending.value = false;
  retryableSaveIntents.clear();
}, { flush: "sync" });

function restoreEditorFromGoal(goal: Goal | undefined): void {
  restoringEditor = true;
  target.value = goal?.targetUSDT ?? 1000;
  // The selected term is fixed at creation; remaining days are shown only in the goal row.
  days.value = goal ? Math.max(1, Math.round((goal.deadlineMs - goal.createdAt) / ONE_DAY_MS)) : 90;
  restoredGoal.value = goal ? { targetUSDT: target.value, days: days.value } : null;
  restoringEditor = false;
}

async function refreshRemoteGoals(force = false): Promise<void> {
  if (!remoteApiEnabled) return;
  const expectedReadEpoch = ++editorReadEpoch;
  const expectedAccountEpoch = goalsStore.accountEpoch;
  const list = force ? goalsStore.refresh() : goalsStore.ensure();
  await list;
  if (expectedReadEpoch !== editorReadEpoch || expectedAccountEpoch !== goalsStore.accountEpoch
      || goalsStore.status !== "ready" || savePending.value) return;
  const latestActive = goalsStore.goals.filter((goal) => !goal.achieved)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  restoreEditorFromGoal(latestActive);
  await goalsStore.refreshRecommendation(target.value, latestActive?.deadlineMs ?? Date.now() + days.value * ONE_DAY_MS);
}

function retryGoals() {
  void refreshRemoteGoals(true);
}

onMounted(() => {
  void refreshRemoteGoals();
});

onShow(() => {
  void refreshRemoteGoals();
});

watch([target, days], () => {
  if (!restoringEditor && remoteApiEnabled && goalsStore.status === "ready" && target.value >= 100 && days.value > 0) {
    void goalsStore.refreshRecommendation(target.value, Date.now() + days.value * ONE_DAY_MS);
  }
}, { flush: "sync" });

watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => {
  void refreshRemoteGoals();
});

function deadlineLine(deadlineMs: number): string {
  const daysLeft = Math.max(0, Math.ceil((deadlineMs - Date.now()) / ONE_DAY_MS));
  return fmt(t.value.goals.deadlineRow, { n: daysLeft });
}
function goalPct(targetUSDT: number): number {
  return Math.min(100, (lifeTimeEarnings.value / targetUSDT) * 100);
}

async function onSave() {
  if (saveBlocked.value) return;
  if (target.value < 100) {
    ui.pushToast({ kind: "warn", title: t.value.goals.minTargetWarn });
    return;
  }
  const intentKey = `${target.value}|${days.value}`;
  const expectedAccountEpoch = goalsStore.accountEpoch;
  const expectedSaveEpoch = ++saveEpoch;
  const isCurrentSave = () => expectedAccountEpoch === goalsStore.accountEpoch && expectedSaveEpoch === saveEpoch;
  const intent = retryableSaveIntents.get(intentKey)
    ?? {
        targetUSDT: target.value,
        days: days.value,
        deadlineMs: Date.now() + days.value * ONE_DAY_MS,
        // IDEMPOTENCY-FRESH-OK:首次创建后立即写入 retryableSaveIntents；失败重试按同一 intentKey 复用，成功才删除。
        idempotencyKey: `goal-save-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
      };
  retryableSaveIntents.set(intentKey, intent);
  savePending.value = true;
  try {
    const outcome = await goalsStore.setGoal(intent);
    if (!isCurrentSave() || outcome === "stale") return;
    retryableSaveIntents.delete(intentKey);
    restoreEditorFromGoal(goalsStore.goals[goalsStore.goals.length - 1]);
    void goalsStore.refreshRecommendation(target.value, goalsStore.goals[goalsStore.goals.length - 1]?.deadlineMs ?? Date.now() + days.value * ONE_DAY_MS);
    ui.pushToast({ kind: "success", title: fmt(t.value.goals.savedToast, { amount: target.value.toLocaleString("en-US"), days: days.value }) });
  } catch (error) {
    if (!isCurrentSave()) return;
    ui.pushToast({ kind: "warn", title: error instanceof Error ? error.message : t.value.goals.serverUnavailable });
  } finally {
    if (isCurrentSave()) savePending.value = false;
  }
}

async function remove(id: string) {
  try {
    await goalsStore.remove(id);
  } catch (error) {
    ui.pushToast({ kind: "warn", title: error instanceof Error ? error.message : t.value.goals.serverUnavailable });
  }
}

// Carry the server's recommended SKU into the store so the landing page can
// locate/highlight it instead of silently featuring the generic first product
// (BUG 71). The name travels along so a recommendation that is no longer
// purchasable can still be named in the change explanation.
function goStore() {
  const productNo = goalsStore.recommendation?.productNo;
  const name = recommendation.value.tier;
  const query = productNo
    ? `?focus=${encodeURIComponent(productNo)}${name ? `&focusName=${encodeURIComponent(name)}` : ""}`
    : "";
  navReset({ url: `/pages/store/store${query}`, fail: () => {} });
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
const recCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  marginTop: "12px",
  borderRadius: "var(--nx-glass-radius)",
  padding: "16px",
  background: "var(--nx-glass-fill)",
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
const saveBtnPendingStyle: CSSProperties = { opacity: 0.65 };
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
const emptyStateStyle: CSSProperties = {
  marginTop: "20px", padding: "16px", color: "var(--v5-ink-3)", textAlign: "center",
};


</script>
