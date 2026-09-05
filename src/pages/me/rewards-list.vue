<!--
  My Rewards L2 (分类记录页) — /me/rewards/list?cat=voucher|usdt|nex, reached
  from the L1 category summary (pages/me/rewards.vue).

  cat=voucher → claimed-unused voucher cards ("Use" routes per scope: single
  SKU → device detail, multi/all → mall) + expired section grayed. Catalog-
  scale data → no pagination (deliberate N/A).
  cat=usdt / nex → reward-family credits for that symbol (bills.ts
  isRewardBill, single source shared with L1 totals and the Me-entry dot),
  newest first, paginated one screen (10 rows) per load via the receipts-page
  sentinel mechanism (auto-loads when the tail sentinel scrolls into view).
  Unknown / missing cat falls back to voucher (spec ② exception 4).

  Backend-replaceable: vouchers GET /api/me/vouchers; records
  GET /api/me/bills?type=reward&symbol=USDT|NEX&cursor=&limit=10 (server-side
  cursor pagination; the mock slices the local ledger). Wrapped in <AppChassis>.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink); padding-bottom: 24px">
      <SubPageHeader back="/pages/me/rewards" :title="pageTitle" />

      <!-- ── Vouchers (ticket-style cards: value stub + perforation + body) ── -->
      <template v-if="cat === 'voucher'">
        <!-- Empty -->
        <EmptyState v-if="available.length === 0 && expired.length === 0" kind="empty-list" :title="t.empty.rewardsTitle" :desc="t.empty.rewardsDesc" />

        <template v-else>
          <view v-if="available.length > 0">
            <text class="block" :style="secHead(true)">{{ t.rewards.secAvailable }}</text>
            <view v-for="v in available" :key="v.id" class="flex items-stretch" :style="ticketStyle">
              <view class="grid place-items-center shrink-0" :style="stubStyle(false)">
                <view style="text-align: center">
                  <text class="block font-mono-tabular" :style="stubValueStyle(false)">{{ stubValue(v) }}</text>
                  <text class="block" :style="stubLabelStyle(false)">{{ stubLabel(v) }}</text>
                </view>
              </view>
              <view class="shrink-0" :style="perfStyle">
                <view :style="notchStyle(true)" />
                <view :style="notchStyle(false)" />
              </view>
              <view class="flex-1 min-w-0 flex items-center" style="padding: 14px; gap: 10px">
                <view class="flex-1 min-w-0">
                  <text class="block truncate" :style="ticketNameStyle">{{ v.name }}</text>
                  <text class="block truncate" :style="rowSubStyle">{{ scopeText(v) }}</text>
                  <text class="block truncate" :style="rowSubTightStyle">{{ expiryText(v) }}</text>
                </view>
                <view class="shrink-0 inline-flex items-center active:opacity-80" :style="useBtnStyle" role="button" tabindex="0" :aria-label="t.rewards.useCta" @click="onUse(v)">
                  <text class="vcs-cta-t" :style="useBtnTextStyle">{{ t.rewards.useCta }}</text>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 3px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </view>
              </view>
            </view>
          </view>

          <view v-if="expired.length > 0">
            <text class="block" :style="secHead(available.length === 0)">{{ t.rewards.secExpired }}</text>
            <view v-for="v in expired" :key="v.id" class="flex items-stretch" :style="ticketStyle">
              <view class="grid place-items-center shrink-0" :style="stubStyle(true)">
                <view style="text-align: center">
                  <text class="block font-mono-tabular" :style="stubValueStyle(true)">{{ stubValue(v) }}</text>
                  <text class="block" :style="stubLabelStyle(true)">{{ stubLabel(v) }}</text>
                </view>
              </view>
              <view class="shrink-0" :style="perfStyle">
                <view :style="notchStyle(true)" />
                <view :style="notchStyle(false)" />
              </view>
              <view class="flex-1 min-w-0 flex items-center" style="padding: 14px; gap: 10px">
                <view class="flex-1 min-w-0">
                  <text class="block truncate" :style="ticketNameExpiredStyle">{{ v.name }}</text>
                  <text class="block truncate" :style="rowSubStyle">{{ scopeText(v) }}</text>
                </view>
                <view class="shrink-0 inline-flex" :style="expiredBadgeStyle"><text>{{ t.rewards.expiredBadge }}</text></view>
              </view>
            </view>
          </view>
        </template>
      </template>

      <!-- ── USDT / NEX reward records (paginated) ── -->
      <template v-else>
        <EmptyState v-if="records.length === 0" kind="empty-list" :title="t.empty.rewardsTitle" :desc="t.empty.rewardsDesc" />

        <view v-else :style="recordListStyle">
          <view v-for="(b, i) in visibleRecords" :key="b.id" class="flex items-center" :style="recordRowStyle(i)">
            <view class="grid place-items-center shrink-0" :style="vIconStyle(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block truncate" :style="rowTitleStyle">{{ rewardTypeLabel(b.type) }}</text>
              <text class="block truncate" :style="rowSubStyle">{{ b.memo }}</text>
            </view>
            <view class="text-right shrink-0" style="margin-left: 8px">
              <text class="block tabular-nums" :style="rewardAmountStyle">+{{ b.amount.toLocaleString() }} {{ b.symbol }}</text>
              <text class="block" :style="rowDateStyle">{{ shortDate(b.ts) }}</text>
            </view>
          </view>
        </view>

        <!-- Always mounted so the observer attaches at first mount (receipts idiom). -->
        <view ref="loadMoreSentinel" style="height: 1px" />
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect, type CSSProperties } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVoucher } from "@/store/voucher";
import { useBills, isRewardBill, type BillType } from "@/store/bills";
import { getProduct } from "@/mock/products";
import { isSingleSkuVoucher, type VoucherDef } from "@/mock/vouchers";
import { navTo } from "@/lib/route";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";

// Mirrors L1's RewardsCat (pages/me/rewards.vue); unknown values fall back.
type RewardsCat = "voucher" | "usdt" | "nex";
// One screen's worth per load (receipts idiom — mock slices locally, real
// backend pages via cursor+limit with the same size).
const PAGE_SIZE = 10;

const t = useT();
const voucher = useVoucher();
const bills = useBills();

const cat = ref<RewardsCat>("voucher");
onLoad((options) => {
  const o = (options || {}) as Record<string, string>;
  cat.value = o.cat === "usdt" || o.cat === "nex" ? o.cat : "voucher";
});

const pageTitle = computed(() =>
  cat.value === "usdt" ? t.value.rewards.catUsdt : cat.value === "nex" ? t.value.rewards.catNex : t.value.rewards.catVouchers,
);

// ── vouchers ──
const available = computed<VoucherDef[]>(() => voucher.claimedUnused);
const expired = computed<VoucherDef[]>(() => voucher.expiredVouchers);

// ── reward records (per-symbol, newest-first from the ledger) ──
const symbol = computed(() => (cat.value === "nex" ? "NEX" : "USDT"));
const records = computed(() => bills.bills.filter((b) => isRewardBill(b) && b.symbol === symbol.value));
const visibleCount = ref(PAGE_SIZE);
const visibleRecords = computed(() => records.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < records.value.length);

// Tail sentinel auto-load — same mechanics (and same ponytail caveats) as
// receipts.vue: watchEffect re-checks on every dependency change.
const { elRef: loadMoreSentinel, inView: loadMoreInView } = useScrollGrowProgress({ threshold: 0 });
watchEffect(() => {
  if (cat.value !== "voucher" && loadMoreInView.value && hasMore.value) {
    visibleCount.value = Math.min(records.value.length, visibleCount.value + PAGE_SIZE);
  }
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
// Ticket stub — the denomination alone, big ("$50" / "8%"); the word ("立减"/
// "折扣"/"OFF") drops to the small label line below it.
function stubValue(v: VoucherDef): string {
  return v.type === "fixed" ? `$${v.amountUSD ?? 0}` : `${v.percent ?? 0}%`;
}
function stubLabel(v: VoucherDef): string {
  return v.type === "fixed" ? t.value.rewards.stubFixed : t.value.rewards.stubPercent;
}
function scopeText(v: VoucherDef): string {
  if (isSingleSkuVoucher(v)) {
    const name = getProduct(v.applicableSkus[0])?.name ?? v.applicableSkus[0];
    return fmt(t.value.voucher.scopeSingle, { name });
  }
  return t.value.voucher.scopeAll;
}
function expiryText(v: VoucherDef): string {
  return v.endAt === 0 ? t.value.rewards.noExpiry : fmt(t.value.rewards.validUntil, { date: formatDate(v.endAt) });
}
function rewardTypeLabel(type: BillType): string {
  if (type === "refer") return t.value.rewards.typeRefer;
  if (type === "achievement") return t.value.rewards.typeAchievement;
  return t.value.rewards.typeBonus;
}
function onUse(v: VoucherDef) {
  if (isSingleSkuVoucher(v)) {
    navTo(`/store/detail?id=${v.applicableSkus[0]}`);
  } else {
    navTo("/store");
  }
}

// ── styles ── (voucher card block = filled tile identity, de-card white-list;
// records = transparent hairline group, receipts idiom)
const secHeadStyle: CSSProperties = {
  margin: "22px 18px 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
// First visible section label drops the 22px top (page opens with it under the
// global 24px header gap).
function secHead(first: boolean): CSSProperties {
  return first ? { ...secHeadStyle, marginTop: "2px" } : secHeadStyle;
}
// ── ticket anatomy ── one standalone coupon card per voucher: value stub
// (brand tint) | perforation (dashed line + two page-bg punch notches) | body.
// overflow-hidden clips the notch circles into半圆 "bites" at the card edge.
const ticketStyle: CSSProperties = {
  margin: "0 16px 12px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
  overflow: "hidden",
  minHeight: "96px",
};
function stubStyle(dim: boolean): CSSProperties {
  return {
    width: "104px",
    padding: "14px 8px",
    background: dim ? "var(--v5-surface-2)" : "color-mix(in srgb, var(--v5-brand) 12%, transparent)",
  };
}
function stubValueStyle(dim: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "26px",
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap",
    color: dim ? "var(--v5-ink-4)" : "var(--v5-brand)",
  };
}
function stubLabelStyle(dim: boolean): CSSProperties {
  return {
    marginTop: "3px",
    fontSize: "12px",
    fontWeight: 500,
    color: dim ? "var(--v5-ink-4)" : "var(--v5-ink-2)",
  };
}
// Perforation column — a 0-width dashed rule the notches sit on.
const perfStyle: CSSProperties = {
  position: "relative",
  width: "0px",
  borderLeft: "1px dashed var(--v5-border-strong)",
};
function notchStyle(top: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "-7.5px",
    [top ? "top" : "bottom"]: "-7px",
    width: "14px",
    height: "14px",
    borderRadius: "999px",
    background: "var(--v5-bg)",
  } as CSSProperties;
}
const ticketNameStyle: CSSProperties = { fontSize: "15px", fontWeight: 550, color: "var(--v5-ink)" };
const ticketNameExpiredStyle: CSSProperties = { fontSize: "15px", fontWeight: 550, color: "var(--v5-ink-3)" };
const recordListStyle: CSSProperties = {
  margin: "2px 16px 0",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function recordRowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderBottom: i < visibleRecords.value.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
function vIconStyle(dim: boolean): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    background: dim
      ? "var(--v5-surface-2)"
      : "color-mix(in srgb, var(--v5-brand) 12%, transparent)",
  };
}
const rowTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-ink)" };
const rowSubStyle: CSSProperties = { marginTop: "3px", fontSize: "12px", color: "var(--v5-ink-3)" };
const rowSubTightStyle: CSSProperties = { marginTop: "1px", fontSize: "12px", color: "var(--v5-ink-3)" };
const rowDateStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-4)" };
const rewardAmountStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const useBtnStyle: CSSProperties = {
  minHeight: "30px",
  padding: "0 13px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const useBtnTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-on-brand)",
};
const expiredBadgeStyle: CSSProperties = {
  padding: "3px 9px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-4)",
  fontSize: "12px",
};
// Empty state — de-card white-list: dashed border-strong, no fill.
const emptyStyle: CSSProperties = {
  margin: "0 16px",
  border: "1px dashed var(--v5-border-strong)",
  borderRadius: "16px",
  padding: "32px",
  textAlign: "center",
};
const emptyTitleStyle: CSSProperties = { marginTop: "12px", fontSize: "13px", color: "var(--v5-ink-2)" };
const emptyHintStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.6 };
</script>
