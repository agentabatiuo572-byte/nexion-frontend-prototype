<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.unilevel.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <view v-if="remoteApiEnabled && (network.remoteStatus === 'error' || remoteState === 'error')" :style="errorStateStyle">
          <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          <view role="button" tabindex="0" :style="retryStyle" @click="retryRemote"><text>{{ t.network.retry }}</text></view>
        </view>
        <view v-if="remoteApiEnabled && remoteState !== 'ready' && remoteState !== 'error'" class="text-center" style="padding: 24px 20px">
          <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
        </view>
        <!-- Hero — de-carded: royalty total sits directly on the page floor
             (bordered card + page-floor radial glow deleted outright, owner
             call 2026-07-08). Rules-intro pill sits on the section-title row
             (owner 2026-07-09: kill the empty gap above 本月版税). -->
        <view v-if="!remoteApiEnabled || remoteState === 'ready'" :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <text class="font-mono-tabular" :style="heroCapStyle">{{ t.unilevel.heroLabel }}</text>
            <view class="nx-unilevel-how-link inline-flex items-center shrink-0 active:scale-[0.98]" :style="howEntryStyle" @click="go('/pages/team/unilevel-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.unilevel.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <text class="block font-display tabular-nums" :style="heroBigStyle">{{ remoteApiEnabled ? `$${remoteTotalUSDT.toFixed(2)}` : `$${totalRoyalty.toFixed(2)}` }}</text>
        </view>

        <view v-if="remoteApiEnabled && remoteState === 'ready'" :style="remoteBreakdownStyle">
          <view class="flex items-start" style="gap: 12px">
            <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand)')">D</text>
            <view class="flex-1 min-w-0">
              <text class="block" :style="compTitleStyle">{{ t.unilevel.directLabel }}</text>
              <text class="block" :style="compSubStyle">{{ remoteDirect.count }} {{ t.commissions.events }}</text>
            </view>
            <text class="font-display tabular-nums" :style="remoteAmountStyle">${{ remoteDirect.amountUSDT.toFixed(2) }}</text>
          </view>
          <view class="flex items-start" style="gap: 12px; margin-top: 14px">
            <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand-2)')">N</text>
            <view class="flex-1 min-w-0">
              <text class="block" :style="compTitleStyle">{{ t.unilevel.networkLabel }}</text>
              <text class="block" :style="compSubStyle">{{ remoteExtended.count }} {{ t.commissions.events }}</text>
            </view>
            <text class="font-display tabular-nums" :style="remoteAmountStyle">${{ remoteExtended.amountUSDT.toFixed(2) }}</text>
          </view>
          <text class="block font-mono-tabular" :style="remoteSplitNoteStyle">+{{ remoteTotalNEX.toLocaleString() }} NEX · {{ remoteSnapshot?.period }}</text>
        </view>

        <!-- Royalty breakdown — Direct (D) + Network (N): one frosted-glass
             card each (owner 2026-07-09; chassis glass-tile tokens); colored
             badge chips + values carry the semantic identity. -->
        <view v-if="!remoteApiEnabled" class="flex items-start" style="gap: 12px" :style="glassCardStyle">
          <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand)')">D</text>
          <view class="flex-1 min-w-0">
            <text class="block" :style="compTitleStyle">{{ t.unilevel.directLabel }}</text>
          </view>
          <view class="text-right shrink-0">
            <text class="block font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand)' }">${{ directRoyalty.toFixed(2) }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ directMembersText }}</text>
          </view>
        </view>
        <view v-if="!remoteApiEnabled" :style="glassCardStyle">
          <text class="block" :style="compTitleStyle">{{ t.unilevel.networkLabel }}</text>
          <text class="block font-display tabular-nums" :style="remoteAmountStyle">${{ networkBonus.toFixed(2) }}</text>
        </view>

        <!-- Filter pills — opens the member-list section, extra top break. -->
        <scroll-view scroll-x class="nx-no-scrollbar" style="white-space: nowrap; width: 100%; margin-top: 6px">
          <view class="inline-flex" style="gap: 6px">
            <view class="nx-unilevel-filter-all shrink-0 inline-flex items-center active:opacity-70" :style="pillStyle(filter === 'all')" @click="filter = 'all'">
              <text :style="pillTextStyle(filter === 'all')">{{ t.unilevel.filterAll }}</text>
              <text class="font-mono-tabular" :style="pillCountStyle(filter === 'all')">· {{ directMembers.length + extendedMembers.length }}</text>
            </view>
            <view class="nx-unilevel-filter-direct shrink-0 inline-flex items-center active:opacity-70" :style="pillStyle(filter === 'direct')" @click="filter = 'direct'">
              <view v-if="filter !== 'direct'" class="rounded-full" :style="{ width: '6px', height: '6px', background: 'var(--v5-brand)' }" />
              <text :style="pillTextStyle(filter === 'direct')">{{ t.unilevel.filterDirect }}</text>
              <text class="font-mono-tabular" :style="pillCountStyle(filter === 'direct')">· {{ directMembers.length }}</text>
            </view>
            <view class="nx-unilevel-filter-extended shrink-0 inline-flex items-center active:opacity-70" :style="pillStyle(filter === 'extended')" @click="filter = 'extended'">
              <view v-if="filter !== 'extended'" class="rounded-full" :style="{ width: '6px', height: '6px', background: 'var(--v5-tech-cyan)' }" />
              <text :style="pillTextStyle(filter === 'extended')">{{ t.unilevel.filterExtended }}</text>
              <text class="font-mono-tabular" :style="pillCountStyle(filter === 'extended')">· {{ extendedMembers.length }}</text>
            </view>
          </view>
        </scroll-view>

        <!-- Member list — de-carded: transparent hairline group (leaderboard
             rest-list idiom); the surface + border shell was redundant
             boundary weight around already hairline-separated rows. -->
        <view v-if="remoteApiEnabled && remoteState === 'ready'" :style="memberGroupStyle">
          <view v-for="(event, i) in (remoteSnapshot?.events ?? [])" :key="event.id" class="flex items-center" :style="memberRowStyle(i === (remoteSnapshot?.events.length ?? 0) - 1)">
            <view class="rounded-full grid place-items-center shrink-0" :style="memberAvatarStyle"><text style="font-size: 15px">↗</text></view>
            <view class="flex-1 min-w-0">
              <text class="block truncate" :style="{ fontSize: '13px', fontWeight: 500, color: 'var(--v5-ink)' }">{{ event.sourceUserName }}</text>
              <text class="block font-mono-tabular" :style="{ marginTop: '2px', fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ event.cycle }} · {{ event.currency }}</text>
            </view>
            <view class="text-right"><text class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">+${{ event.amountUSDT.toFixed(2) }}</text><text v-if="event.amountNEX > 0" class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-brand-2)' }">+{{ event.amountNEX.toLocaleString() }} NEX</text></view>
          </view>
          <EmptyState v-if="(remoteSnapshot?.events.length ?? 0) === 0" kind="empty-list" :title="t.empty.commissionsTitle" :desc="t.empty.commissionsDesc" />
        </view>
        <view v-else :style="memberGroupStyle">
          <EmptyState v-if="filteredMembers.length === 0" kind="no-filter-results" :title="t.empty.filterTitle" :desc="t.empty.filterDesc" compact />
          <template v-else>
            <view
              v-for="(m, i) in visibleMembers"
              :key="m.id"
              class="nx-unilevel-member-row flex items-center"
              :style="memberRowStyle(i === visibleMembers.length - 1)"
            >
              <view class="rounded-full grid place-items-center shrink-0" :style="memberAvatarStyle">
                <text style="font-size: 20px; line-height: 1">{{ m.avatar }}</text>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontSize: '13px', fontWeight: 500, color: 'var(--v5-ink)' }">{{ m.name }}</text>
                  <VBadge :v="m.vRank" size="sm" :show-title="false" />
                </view>
                <view class="flex items-center" style="margin-top: 2px; gap: 6px">
                  <view class="rounded-full" :style="{ width: '6px', height: '6px', background: statusColor(m.status) }" />
                  <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ m.status }} · {{ m.city }}</text>
                  <text class="font-mono-tabular" :style="memberBadgeStyle(m.kind)">{{ m.kind === "direct" ? t.unilevel.memberBadgeDirect : t.unilevel.memberBadgeExtended }}</text>
                </view>
              </view>
              <view class="text-right">
                <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">{{ remoteApiEnabled ? fmt(t.uiChrome.volumeShort, { amount: `$${m.monthVolumeUSD}` }) : `+$${memberCommission(m).toFixed(2)}` }}</text>
              </view>
            </view>
            <!-- View more — explicit user click (leaderboard idiom), 44px ghost. -->
            <view v-if="hasMoreMembers" class="nx-unilevel-load-more flex items-center justify-center active:opacity-70" :style="loadMoreBtnStyle" @click="loadMoreMembers">
              <text :style="loadMoreLabelStyle">{{ t.unilevel.loadMore }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </view>
          </template>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember, type MemberStatus } from "@/store/network";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamUnilevelSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { UNILEVEL_USDT } from "@/store/commission";

type FilterId = "all" | "direct" | "extended";
type PlottedMember = NetworkMember & { kind: "direct" | "extended" };

const t = useT();
const app = useApp();
const network = useNetwork();
const remoteSnapshot = ref<TeamUnilevelSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
onMounted(() => { if (remoteApiEnabled) { void network.refreshCanonicalNetwork(); void loadRemote(); } });
onShow(() => { if (remoteApiEnabled) void loadRemote(); });
watch(() => app.accountKey, () => {
  if (!remoteApiEnabled) return;
  remoteSnapshot.value = null;
  void loadRemote();
});
async function loadRemote() {
  if (!remoteApiEnabled) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  remoteState.value = "loading";
  try {
    const snapshot = await teamInsightsApi.unilevel("month");
    if (request !== remoteRequest || accountKey !== app.accountKey) return;
    remoteSnapshot.value = snapshot;
    remoteState.value = "ready";
  } catch {
    if (request !== remoteRequest || accountKey !== app.accountKey) return;
    remoteSnapshot.value = null;
    remoteState.value = "error";
  }
}
function retryRemote() { void Promise.all([network.refreshCanonicalNetwork(), loadRemote()]); }
const filter = ref<FilterId>("all");

const byLayer = computed(() => network.byLayer());
const directMembers = computed(() => byLayer.value[1] ?? []);
const extendedMembers = computed(() =>
  ([2, 3, 4, 5, 6, 7] as const).flatMap((L) => byLayer.value[L] ?? []),
);

const directVolume = computed(() => directMembers.value.reduce((s, m) => s + m.monthVolumeUSD, 0));
const directRoyalty = computed(() => directVolume.value * UNILEVEL_USDT[1]);
const networkBonus = computed(() =>
  extendedMembers.value.reduce((sum, m) => sum + m.monthVolumeUSD * (UNILEVEL_USDT[m.layer] ?? 0), 0),
);
const totalRoyalty = computed(() => directRoyalty.value + networkBonus.value);
const remoteDirect = computed(() => remoteSnapshot.value?.split.direct ?? { amountUSDT: 0, amountNEX: 0, count: 0 });
const remoteExtended = computed(() => remoteSnapshot.value?.split.extended ?? { amountUSDT: 0, amountNEX: 0, count: 0 });
const remoteTotalUSDT = computed(() => remoteDirect.value.amountUSDT + remoteExtended.value.amountUSDT);
const remoteTotalNEX = computed(() => remoteDirect.value.amountNEX + remoteExtended.value.amountNEX);

const filteredMembers = computed<PlottedMember[]>(() => {
  if (filter.value === "all") {
    return [
      ...directMembers.value.map((m) => ({ ...m, kind: "direct" as const })),
      ...extendedMembers.value.map((m) => ({ ...m, kind: "extended" as const })),
    ];
  }
  if (filter.value === "direct") return directMembers.value.map((m) => ({ ...m, kind: "direct" as const }));
  return extendedMembers.value.map((m) => ({ ...m, kind: "extended" as const }));
});

// Paginated load-more (leaderboard rest-list idiom): one screen per page,
// explicit "View more" click. Resets to page 1 when the filter changes.
const PAGE_SIZE = 20;
const visibleCount = ref(PAGE_SIZE);
watch(filter, () => { visibleCount.value = PAGE_SIZE; });
const visibleMembers = computed(() => filteredMembers.value.slice(0, visibleCount.value));
const hasMoreMembers = computed(() => visibleCount.value < filteredMembers.value.length);
function loadMoreMembers() {
  visibleCount.value = Math.min(filteredMembers.value.length, visibleCount.value + PAGE_SIZE);
}

// i18n text
const directMembersText = computed(() => fmt(t.value.unilevel.directMembersText, { n: directMembers.value.length }));
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}
function memberCommission(m: PlottedMember): number {
  return m.monthVolumeUSD * (UNILEVEL_USDT[m.layer] ?? 0);
}

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}

// ─── styles ───
// Pill chip on the title row: compact (34px) so it doesn't dominate the
// section-title line; soft tint only, no border (chip whitelist).
const howEntryStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  minHeight: "44px",  // 《07》tap≥44(原 34)
  height: "34px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};

// De-carded hero: no surface/border/glow — content sits directly on the page
// floor (page-floor auras are deleted outright per owner call, not re-tuned).
const heroStyle: CSSProperties = { padding: "6px 2px 0" };
const errorStateStyle: CSSProperties = { padding: "14px", borderRadius: "14px", background: "var(--v5-warning-soft)", color: "var(--v5-ink)" };
const retryStyle: CSSProperties = { marginTop: "10px", minHeight: "44px", display: "grid", placeItems: "center", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink-2)" };
const remoteBreakdownStyle: CSSProperties = { padding: "16px", borderRadius: "16px", background: "var(--v5-glass-bg)", backdropFilter: "blur(18px) saturate(180%)" };
const remoteAmountStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, color: "var(--v5-brand)" };
const remoteSplitNoteStyle: CSSProperties = { marginTop: "14px", fontSize: "12px", color: "var(--v5-ink-3)" };
const heroCapStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "var(--v5-brand)", letterSpacing: "0.06em" };
const heroBigStyle: CSSProperties = { marginTop: "8px", fontSize: "34px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--v5-ink)" };
// Frosted-glass card shell (owner 2026-07-09) shared by the D / N / tier
// sections — theme-aware chassis glass-tile tokens; blur strength matches
// the genesis dock glass (Vue auto-prefixes backdropFilter inline).
// Fill only, zero border: bg-filled cards carry no border line (owner ruling
// 2026-07-09, same day).
const glassCardStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "16px",
  background: "var(--v5-glass-bg)",
  backdropFilter: "blur(18px) saturate(180%)",
};
function compBadgeStyle(color: string): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    background: `color-mix(in srgb, ${color} 22%, transparent)`,
    color,
    fontSize: "20px",
    fontWeight: 600,
  };
}
const compTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const compSubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 }; // SKILL: leading-snug=1.375 (was 1.45)
function pillStyle(active: boolean): CSSProperties {
  return {
    height: "44px",
    padding: "0 16px",
    gap: "6px",
    borderRadius: "999px",
    // 未选中态原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: active ? "var(--v5-brand)" : "var(--v5-surface)",
  };
}
function pillTextStyle(active: boolean): CSSProperties {
  return { fontSize: "12px", fontWeight: 600, color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)" };
}
function pillCountStyle(active: boolean): CSSProperties {
  return { fontSize: "12px", opacity: 0.65, color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)" };
}

// Transparent hairline group — border-top opener + 2px optical inset;
// rows sit on the page floor, content aligned to the 16px gutter.
const memberGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function memberRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", gap: "12px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
// 头像框坐在透明发丝线组里(直接贴页面底),原 surface-2 同色不可辨,改 L1 surface。
const memberAvatarStyle: CSSProperties = { width: "36px", height: "36px", background: "var(--v5-surface)" };
// Ghost "View more" affordance — 44px tap target, boxed chrome dropped.
const loadMoreBtnStyle: CSSProperties = { gap: "6px", height: "44px", marginTop: "2px" };
const loadMoreLabelStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-ink-3)" };
function memberBadgeStyle(kind: "direct" | "extended"): CSSProperties {
  const color = kind === "direct" ? "var(--v5-brand)" : "var(--v5-tech-cyan)";
  return {
    marginLeft: "auto",
    padding: "0 4px",
    borderRadius: "4px",
    fontSize: "12px",
    letterSpacing: "0.04em",
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
  };
}
</script>
