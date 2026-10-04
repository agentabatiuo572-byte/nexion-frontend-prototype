<!--
  Commissions — ported from Nexion-prototype/app/(main)/team/commissions/page.tsx.
  5+1-kind commission event stream: overview hero (de-carded, floor-sitting) →
  6-kind summary tiles (tap to filter) → filter pills → event list (transparent
  hairline group). Sub-page → <AppChassis active="team"> with
  in-page back row (back → /team). Reuses commission store. mount-effect
  unlockMatured → onMounted. lucide kind icons → inline SVG. <button>→<view @click>.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamCommissions" :subtitle="t.headerSubtitles.teamCommissions" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <EmptyState
          v-if="remoteApiEnabled && commission.eventsStatus !== 'ready'"
          :kind="commission.eventsStatus === 'error' ? 'recoverable-error' : 'empty-list'"
          :title="commission.eventsStatus === 'error' ? t.network.projectionErrorTitle : t.network.projectionLoadingTitle"
          :desc="commission.eventsStatus === 'error' ? t.network.projectionErrorDesc : undefined"
          :cta-label="commission.eventsStatus === 'error' ? t.network.retry : undefined"
          compact
          @cta="commission.refreshCanonicalEvents()"
        />
        <template v-if="!remoteApiEnabled || commission.eventsStatus === 'ready'">
        <!-- overview — de-carded: the two headline numbers sit on the page floor.
             Dual-number hero (Withdrawable/Cooling grid) has no single cap to host
             the rules-intro pill, so the pill rides a tight top-right row hugging
             the grid (owner 2026-07-09: kill the empty gap above the hero). -->
        <view :style="heroWrapStyle">
          <!-- rules-intro pill hugs the top-right; 4px above the grid so no empty gap. -->
          <view class="flex items-center justify-end" style="margin-bottom: 4px">
            <view class="nx-commissions-focusable inline-flex items-center shrink-0 active:scale-[0.98]" :style="howItWorksStyle" role="link" tabindex="0" :aria-label="t.commissions.howItWorksEntry" @click="go('/pages/team/commissions-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.commissions.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <view class="grid grid-cols-2" style="gap: 12px">
            <view>
              <text class="block font-mono-tabular" :style="overviewCapStyle">{{ t.uiChrome.withdrawable }}</text>
              <text class="block tabular-nums" :style="overviewBigStyle('var(--v5-brand)')">${{ commission.unlockedUSDT().toFixed(2) }}</text>
              <text class="block font-mono-tabular" :style="overviewSmallStyle">{{ commission.unlockedNEX().toLocaleString() }} NEX</text>
            </view>
            <view>
              <text class="block font-mono-tabular" :style="overviewCapStyle">{{ t.commissions.cooling }}</text>
              <text class="block tabular-nums" :style="overviewBigStyle('var(--v5-warning)')">${{ commission.coolingUSDT().toFixed(2) }}</text>
              <text class="block font-mono-tabular" :style="overviewSmallStyle">{{ coolingOverviewText }}</text>
            </view>
          </view>
          <view class="grid grid-cols-2" :style="heroFooterStyle">
            <view class="flex items-center justify-between">
              <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.commissions.thisMonth }}</text>
              <text class="font-display tabular-nums" :style="{ fontWeight: 600 }">${{ commission.monthUSDT().toFixed(2) }}</text>
            </view>
            <view class="flex items-center justify-between">
              <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.commissions.lifetime }}</text>
              <text class="font-display tabular-nums" :style="{ fontWeight: 600 }">${{ commission.totalUSDTLifetime().toFixed(2) }}</text>
            </view>
          </view>
        </view>

        <!-- 6-kind summary。这些卡片与下方 pill 行驱动**同一个** filter,是互斥单选组;
             原先 role="button" + aria-pressed 被浏览器当 toggle button,读屏按复选框朗读
             (zentao #94)。改 radiogroup/radio + aria-checked + roving tabindex,与下方
             tablist 同为「选中即筛选」的语义,键盘行为一致。 -->
        <view class="grid grid-cols-3" style="gap: 8px" role="radiogroup" :aria-label="t.commissions.kindFilterLabel">
          <view
            v-for="(k, i) in KIND_ORDER"
            :key="k"
            class="nx-commissions-focusable text-left active:scale-[0.97]"
            :style="kindCardStyle(k)"
            role="radio"
            :tabindex="filter === k || (filter === 'all' && i === 0) ? 0 : -1"
            :aria-label="kindCardLabel(k)"
            :aria-checked="filter === k ? 'true' : 'false'"
            @click="filter = k"


             @keydown.enter.prevent="filter = k" @keydown.space.prevent="filter = k" @keydown.left.prevent="moveKindCard(i, -1)" @keydown.right.prevent="moveKindCard(i, 1)"
          >
            <text :style="{ color: KIND[k].color }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="KIND[k].color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in KIND[k].paths" :key="pi" :d="p" /></svg>
            </text>
            <text class="block tabular-nums" :style="kindAmtStyle">${{ byKind[k].usdt.toFixed(0) }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.kind[k] }}</text>
            <text class="block font-mono-tabular" :style="kindCountStyle">{{ byKind[k].count }} {{ t.commissions.events }}</text>
          </view>
        </view>

        <text v-if="remoteApiEnabled" class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.commissions.recentEventsHint, { n: events.length }) }}</text>

        <!-- filter pills -->
        <GlassSegments :label="t.commissions.pageTitle" v-model="filter" :options="filterOptions" layout="scroll"  />

        <!-- event list — transparent hairline group on the page floor -->
        <EmptyState v-if="filtered.length === 0" :kind="filter === 'all' ? 'empty-list' : 'no-filter-results'" :title="filter === 'all' ? t.empty.commissionsTitle : t.empty.filterTitle" :desc="filter === 'all' ? t.empty.commissionsDesc : t.empty.filterDesc" />
        <view v-else :style="listGroupStyle">
            <view
              v-for="(e, i) in filtered"
              :key="e.id"
              class="flex items-center"
              :style="eventRowStyle(i === filtered.length - 1)"
            >
              <view class="grid place-items-center shrink-0" :style="eventIconStyle(e.kind)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="KIND[e.kind].color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in KIND[e.kind].paths" :key="pi" :d="p" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontSize: '13px', color: 'var(--v5-ink)' }">{{ e.sourceUserName }}</text>
                  <text v-if="e.layer" class="font-mono-tabular" :style="e.layer === 1 ? directBadgeStyle : extendedBadgeStyle">{{ e.layer === 1 ? t.commissions.directBadge : t.commissions.extendedBadge }}</text>
                </view>
                <text class="block font-mono-tabular" :style="eventMetaStyle">{{ eventMeta(e) }}</text>
              </view>
              <view class="text-right">
                <text v-if="e.amountUSDT > 0" class="block font-mono-tabular tabular-nums" :style="commissionAmountStyle(e, 'usdt')">{{ commissionAmountLabel(e) }}</text>
                <text v-if="e.amountNEX > 0" class="block font-mono-tabular tabular-nums" :style="commissionAmountStyle(e, 'nex')">{{ commissionNexLabel(e) }}</text>
                <text v-if="e.status === 'cooling'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-warning)', marginTop: '2px' }">{{ coolingTag(e) }}</text>
                <text v-else-if="e.status === 'unlocked'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-success)', marginTop: '2px' }">{{ t.commissions.readyTag }}</text>
                <text v-else-if="e.status === 'withdrawn'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.withdrawnTag }}</text>
                <text v-else-if="e.status === 'frozen'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-tech-cyan)', marginTop: '2px' }">{{ t.commissions.frozenTag }}</text>
                <text v-else-if="e.status === 'reversed'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-4)', marginTop: '2px' }">{{ t.commissions.reversedTag }}</text>
                <text v-else-if="e.status === 'rejected'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-danger)', marginTop: '2px' }">{{ t.commissions.rejectedTag }}</text>
              </view>
            </view>
            <view
              v-if="remoteApiEnabled && commission.events.length < commission.eventsTotalRows"
              class="flex items-center justify-center active:opacity-70"
              :style="loadMoreStyle"
              role="button"
              tabindex="0"
              :aria-disabled="commission.eventsLoadMoreStatus === 'loading'"
              @click="commission.loadMoreCanonicalEvents()"
              @keydown="activateLoadMore"
            >
              <text>{{ commission.eventsLoadMoreStatus === "loading" ? "…" : commission.eventsLoadMoreStatus === "error" ? t.network.retry : t.unilevel.loadMore }}</text>
            </view>
        </view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { ref, computed, nextTick, onMounted, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useCommission, type CommissionEvent, type CommissionKind } from "@/store/commission";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const commission = useCommission();

type Filter = "all" | CommissionKind;
const filter = ref<Filter>("all");

const KIND_ORDER: CommissionKind[] = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];

interface KindSpec {
  color: string;
  paths: string[];
}
const KIND: Record<CommissionKind, KindSpec> = {
  unilevel: { color: "var(--v5-brand)", paths: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"] },
  binary: { color: "var(--v5-warning)", paths: ["M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"] },
  peer: { color: "var(--v5-tech-cyan)", paths: ["m11 17 2 2a1 1 0 1 0 3-3", "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4", "M21 3v9h-9"] },
  cultivation: { color: "var(--v5-success)", paths: ["M7 20h10", "M10 20c5.5-2.5.8-6.4 3-10", "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z", "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"] },
  leadership: { color: "var(--v5-tech-cyan)", paths: ["m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"] },
  genesis: { color: "var(--v5-brand-2)", paths: ["M6 3h12l4 6-10 13L2 9z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"] },
};

onMounted(() => {
  commission.unlockMatured();
});
onShow(() => { if (remoteApiEnabled) void commission.refreshCanonicalEvents(); });

const events = computed(() => commission.events);
const byKind = computed(() => commission.byKind());
const filtered = computed(() =>
  filter.value === "all" ? events.value : events.value.filter((e) => e.kind === filter.value),
);

const coolingOverviewText = computed(() => {
  if (remoteApiEnabled) {
    const next = commission.eventsEvidence?.aggregate.nextUnlockAt;
    return next == null ? "—" : fmt(t.value.commissions.coolingTag, { n: Math.max(0, Math.ceil((next - Date.now()) / 86400000)) });
  }
  const next = events.value
    .filter((event) => event.status === "cooling" && Number.isFinite(event.unlockAt))
    .sort((a, b) => a.unlockAt - b.unlockAt)[0];
  if (!next) return remoteApiEnabled ? "—" : t.value.commissions.unlocksIn30d;
  const days = Math.max(0, Math.ceil((next.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
});

const noKindText = computed(() =>
  fmt(t.value.commissions.noKindEvents, { kind: t.value.commissions.kind[filter.value as CommissionKind] }),
);

function eventMeta(e: CommissionEvent): string {
  const kindLabel = t.value.commissions.kind[e.kind];
  const order = e.orderAmountUSD ? ` · ${t.value.commissions.orderPrefix}${e.orderAmountUSD}` : "";
  const date = new Date(e.ts).toLocaleDateString(dateLocale());
  return `${kindLabel}${order} · ${date}`;
}
function coolingTag(e: CommissionEvent): string {
  const days = Math.max(0, Math.ceil((e.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
}

function commissionAmountLabel(e: CommissionEvent): string {
  const amount = `${e.amountUSDT.toFixed(2)}`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected") return amount;
  return `+${amount}`;
}

function commissionNexLabel(e: CommissionEvent): string {
  const amount = `${e.amountNEX.toLocaleString()} NEX`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected") return amount;
  return `+${amount}`;
}

function commissionAmountStyle(e: CommissionEvent, asset: "usdt" | "nex"): CSSProperties {
  const color = e.status === "rejected"
    ? "var(--v5-danger)"
    : e.status === "frozen"
      ? "var(--v5-tech-cyan)"
      : e.status === "reversed"
        ? "var(--v5-ink-4)"
        : asset === "usdt" ? "var(--v5-brand)" : "var(--v5-warning)";
  return { fontSize: asset === "usdt" ? "13px" : "12px", fontWeight: asset === "usdt" ? 600 : 400, color };
}

function go(url: string) {
  navTo(url);
}

// 6-kind summary cards double as filter controls: name them with the kind label
// + current amount/count so a screen reader hears what the tile selects.
function kindCardLabel(k: CommissionKind): string {
  return `${t.value.commissions.kind[k]} · ${byKind.value[k].usdt.toFixed(0)} · ${byKind.value[k].count} ${t.value.commissions.events}`;
}

// Filter pills are one roving-tabindex tablist (same idiom as leaderboard/unilevel):
// arrows move selection and the focus ring follows the newly selected tab.
const FILTER_ORDER: Filter[] = ["all", ...KIND_ORDER];
function moveFilter(delta: -1 | 1) {
  const currentIndex = FILTER_ORDER.indexOf(filter.value);
  filter.value = FILTER_ORDER[(currentIndex + delta + FILTER_ORDER.length) % FILTER_ORDER.length];
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(".nx-commissions-pill[tabindex='0']")?.focus();
  });
}

/**
 * 六张 kind 卡的左右方向键。
 *
 * 卡片与下方 pill 行驱动**同一个** filter,但它们是两个独立的单选组:卡组只有 6 个成员
 * (没有「全部」),所以方向键必须在**卡组内部**环转,不能复用 moveFilter —— 那会把选中项
 * 移到「全部」,而卡组里没有对应成员,焦点随即无处可去。
 *
 * 焦点目标按 tabindex 而不是 aria-checked 取:filter 为「全部」时卡组无成员被选中,
 * 此时可 Tab 进入的是第一张卡(tabindex=0),按 aria-checked 会取到 null 而丢失焦点。
 */
function moveKindCard(index: number, delta: -1 | 1) {
  const next = KIND_ORDER[(index + delta + KIND_ORDER.length) % KIND_ORDER.length];
  if (!next || next === filter.value) return;
  filter.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  });
}

function activateLoadMore(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  void commission.loadMoreCanonicalEvents();
}

// ─── styles ───
// Soft tint pill — chip idiom, fill only (no border, single visual difference).
const howItWorksStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "44px",  // 《07》tap≥44(原 34)
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
// De-carded overview hero — numbers on the page floor; hairline footer closes the block.
const heroWrapStyle: CSSProperties = { padding: "6px 2px 0" };
// -2px side margins pull the hairline back to full width (2px optical inset above).
const heroFooterStyle: CSSProperties = {
  margin: "12px -2px 0",
  padding: "12px 2px 0",
  borderTop: "1px solid var(--v5-border)",
  gap: "8px",
  fontSize: "12px",
};
const overviewCapStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
function overviewBigStyle(color: string): CSSProperties {
  return {
    marginTop: "4px",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "20px",
    letterSpacing: "-0.018em",
    color,
  };
}
const overviewSmallStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };

// Selection tiles — filled, no border/ring; active = soft kind tint (single difference).
function kindCardStyle(k: CommissionKind): CSSProperties {
  const active = filter.value === k;
  return {
    padding: "10px",
    borderRadius: "12px",
    background: active ? `color-mix(in srgb, ${KIND[k].color} 12%, transparent)` : "var(--v5-surface)",
  };
}
const kindAmtStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const kindCountStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};

function pillStyle(active: boolean, color: string): CSSProperties {
  return {
    height: "44px",
    padding: "0 16px",
    // 未选中态原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: active ? color : "var(--v5-surface)",
  };
}
// Bright active fill → on-brand text (brand-2 fill takes on-brand-2), incl. inactive fallback.
function pillTextStyle(active: boolean, color: string): CSSProperties {
  return {
    fontSize: "12px",
    fontWeight: 600,
    color: active
      ? color === "var(--v5-brand-2)"
        ? "var(--v5-on-brand-2)"
        : "var(--v5-on-brand)"
      : "var(--v5-ink-3)",
  };
}

// Empty state — dashed outline hint, no fill (V5 empty-state idiom).
const emptyStyle: CSSProperties = { borderRadius: "16px", border: "1px dashed var(--v5-border-strong)", padding: "32px", fontSize: "12px", color: "var(--v5-ink-3)" };
// Transparent hairline group — border-top opens the group, rows separate with hairlines.
const listGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const loadMoreStyle: CSSProperties = { minHeight: "44px", color: "var(--v5-ink-3)", fontSize: "13px" };
function eventRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "12px 0",
    gap: "12px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
function eventIconStyle(kind: CommissionKind): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "12px",
    background: `color-mix(in srgb, ${KIND[kind].color} 20%, transparent)`,
  };
}
const directBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
const extendedBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
const eventMetaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };

import GlassSegments from "@/components/glass-segments.vue";
const filterOptions = computed(() => [
  { value: "all", label: t.value.commissions.all, count: commission.events.length },
  ...KIND_ORDER.map(value => ({ value, label: t.value.commissions.kind[value], count: byKind.value[value].count })),
]);
</script>

<style scoped>
/* Keyboard focus must be visible on the self-drawn tiles/pills — they are
   focusable now (role+tabindex), and without this the focus ring is the
   browser default outline clipped by the scroll-view on the pill row. */
.nx-commissions-focusable:focus-visible,
.nx-commissions-pill:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
  border-radius: 12px;
}
</style>
