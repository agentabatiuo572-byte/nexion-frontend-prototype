<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.rank.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- My status — de-carded: sits directly on the page floor (card shell +
             in-card glow dropped; a glow on the page floor would be a floor aura,
             which gets deleted per owner call 2026-07-08). Rules-intro pill rides
             the cap row (owner 2026-07-09: kill the empty gap above the hero). -->
        <view :style="heroStyle">
          <view>
            <view class="flex items-center justify-between" style="gap: 8px">
              <text class="block" :style="heroCapStyle">{{ t.rank.currentRank }}</text>
              <view class="inline-flex items-center shrink-0 active:scale-[0.98] transition-transform" :style="howEntryStyle" @click="go('/pages/team/rank-how')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                <text>{{ t.rank.howItWorksEntry }}</text>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </view>
            </view>
            <view class="flex items-center" style="margin-top: 8px; gap: 12px">
              <VBadgeIcon :v="myRank" :size="48" />
              <view>
                <text class="block" :style="heroRankStyle">{{ rankLabel(myRank, isZh, rankDefs) }}</text>
              </view>
            </view>

          </view>
        </view>

        <!-- 13-rank ladder — single surface container (form b): outer border
             dropped, the fill is the single visual difference; rows hairlined. -->
        <view class="rounded-2xl overflow-hidden" :style="ladderCardStyle">
          <view
            v-for="(r, idx) in rankDefs"
            :key="r.v"
            class="flex items-start"
            :style="rowStyle(rowStatus(r.v), idx === rankDefs.length - 1)"
          >
            <VBadgeIcon :v="r.v" :size="36" />
            <view class="flex-1 min-w-0">
              <view class="flex items-center" style="gap: 8px; flex-wrap: wrap">
                <text class="font-display" :style="rowTitleStyle">{{ rankLabel(r.v, isZh, rankDefs) }}</text>
                <view v-if="rowStatus(r.v) === 'done'" class="flex items-center" style="gap: 2px">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <text :style="{ fontSize: '12px', color: 'var(--v5-brand)', fontWeight: 500 }">{{ t.rank.done }}</text>
                </view>
                <text v-else-if="rowStatus(r.v) === 'current'" class="font-mono-tabular" :style="currentTagStyle">{{ t.rank.current }}</text>
              </view>

            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { useVRank, type VRank } from "@/store/v-rank";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
// 中文界面显示中文头衔(主人 2026-08-17 拍板:V3 = 舰长),拼法收在 lib/v-rank-copy
const isZh = computed(() => useLocaleStore().code === "zh");
const vState = useVRank();

const myRank = computed(() => vState.myRank);
const rankDefs = computed(() => vState.ladder);
onMounted(() => {
  // Local rank data is not used in remote mode; the ladder and member progress arrive together.
  if (remoteApiEnabled) void vState.refreshCanonicalVRank();
});

function rowStatus(v: VRank): "done" | "current" | "locked" {
  return v < vState.myRank ? "done" : v === vState.myRank ? "current" : "locked";
}

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
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
const ladderCardStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "16px", marginTop: "12px" };
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
</script>
