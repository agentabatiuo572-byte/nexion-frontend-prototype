<!--
  V Rank — ported from Nexion-prototype/app/(main)/team/rank/page.tsx.
  My-status block de-carded (DECARD form c): cap + VBadgeIcon 48 + progress bar
  w/ scroll-grow + missing list + upgrade CTA sit directly on the page floor,
  hairline splits the progress zone. 13-rank ladder = single surface container
  (form b, no border), rows hairlined, current row tinted. Sub-page →
  <AppChassis active="team"> w/ in-page back → /team.
  Reuses v-rank store + nextRankProgress + canonical ladder + useScrollGrowProgress (P-019
  $el-safe). useMemo → computed. lucide → inline <svg>. <Link>→<view @click>.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="rankTitleText" />

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
                <text class="block" :style="heroSubStyle">{{ heroSubText }}</text>
              </view>
            </view>

            <view v-if="prog.next" :style="progressWrapStyle">
              <text class="block" style="font-size: 15px; font-weight: 600">{{ t.rank.next }} {{ rankLabel(prog.next.v, locale.code, rankDefs) }}</text>
              <view v-for="condition in nextConditions" :key="condition.key" :style="condStyle">
                <text class="block">{{ condition.label }} · {{ t.rank.progressLabel }} {{ condition.values }}</text>
                <text class="block" style="margin-top: 3px; color: var(--v5-ink-2)">{{ condition.gap }}</text>
              </view>
              <view class="inline-flex items-center active:scale-[0.97] transition-transform" :style="upgradeCtaStyle" @click="go('/pages/store/store')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                <text>{{ t.rank.upgradeCta }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 13-rank ladder — single surface container (form b): outer border
             dropped, the fill is the single visual difference; rows hairlined. -->
        <view v-if="rankAvailable" class="nx-glass-card rounded-2xl overflow-hidden" :style="ladderCardStyle">
          <view
            v-for="(r, idx) in rankDefs"
            :key="r.v"
            class="flex items-start"
            :style="rowStyle(rowStatus(r.v), idx === rankDefs.length - 1)"
          >
            <VBadgeIcon :v="r.v" :size="36" />
            <view class="flex-1 min-w-0">
              <view class="flex items-center" style="gap: 8px; flex-wrap: wrap">
                <text class="font-display" :style="rowTitleStyle">{{ rankLabel(r.v, locale.code, rankDefs) }}</text>
                <view v-if="rowStatus(r.v) === 'done'" class="flex items-center" style="gap: 2px">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <text :style="{ fontSize: '12px', color: 'var(--v5-brand)', fontWeight: 500 }">{{ t.rank.done }}</text>
                </view>
                <text v-else-if="rowStatus(r.v) === 'current'" class="font-mono-tabular" :style="currentTagStyle">{{ t.rank.current }}</text>
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
import { navTo } from "@/lib/route";
import { nexGridBrandText } from "@/lib/brand-copy";
import { isEntitlementVRankReward, rankEntitlementLabel } from "@/lib/rank-entitlement-label";
import { computed, onMounted, type CSSProperties } from "vue";
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
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const t = useT();
// 中文界面显示中文头衔(主人 2026-08-17 拍板:V3 = 舰长),拼法收在 lib/v-rank-copy
const locale = useLocaleStore();
const vState = useVRank();
const { elRef: rankBarRef, inView: rankBarInView } = useScrollGrowProgress();

const myRank = computed(() => vState.myRank);
const rankDefs = computed(() => vState.ladder);
// 标题优先用服务端 prizeName(运营可配);存量配置值仍是改名前的旧品牌,
// 渲染层归一后再上屏,取不到才回退到三语 pageTitle(BUG 31)。
const rankTitleText = computed(() => nexGridBrandText(vState.prizeName) || t.value.rank.pageTitle);
const rankAvailable = computed(() => !remoteApiEnabled || vState.remoteReady);
const currentDef = computed(() => rankDefs.value[vState.myRank] ?? {
  v: vState.myRank, title: "", cnTitle: "", conditions: {}, directBonus: 0,
  unilevelDepth: 0, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [],
});
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
const nextConditions = computed(() => {
  const next = prog.value.next;
  if (!next) return [];
  const rows: { key: string; label: string; values: string; gap: string }[] = [];
  // The server evaluates every preceding tier, even when rank protection retains
  // the current rank after a refund. Keep each threshold tied to its source tier.
  for (const rank of rankDefs.value.filter((r) => r.v > 0 && r.v <= next.v)) {
    const c = rank.conditions;
    const preview = nextRankProgress({ ...previewData.value, myRank: (rank.v - 1) as VRank }, rankDefs.value);
    const add = (conditions: VRankConditions, current: number, required: number, kind: RankGap["kind"], vLevel?: number) => {
      const gap = preview.missing.find((item) => item.kind === kind
        && (item.kind !== "vDownlines" || item.vLevel === vLevel));
      const unit = kind === "selfBuy" || kind === "teamVolume" ? "$" : "";
      rows.push({
        key: `${rank.v}-${kind}-${vLevel ?? ""}`,
        label: `V${rank.v} · ${rankConditionsText(t.value, conditions, locale.code)}`,
        values: `${unit}${formatHowNumber(current, locale.code)} / ${unit}${formatHowNumber(required, locale.code)}`,
        gap: gap ? rankGapText(t.value, gap, locale.code, rankDefs.value) : t.value.rank.done,
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

const heroSubText = computed(() => {
  const d = currentDef.value;
  // 三语:词典里 teamV3.directBonus / teamV3.extendedRoyalty 早就有(此前是死键,这里原本拼英文)
  const head = `${t.value.teamV3.directBonus} ${Math.round(d.directBonus * 100)}%`;
  return d.unilevelDepth > 1 ? `${head} · ${t.value.teamV3.extendedRoyalty}` : head;
});

function rowStatus(v: VRank): "done" | "current" | "locked" {
  return v < vState.myRank ? "done" : v === vState.myRank ? "current" : "locked";
}

function nonNexRewards(rank: VRankDef): VRankReward[] {
  return rank.rewards.filter((reward) => reward.type !== "NEX");
}

function rewardText(reward: VRankReward): string {
  if (isEntitlementVRankReward(reward)) return rankEntitlementLabel(reward, t.value.rank.rewardUnavailable);
  return `${reward.amount.toLocaleString()} ${reward.type}`;
}

// 三语:词典里 rank.cond.* 五条早就有(此前是死键,这里原本拼英文)
const formatConditions = (r: VRankDef): string => rankConditionsText(t.value, r.conditions);

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
const progressWrapStyle: CSSProperties = { margin: "16px -2px 0", padding: "12px 2px 0", borderTop: "1px solid var(--v5-border)" };
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
const heroSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px" };

const barTrackStyle: CSSProperties = { height: "8px", background: "color-mix(in srgb, var(--v5-surface-2) 70%, transparent)" };
const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  background: "linear-gradient(to right, var(--v5-tech-cyan), var(--v5-brand))",
  width: `${rankBarInView.value ? prog.value.progressPct * 100 : 0}%`,
  transition: rankBarInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));

const upgradeCtaStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  height: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};

// Form b container — no border (fill is the single visual difference);
// overflow-hidden stays: the tinted current row must clip to the radius.
const ladderCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)", background: "var(--nx-glass-fill)", borderRadius: "var(--nx-glass-radius)", marginTop: "12px" };
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
const condStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 };

function chipStyle(kind: "default" | "purple" | "lemon" | "muted"): CSSProperties {
  const map = {
    default: { background: "color-mix(in srgb, var(--v5-surface-2) 60%, transparent)", color: "var(--v5-ink-3)" },
    // 未开放的权益用更弱的视觉:它仍是信息(该等级配置了比例),但不是可获得的承诺。
    muted: { background: "color-mix(in srgb, var(--v5-surface-2) 40%, transparent)", color: "var(--v5-ink-4)", textDecoration: "line-through" },
    purple: { background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)", color: "var(--v5-brand-2)" },
    lemon: { background: "color-mix(in srgb, var(--v5-brand) 12%, transparent)", color: "var(--v5-brand)" },
  } as const;
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: "4px",
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    letterSpacing: "0.02em",
    ...map[kind],
  };
}


</script>

<style scoped>
/* 规则介绍 pill 现在进得了 Tab 序(role+tabindex),没有这条外环键盘用户看不出
   焦点停在哪 —— 药丸自带 border-radius:999px,默认 outline 贴圆角会被裁。 */
.nx-rank-how-link:focus-visible {
  outline: 2px solid var(--v5-brand-2);
  outline-offset: 2px;
  border-radius: 999px;
}
</style>
