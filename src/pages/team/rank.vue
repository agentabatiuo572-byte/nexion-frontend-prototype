<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.rank.pageTitle" pill />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- My status — de-carded: sits directly on the page floor (card shell +
             in-card glow dropped; a glow on the page floor would be a floor aura,
             which gets deleted per owner call 2026-07-08). Rules-intro pill rides
             the cap row (owner 2026-07-09: kill the empty gap above the hero). -->
        <view v-if="rankAvailable" :style="heroStyle">
          <view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <text class="block" :style="heroCapStyle">{{ t.rank.currentRank }}</text>
              <!-- 规则介绍 pill — 跳转类入口,按契约 §2.1 用 role="link"(只吃 Enter,
                   Space 留给页面滚动);键盘激活由 lib/a11y-activate.ts 平台层合成,
                   故不手写 @keydown(BUG 170)。与 commissions.vue 同一药丸写法同源。 -->
              <view class="nx-rank-how-link inline-flex items-center shrink-0 active:scale-[0.98] transition-transform" :style="howEntryStyle" role="link" tabindex="0" :aria-label="t.rank.howItWorksEntry" @click="go('/pages/team/rank-how')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                <text>{{ t.rank.howItWorksEntry }}</text>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </view>
            </view>
            <view class="flex items-center" style="margin-top: 8px; gap: 12px">
              <VBadgeIcon :v="myRank" :size="48" />
              <view>
                <text class="block" :style="heroRankStyle">{{ rankLabel(myRank, locale.code, rankDefs) }}</text>
              </view>
            </view>


          </view>
        </view>

        <!-- Active rank ladder — single surface container (form b): outer border
             dropped, the fill is the single visual difference; rows hairlined. -->
        <view v-if="rankAvailable" class="rounded-2xl overflow-hidden" :style="ladderCardStyle">
          <view
            v-for="(r, idx) in rankDefs"
            :key="r.v"
            class="flex items-start"
            :style="rowStyle(rowStatus(r.v), idx === rankDefs.length - 1)"
          >
            <VBadgeIcon :v="r.v" :size="36" />
            <view class="flex-1 min-w-0">
              <view class="rank-row-heading flex items-center" role="button" tabindex="0" :aria-label="rankLabel(r.v, locale.code, rankDefs)" :aria-expanded="expandedRank === r.v" :aria-controls="`rank-details-${r.v}`" @click="expandedRank = expandedRank === r.v ? null : r.v">
                <text class="font-display" :style="rowTitleStyle">{{ rankLabel(r.v, locale.code, rankDefs) }}</text>
                <view v-if="rowStatus(r.v) === 'done'" class="flex items-center" style="gap: 2px">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <text :style="{ fontSize: '12px', color: 'var(--v5-brand)', fontWeight: 500 }">{{ t.rank.done }}</text>
                </view>
                <text v-else-if="rowStatus(r.v) === 'current'" class="font-mono-tabular" :style="currentTagStyle">{{ t.rank.current }}</text>
                <svg class="rank-row-chevron" :class="{ 'rank-row-chevron--open': expandedRank === r.v }" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </view>
              <view v-if="expandedRank === r.v" :id="`rank-details-${r.v}`">
              <view class="rank-detail">
                <text class="rank-detail__label">{{ t.rank.conditionsLabel }}</text>
                <text>{{ formatConditions(r) }}</text>
                <text v-if="r.v > 1" class="rank-detail__hint">{{ t.rank.previousConditions }}</text>
              </view>
              <view class="rank-detail">
                <text class="rank-detail__label">{{ t.rank.benefitsLabel }}</text>
                <text>{{ benefitText(r) }}</text>
              </view>
              <view class="rank-detail">
                <text class="rank-detail__label">{{ t.rank.rewardsLabel }}</text>
                <text>{{ r.rewards.length ? r.rewards.map(rewardText).join(' · ') : t.rank.noRewards }}</text>
              </view>
              <view v-if="prog.next?.v === r.v" class="rank-next-progress">
                <text class="rank-detail__label">{{ t.rank.progressLabel }}</text>
                <view v-for="condition in nextConditions" :key="condition.key" style="margin-top: 6px">
                  <text class="block">{{ condition.label }} · {{ t.rank.progressLabel }} {{ condition.values }}</text>
                  <view class="rank-progress-track" role="progressbar" :aria-label="condition.label" :aria-valuenow="condition.percent" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="condition.values"><view :style="{ width: condition.percent + '%' }" /></view>
                  <text class="block">{{ condition.gap }}</text>
                </view>
              </view>
              </view>

            </view>
          </view>
        </view>
        <view v-else-if="vState.remoteError" class="rounded-2xl" :style="unavailableStyle" @click="retryRank">
          <text class="block" style="font-size: 13px; color: var(--v5-ink-2)">{{ t.rank.loadError }}</text>
          <text class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-brand)">{{ t.rank.retry }}</text>
        </view>
        <view v-else class="rounded-2xl" :style="unavailableStyle" role="status" aria-live="polite" aria-busy="true">
          <text class="block" style="font-size: 13px; color: var(--v5-ink-2)">{{ t.rank.loading }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { platformDisplayText } from "@/lib/brand-copy";
import { isEntitlementVRankReward, rankEntitlementLabel } from "@/lib/rank-entitlement-label";
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVRank, nextRankProgress, type VRank, type VRankDef, type VRankReward, type VRankConditions, type RankGap } from "@/store/v-rank";
import { rankGapText, rankConditionsText, rankLabel } from "@/lib/v-rank-copy";
import { formatHowNumber } from "@/lib/rank-how-content";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled } from "@/api/runtime";
import { onShow } from "@dcloudio/uni-app";

const t = useT();
// 中文界面显示中文头衔(主人 2026-08-17 拍板:V3 = 舰长),拼法收在 lib/v-rank-copy
const locale = useLocaleStore();
const vState = useVRank();

const myRank = computed(() => vState.myRank);
const rankDefs = computed(() => vState.ladder);
const rankAvailable = computed(() => !remoteApiEnabled || vState.remoteReady);
// The API supplies exact L1 rank buckets; the engine counts members at or above
// each required rank. This projection is only for the observed progress display.
const previewData = computed(() => ({
  myRank: vState.myRank,
  selfBuyUSD: vState.selfBuyUSD,
  directRefs: vState.directRefs,
  teamVolumeUSD: vState.teamVolumeUSD,
  vDownlineCounts: Object.fromEntries(rankDefs.value.map(({ v }) => [v,
    Object.entries(vState.vDownlineCounts).reduce((sum, [level, count]) => sum + (Number(level) >= v ? count : 0), 0),
  ])) as Partial<Record<VRank, number>>,
}));
const prog = computed(() => nextRankProgress(previewData.value, rankDefs.value));
const expandedRank = ref<VRank | null>(null);
watch(() => [rankAvailable.value, myRank.value, prog.value.next?.v] as const, ([ready]) => {
  if (ready) expandedRank.value = prog.value.next?.v ?? myRank.value;
}, { immediate: true });
const nextConditions = computed(() => {
  const next = prog.value.next;
  if (!next) return [];
  const rows: { key: string; label: string; values: string; gap: string; percent: number }[] = [];
  // The server evaluates every preceding tier, even when rank protection retains
  // the current rank after a refund. Keep each threshold tied to its source tier.
  for (const rank of rankDefs.value.filter((r) => r.v > 0 && r.v <= next.v)) {
    const c = rank.conditions;
    const preview = nextRankProgress({ ...previewData.value, myRank: (rank.v - 1) as VRank }, rankDefs.value);
    const add = (conditions: VRankConditions, current: number, required: number, kind: RankGap["kind"], vLevel?: number) => {
      const gap = preview.missing.find((item) => item.kind === kind
        && (item.kind !== "vDownlines" || item.vLevel === vLevel));
      if (rank.v < next.v && !gap) return;
      const unit = kind === "selfBuy" || kind === "teamVolume" ? "$" : "";
      rows.push({
        key: `${rank.v}-${kind}-${vLevel ?? ""}`,
        label: `V${rank.v} · ${rankConditionsText(t.value, conditions, locale.code)}`,
        values: `${unit}${unit ? formatAmount(current) : formatHowNumber(current, locale.code)} / ${unit}${unit ? formatAmount(required) : formatHowNumber(required, locale.code)}`,
        gap: gap ? rankGapText(t.value, gap, locale.code, rankDefs.value) : t.value.rank.done,
        percent: Math.min(100, Math.max(0, Math.round(current / required * 100))),
      });
    };
    if (c.selfBuyUSD) add({ selfBuyUSD: c.selfBuyUSD }, vState.selfBuyUSD, c.selfBuyUSD, "selfBuy");
    if (c.directRefs) add({ directRefs: c.directRefs }, vState.directRefs, c.directRefs, "directRefs");
    if (c.teamVolumeUSD) add({ teamVolumeUSD: c.teamVolumeUSD }, vState.teamVolumeUSD, c.teamVolumeUSD, "teamVolume");
    for (const [level, required] of Object.entries(c.vDownlines ?? {})) {
      if (required) add({ vDownlines: { [level]: required } }, previewData.value.vDownlineCounts[Number(level) as VRank] ?? 0, required, "vDownlines", Number(level));
    }
  }
  return rows;
});

onMounted(() => {
  // Local rank data is not used in remote mode; the ladder and member progress arrive together.
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
});
onShow(() => {
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
});

function retryRank() {
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
}

function rowStatus(v: VRank): "done" | "current" | "locked" {
  return v < vState.myRank ? "done" : v === vState.myRank ? "current" : "locked";
}

function rewardText(reward: VRankReward): string {
  if (isEntitlementVRankReward(reward)) return platformDisplayText(rankEntitlementLabel(reward, t.value.rank.rewardUnavailable));
  const amount = `${formatAmount(reward.amount)} ${reward.type === "NEX" ? "UVT" : reward.type}`;
  if (reward.type === "NEX" && !/self|direct/i.test(reward.customLabel ?? "")) {
    return `${amount} (${t.value.rank.cultivationRecipient})`;
  }
  return amount;
}

// 三语:词典里 rank.cond.* 五条早就有(此前是死键,这里原本拼英文)
const formatConditions = (r: VRankDef): string => rankConditionsText(t.value, r.conditions, locale.code);

function go(url: string) {
  navTo(url);
}

// ─── styles ───
// Soft tint only — pills carry no border (chip/pill whitelist rule).
const howEntryStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "34px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};

// De-carded hero: no surface/border/glow — content sits directly on the page
// floor with a 2px optical inset (leaderboard.vue prize-hero idiom).
const heroStyle: CSSProperties = { padding: "10px 2px 0" };
const unavailableStyle: CSSProperties = {
  padding: "18px",
  background: "var(--v5-surface)",
  textAlign: "center",
};
// -2px side margins pull the hairline back to full width (hero has a 2px optical inset).
const heroCapStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  letterSpacing: "0.06em",
};
const heroRankStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  letterSpacing: "-0.018em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
// Form b container — no border (fill is the single visual difference);
// overflow-hidden stays: the tinted current row must clip to the radius.
const ladderCardStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "var(--nx-glass-radius)", marginTop: "12px" };
function rowStyle(status: "done" | "current" | "locked", isLast: boolean): CSSProperties {
  return {
    padding: "14px 16px",
    gap: "12px",
    background: status === "current" ? "color-mix(in srgb, var(--v5-brand) 4%, transparent)" : "transparent",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
// SKILL leading-tight = 1.25 (原版 .font-display text-[15px] leading-tight; was 1.1)
const rowTitleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, lineHeight: 1.25, color: "var(--v5-ink)" };
const currentTagStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-brand)",
  letterSpacing: "0.06em",
};
// SKILL leading-snug = 1.375 (原版 .mt-1.5 text-[12px] leading-snug; was 1.45)

function benefitText(r: VRankDef): string {
  const items = [`${t.value.rank.chips.direct} ${formatHowNumber(r.directBonus * 100, locale.code)}%`];
  if (r.unilevelDepth > 0) items.push(fmt(t.value.rank.networkDepth, { n: r.unilevelDepth }));
  if (r.leadershipVotes > 0) items.push(`${t.value.rank.chips.pool} ${r.leadershipVotes} ${t.value.rank.chips.votes}`);
  if (r.peerBonus > 0) items.push(vState.capabilities.peer
    ? `${t.value.rank.chips.peer} ${formatHowNumber(r.peerBonus * 100, locale.code)}%`
    : fmt(t.value.rank.chips.peerNotDispatched, { n: formatHowNumber(r.peerBonus * 100, locale.code) }));
  return items.join(" · ");
}

</script>

<style scoped>
.rank-row-heading { gap: 8px; flex-wrap: wrap; min-height: 44px; cursor: pointer; }
.rank-row-heading:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; border-radius: 6px; }
.rank-row-chevron { margin-left: auto; color: var(--v5-ink-3); transition: transform 180ms ease; }
.rank-row-chevron--open { transform: rotate(180deg); }
.rank-progress-track { height: 5px; margin: 7px 0; background: var(--v5-surface-3); border-radius: 99px; overflow: hidden; }
.rank-progress-track > view { height: 100%; background: var(--v5-brand); border-radius: inherit; }
@media (prefers-reduced-motion: reduce) { .rank-row-chevron { transition: none; } }
.rank-detail { margin-top: 10px; display: flex; flex-direction: column; gap: 3px; font-size: 13px; line-height: 1.6; color: var(--v5-ink-2); overflow-wrap: anywhere; }
.rank-detail__label { font-weight: 600; color: var(--v5-ink-3); }
.rank-detail__hint { color: var(--v5-ink-3); }
.rank-next-progress { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--v5-border); font-size: 12px; line-height: 1.7; color: var(--v5-ink-3); }

/* 规则介绍 pill 现在进得了 Tab 序(role+tabindex),没有这条外环键盘用户看不出
   焦点停在哪 —— 药丸自带 border-radius:999px,默认 outline 贴圆角会被裁。 */
.nx-rank-how-link:focus-visible {
  outline: 2px solid var(--v5-brand-2);
  outline-offset: 2px;
  border-radius: 999px;
}
</style>
