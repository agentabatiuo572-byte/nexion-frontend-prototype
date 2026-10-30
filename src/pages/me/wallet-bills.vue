<!--
  Wallet Bills — bills & income statistics (P-33). Asset switch (USDT / UVT),
  this month's earnings with today / this week / all-time from the home
  earnings periods, filters (all / income / spending / rewards), day-grouped
  ledger rows from the server pager, and a detail sheet for rows that have no
  page of their own (withdrawals open tracking, on-chain top-ups open the tx
  page). Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view class="bills-page">
      <SubPageHeader :back="ledgerBizNo ? '/pages/me/rewards-list?cat=promotion' : '/pages/me/me'" :title="t.bills.title" />

      <template v-if="!ledgerBizNo">
        <GlassSegments :label="t.bills.assetGroupLabel" semantics="radio" v-model="asset" :options="assetOptions" class="bills-assets" />

        <view class="bills-overview" data-testid="bills-overview">
          <text class="bills-overview__label">{{ fmt(t.bills.overviewMonth, { asset: platformDisplayText(asset) }) }}</text>
          <view class="bills-overview__amount nx-num-amount">
            <template v-if="overviewMonth !== null && !visibility.hidden">
              <text v-if="asset === 'USDT'" class="bills-overview__minor bills-overview__currency">$</text><text>{{ splitAmount(overviewMonth).whole }}</text><text class="bills-overview__minor">{{ splitAmount(overviewMonth).cents }}</text>
            </template>
            <text v-else>{{ overviewMonth === null ? "—" : visibility.mask("0") }}</text>
          </view>
          <view class="bills-overview__stats">
            <view v-for="stat in overviewStats" :key="stat.label" class="bills-overview__stat">
              <text class="bills-overview__stat-label">{{ stat.label }}</text>
              <text class="bills-overview__stat-value nx-num-metric">{{ stat.value }}</text>
            </view>
          </view>
        </view>

        <view class="bills-filters" role="radiogroup" :aria-label="t.bills.tabGroupLabel">
          <view v-for="(value, index) in TABS" :key="value" class="bills-filter nx-bills-type-radio" :class="{ 'bills-filter--on': tab === value }" role="radio" :aria-checked="tab === value" :tabindex="tab === value ? 0 : -1"
            @click="tab = value" @keydown.enter.prevent="tab = value" @keydown.space.prevent="tab = value" @keydown.right.prevent="moveTab(index, 1)" @keydown.left.prevent="moveTab(index, -1)">
            <text>{{ tabLabel(value) }}</text>
          </view>
        </view>
      </template>

      <view v-if="initialError" :style="ledgerErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="shrink-0 active:opacity-70 nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" role="button" tabindex="0" @click="refreshLedger">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <!-- Empty -->
      <view v-else-if="initialLoading" :style="loadingStyle" role="status" aria-live="polite" aria-busy="true"><text>{{ t.wallet.loadingTransactions }}</text></view>
      <!-- 空态按当前筛选说人话(zentao #220):「支出」筛到空时不能说「充值和到账」——
           那是收入语义,会让用户以为筛选没生效。 -->
      <EmptyState v-else-if="filtered.length === 0" kind="empty-list" :title="t.empty.billsTitle" :desc="emptyDesc" />

      <!-- Day-grouped list -->
      <view v-else class="bills-list">
        <view v-for="g in grouped" :key="g.key" class="bills-day">
          <text class="bills-day__label">{{ g.label }}</text>
          <view class="bills-day__group">
            <view
              v-for="b in g.rows"
              :key="b.id"
              class="bills-row"
              role="button"
              tabindex="0"
              :aria-label="billAria(b)"
              @click.stop="openBill(b)"
              @keydown.enter.prevent="openBill(b)"
              @keydown.space.prevent="openBill(b)"
            >
              <view class="bills-row__icon" :style="iconChipStyle(b.type)">
                <BillTypeIcon :type="b.type" :color="typeColor(b.type)" />
              </view>
              <view class="bills-row__copy">
                <view class="bills-row__title-row">
                  <text class="bills-row__title">{{ typeLabel(b.type) }}</text>
                  <NxTag v-if="b.status !== 'posted'" :tone="b.status === 'pending' ? 'warning' : 'danger'" :label="statusLabel(b.status)" />
                </view>
                <view :class="b.memoKey === 'learningReward' ? '' : 'truncate'" class="bills-row__sub">
                  <text>{{ billMemo(b) }}</text>
                  <text v-if="b.ref && b.memoKey !== 'learningReward' && b.type !== 'refund'"> · </text>
                  <text v-if="b.ref && b.memoKey !== 'learningReward' && b.type !== 'refund'" class="font-mono-tabular">{{ b.ref }}</text>
                  <text> · {{ fmtClock(b.ts) }}</text>
                </view>
                <view v-if="b.type === 'refund' && b.ref" class="flex items-center" style="gap: var(--v5-space-2)" @click.stop>
                  <text class="font-mono-tabular min-w-0" style="color: var(--v5-ink-3); font-size: 12px; overflow-wrap: anywhere">{{ b.ref }}</text>
                  <CopyCodeButton :value="b.ref" :label="t.orders.refundBillNo" />
                </view>
                <text v-if="b.memoKey === 'learningReward' && b.ref" class="block active:opacity-70" style="color: var(--v5-ink-3); font-size: 12px; margin-top: 4px" role="button" tabindex="0" :aria-label="sourceRefOpen === b.id ? t.rewards.hideSourceId : t.rewards.showSourceId" @click.stop="toggleSourceRef(b.id)"  @keydown.enter.stop.prevent="toggleSourceRef(b.id)" @keydown.space.stop.prevent="toggleSourceRef(b.id)">{{ sourceRefOpen === b.id ? t.rewards.hideSourceId : t.rewards.showSourceId }}</text>
                <text v-if="sourceRefOpen === b.id && b.memoKey === 'learningReward'" class="block" style="color: var(--v5-ink-3); font-size: 12px; overflow-wrap: anywhere">{{ b.ref }}</text>
              </view>
              <view class="bills-row__figure">
                <view class="bills-row__amount" :class="{ 'bills-row__amount--in': !isDebit(b) }">
                  <text>{{ isDebit(b) ? "−" : "+" }}{{ fmtAmount(b) }}</text>
                  <text class="bills-row__unit">{{ platformDisplayText(b.symbol) }}</text>
                </view>
                <text v-if="b.balanceAfter !== undefined && b.symbol === 'USDT'" class="bills-row__balance tabular-nums">{{ runningBalanceLabel(b) }}</text>
              </view>
            </view>
          </view>
        </view>
        <view ref="scrollAnchor" style="height: 1px" />
        <view v-if="fundsServerEnabled && activePager.loadingMore" :style="loadingStyle" role="status" aria-live="polite" aria-busy="true"><text>{{ t.wallet.loadingTransactions }}</text></view>
        <view v-if="refreshErrorWithRows" :style="appendErrorStyle">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="inline-flex items-center active:opacity-70 nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" role="button" tabindex="0" @click="refreshLedger">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
        <view v-else-if="appendError" :style="appendErrorStyle">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="inline-flex items-center active:opacity-70 nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" role="button" tabindex="0" @click="loadMore">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
        <view v-if="showManualLoadMore" class="inline-flex items-center active:opacity-70" :style="manualLoadMoreStyle" role="button" tabindex="0" @click="loadMore">
          <text>{{ t.receipt.loadMore }}</text>
        </view>
        <text v-else-if="listEnded" class="bills-end">{{ t.bills.listEnd }}</text>
      </view>
    </view>

    <view v-if="detail" class="bills-sheet-root">
      <view class="bills-sheet-scrim nx-sheet-fade-in" @click="detail = null" />
      <view class="nx-sheet-slide-up bills-sheet" role="dialog" aria-modal="true" :aria-label="typeLabel(detail.type)" data-testid="bills-detail">
        <view class="bills-sheet__handle" aria-hidden="true" />
        <view class="bills-sheet__head">
          <view class="bills-sheet__icon" :style="iconChipStyle(detail.type)"><BillTypeIcon :type="detail.type" :color="typeColor(detail.type)" /></view>
          <text class="bills-sheet__type">{{ typeLabel(detail.type) }}</text>
          <view class="bills-sheet__amount" :class="{ 'bills-sheet__amount--in': !isDebit(detail) }">
            <text class="nx-num-amount">{{ isDebit(detail) ? "−" : "+" }}{{ fmtAmount(detail) }}</text>
            <text class="bills-sheet__unit">{{ platformDisplayText(detail.symbol) }}</text>
          </view>
        </view>
        <view class="bills-sheet__facts">
          <view class="bills-sheet__fact"><text>{{ t.bills.detailType }}</text><text class="bills-sheet__value">{{ typeLabel(detail.type) }}</text></view>
          <view class="bills-sheet__fact"><text>{{ t.bills.detailTime }}</text><text class="bills-sheet__value tabular-nums">{{ fmtTime(detail.ts) }}</text></view>
          <view class="bills-sheet__fact"><text>{{ t.bills.detailSource }}</text><text class="bills-sheet__value">{{ billMemo(detail) }}</text></view>
          <view class="bills-sheet__fact"><text>{{ t.bills.detailStatus }}</text><NxTag :tone="detail.status === 'posted' ? 'success' : detail.status === 'pending' ? 'warning' : 'danger'" :label="statusLabel(detail.status)" /></view>
          <view v-if="detail.ref" class="bills-sheet__fact"><text>{{ t.bills.detailRef }}</text><view class="bills-sheet__ref"><text class="font-mono-code bills-sheet__value">{{ detail.ref }}</text><CopyCodeButton :value="detail.ref" :label="t.bills.detailRef" /></view></view>
          <view v-if="detail.balanceAfter !== undefined && detail.symbol === 'USDT'" class="bills-sheet__fact"><text>{{ t.bills.runningBalance }}</text><text class="bills-sheet__value tabular-nums">{{ decimalLabel(detail.balanceAfterExact, detail.balanceAfter, detail.symbol) }}</text></view>
        </view>
        <view class="bills-sheet__close" role="button" tabindex="0" @click="detail = null" @keydown.enter.prevent="detail = null" @keydown.space.prevent="detail = null"><LiquidGlass :radius="24" tone="control" /><text>{{ t.bills.detailClose }}</text></view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { platformDisplayText } from "@/lib/brand-copy";

import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CopyCodeButton from "@/components/copy-code-button.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import BillTypeIcon from "@/components/me/bill-type-icon.vue";
import GlassSegments from "@/components/glass-segments.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import NxTag from "@/components/ui/nx-tag.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { walletBillClockLabel, walletBillDayKey, walletBillDayLabel, walletBillTimeLabel } from "@/lib/wallet-bill-date";
import { WALLET_BILL_TYPE_COLOR, formatWalletBillDecimal, resolveWalletBillMemo, walletBillTypeTint } from "@/lib/wallet-bill-display";
import { useCourseRewardTitles } from "@/composables/use-course-reward-titles";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { useBills, type Bill, type BillType, type BillStatus } from "@/store/bills";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useDataVisibility } from "@/store/data-visibility";
import { useDeposits, CHAIN_NET_SHORT } from "@/store/deposits";
import { mockServerNow } from "@/store/server-time";
import { navTo, takeNavigationQuery } from "@/lib/route";
import { fundsServerEnabled, sessionVault } from "@/api/runtime";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { useManualScrollLoadMore } from "@/composables/use-manual-scroll-load-more";
import { formatGroupedAmount } from "@/lib/amount-display";

const t = useT();
const app = useApp();
const auth = useAuth();
const visibility = useDataVisibility();
const billsStore = useBills();
const courseTitles = useCourseRewardTitles();
const sourceRefOpen = ref("");
watch(() => app.accountBindingEpoch, () => { sourceRefOpen.value = ""; detail.value = null; });
const ledgerBizNo = ref("");
const locatingReceipt = ref(false);
let lookupGeneration = 0, visible = true;

type Tab = "all" | "in" | "out" | "reward";
const TABS: Tab[] = ["all", "in", "out", "reward"];
const tab = ref<Tab>("all");
const asset = ref<"USDT" | "UVT">("USDT");
onLoad(options => {
  const query = new URLSearchParams(takeNavigationQuery("/pages/me/wallet-bills"));
  ledgerBizNo.value = String(options?.ledgerBizNo ?? query.get("ledgerBizNo") ?? "").trim();
  // Entries such as the home income list preset a filter and asset (?filter=in&asset=UVT).
  const filter = String(options?.filter ?? query.get("filter") ?? "");
  if ((TABS as string[]).includes(filter)) tab.value = filter as Tab;
  const presetAsset = String(options?.asset ?? query.get("asset") ?? "");
  if (presetAsset === "USDT" || presetAsset === "UVT") asset.value = presetAsset;
});
const deposits = useDeposits();
const remoteSessionReady = computed(() => binarySessionReady({
  remote: fundsServerEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));

// A receipt lookup searches the whole ledger; otherwise one pager per asset and filter.
const activePager = computed(() => ledgerBizNo.value ? billsStore.getLedger() : billsStore.getLedger({
  asset: asset.value,
  ...(tab.value === "in" ? { direction: "IN" as const } : tab.value === "out" ? { direction: "OUT" as const } : {}),
  ...(tab.value === "reward" ? { category: "REWARD" as const } : {}),
}));
// 空态描述跟筛选走(zentao #220)。「支出」筛到空时不能复用收入口径的
// 「每一笔充值和到账都会记在这里」—— 充值/到账是进账,与当前筛选自相矛盾。
const emptyDesc = computed(() => ledgerBizNo.value ? t.value.promotion.unknown : tab.value === "out" ? t.value.empty.billsOutDesc
  : tab.value === "in" || tab.value === "reward" ? t.value.empty.billsInDesc
    : t.value.empty.billsDesc);
const scrollAnchor = ref<unknown>(null);

async function refreshLedger() {
  if (!fundsServerEnabled || !remoteSessionReady.value || !visible) return;
  const request = ++lookupGeneration, account = app.accountKey, epoch = app.accountBindingEpoch;
  const current = () => visible && request === lookupGeneration && account === app.accountKey && epoch === app.accountBindingEpoch;
  locatingReceipt.value = Boolean(ledgerBizNo.value);
  try {
    await activePager.value.refresh();
    while (current() && ledgerBizNo.value && !activePager.value.rows.some(b => b.ledgerBizNo === ledgerBizNo.value)
        && activePager.value.hasMore && !activePager.value.error) await activePager.value.loadMore();
  } catch { /* pager owns recoverable state */ }
  finally { if (current()) locatingReceipt.value = false; }
}
async function loadMore() {
  if (!fundsServerEnabled || !remoteSessionReady.value || !visible || locatingReceipt.value) return;
  try { await activePager.value.loadMore(); } catch { /* retain rows; render retry */ }
}
function invalidateReceiptLookup() { visible = false; lookupGeneration++; locatingReceipt.value = false; }
onShow(() => {
  visible = true; void refreshLedger();
  if (app.homeTruthStatus === "idle" || app.homeTruthStatus === "error") void app.refreshHomeTruth();
});
onHide(invalidateReceiptLookup);
onBeforeUnmount(invalidateReceiptLookup);
watch([tab, asset], () => { void refreshLedger(); });
// Cookie restore and same-page account rebind both reset the active ledger.
watch([remoteSessionReady, () => app.accountBindingEpoch], ([ready, epoch], [wasReady, previousEpoch]) => {
  lookupGeneration++; locatingReceipt.value = false;
  if (ready && (!wasReady || epoch !== previousEpoch)) void refreshLedger();
});
useManualScrollLoadMore(scrollAnchor, {
  enabled: () => fundsServerEnabled && !ledgerBizNo.value && !activePager.value.error,
  hasMore: () => activePager.value.hasMore,
  loading: () => activePager.value.loadingMore || activePager.value.status === "loading",
  loadMore,
});
const initialLoading = computed(() => locatingReceipt.value || (fundsServerEnabled && !activePager.value.rows.length
  && (!remoteSessionReady.value || activePager.value.status === "idle" || activePager.value.status === "loading")));
const initialError = computed(() => fundsServerEnabled && ((Boolean(ledgerBizNo.value) && Boolean(activePager.value.error))
  || (activePager.value.status === "error" && activePager.value.rows.length === 0)));
const refreshErrorWithRows = computed(() => fundsServerEnabled && activePager.value.status === "error" && activePager.value.rows.length > 0);
const appendError = computed(() => fundsServerEnabled && activePager.value.status === "ready" && activePager.value.rows.length > 0 && Boolean(activePager.value.error));
const showManualLoadMore = computed(() => fundsServerEnabled && !ledgerBizNo.value && activePager.value.status === "ready" && activePager.value.hasMore && !activePager.value.loadingMore && !appendError.value && !refreshErrorWithRows.value);
const listEnded = computed(() => !ledgerBizNo.value && (!fundsServerEnabled || (activePager.value.status === "ready" && !activePager.value.hasMore && !activePager.value.error)));

// Overview: the home earnings periods for the selected asset (USDT or UVT).
const assetOptions = computed(() => (["USDT", "UVT"] as const).map(value => ({ value, label: platformDisplayText(value) })));
const periodValue = (period: "today" | "week" | "month" | "all") => {
  const value = app.homeTruth?.earnings[period][asset.value === "USDT" ? "usdt" : "nex"];
  return value === null || value === undefined ? null : value;
};
const overviewMonth = computed(() => periodValue("month"));
const overviewStats = computed(() => ([["today", t.value.bills.overviewToday], ["week", t.value.bills.overviewWeek], ["all", t.value.bills.overviewAll]] as const)
  .map(([period, label]) => {
    const value = periodValue(period);
    const text = value === null ? "—" : `${asset.value === "USDT" ? "$" : ""}${formatGroupedAmount(value)}`;
    return { label, value: value === null ? text : visibility.mask(text) };
  }));
function splitAmount(value: number): { whole: string; cents: string } {
  const [whole, cents] = formatGroupedAmount(value).split(".");
  return { whole, cents: cents === undefined ? "" : `.${cents}` };
}

const TYPE_COLOR = WALLET_BILL_TYPE_COLOR;
function typeColor(type: BillType): string {
  return TYPE_COLOR[type];
}

// 🔴 每条流水后的余额由**服务端复式账本**下发(Bill.balanceAfter),前端不推算。
//
// 这里曾试过两种推算,两种都错,根因同一个:**账单不是完整账本**。
//  · 从 0 正向累加 → 补不齐那些「改了余额却不写账单」的路径(收益按 tick 累加、赠金释放),
//    实测账单写「余额 $60.31」而钱包写「$24,826.56」,用户以为钱被吞了;
//  · 以真实余额为锚往回倒推 → 又踩反方向:注册赠金进「待审核」桶时只加桶不动余额,
//    账单却无条件写了一行,倒推把它当已入账 → 那行以下每一行偏 $5;
//    而且筛选态(只看支出)下相邻两行之间隔着看不见的行,实测「每笔支出后余额还在涨」。
//
// 结论:两个方向都漏 = 这条路线本身不成立,给 Bill 加个「动没动余额」的字段也只堵一半。
// 判据回到本工程自己的规矩:**指不出单源的数字,要么接单源,要么别显示**。
// mock 期 balanceAfter 恒为 undefined → 这一列不渲染;接上真后端自动出现,零改动。
const REWARD_TYPES: BillType[] = ["refer", "bonus", "achievement"];
const filtered = computed<Bill[]>(() => {
  if (ledgerBizNo.value) return activePager.value.rows.filter(b => b.ledgerBizNo === ledgerBizNo.value);
  if (fundsServerEnabled) return activePager.value.rows;
  const ofAsset = billsStore.bills.filter((b) => b.symbol === asset.value);
  if (tab.value === "all") return ofAsset;
  if (tab.value === "in") return ofAsset.filter((b) => b.amount > 0);
  if (tab.value === "reward") return ofAsset.filter((b) => REWARD_TYPES.includes(b.type));
  return ofAsset.filter((b) => b.amount < 0);
});

const grouped = computed<Array<{ key: string; label: string; rows: Bill[] }>>(() => {
  const map = new Map<string, Bill[]>();
  for (const b of filtered.value) {
    const key = walletBillDayKey(b.ts);
    const arr = map.get(key) ?? [];
    arr.push(b);
    map.set(key, arr);
  }
  const locale = dateLocale(), now = mockServerNow();
  const words = { today: t.value.bills.dayToday, yesterday: t.value.bills.dayYesterday };
  return Array.from(map.entries()).map(([key, rows]) => ({ key, label: walletBillDayLabel(rows[0].ts, locale, now, words), rows }));
});

function typeLabel(type: BillType): string {
  const key = `type${type.charAt(0).toUpperCase()}${type.slice(1)}` as keyof typeof t.value.bills;
  return t.value.bills[key] as string;
}
function statusLabel(s: BillStatus): string {
  if (s === "posted") return t.value.bills.statusPosted;
  if (s === "pending") return t.value.bills.statusPending;
  return t.value.bills.statusFailed;
}
/**
 * 账单文案:有 memoKey 就**渲染时翻译**,没有才回落到写入时那句(存量 / 未迁移调用方)。
 * 之前种子行是英文硬串,越南语用户会在同一个列表里看到中文表头 + 英文摘要 + 越南语新行,三种语言。
 */
function billMemo(b: Bill): string {
  return resolveWalletBillMemo(b, t.value.bills.memo as Record<string, string>, courseTitles.value);
}
function toggleSourceRef(id: string) { sourceRefOpen.value = sourceRefOpen.value === id ? "" : id; }
function decimalLabel(exact: string | undefined, fallback: number, symbol: Bill['symbol']): string {
  return formatWalletBillDecimal(exact, fallback, symbol, dateLocale());
}
function isDebit(b: Bill): boolean {
  return b.amountExact === undefined ? b.amount < 0 : b.amountExact.startsWith("-");
}
function runningBalanceLabel(b: Bill): string {
  return `${t.value.bills.runningBalance} ${decimalLabel(b.balanceAfterExact, b.balanceAfter!, b.symbol)}`;
}
function fmtAmount(b: Bill): string {
  return decimalLabel(b.amountExact, b.amount, b.symbol);
}
function fmtTime(ts: number): string {
  return walletBillTimeLabel(ts, dateLocale());
}
function fmtClock(ts: number): string {
  return walletBillClockLabel(ts);
}
function billHash(b: Bill): string {
  // 冲正分录的 ref 带 `-REV` 后缀(与原扣款分录分开幂等键,见 marketplace / stake-sheet 等)。
  // **有意不剥掉**:两行并排时,同号会让用户分不清哪行是扣、哪行是退;带后缀反而清楚,
  // 而且抄给客服时能直接定位到冲正那条。参考号是标识不是文案,与 `DP-20260804-0001` 同类。
  return b.ref || b.id;
}
function billAria(b: Bill): string {
  // 用 billMemo(渲染时翻译)而不是写入时冻结语言的 raw memo —— 切语言后读屏不再旧语直出
  return `${typeLabel(b.type)} ${billMemo(b)} ${billHash(b)}`;
}
/**
 * 🔴 账单行按条目性质分流(2026-08-02 走查 P0 + 证伪修订):
 *  - withdraw(含同单号的 NEX 燃烧行)→ 提现追踪页:单据真状态机,审核中的单不再被 tx 页
 *    恒定的「已确认」编造;NEX 行点开看所属提现单,不再被按 hash 编成一笔链上交易;
 *  - topup 链上 → tx 页带真实参数,优先按 ref 反查入金记录(毛额/真实确认数/收款地址,
 *    与 deposit-usdt-pane.goRecord 同口径);记录缺失(种子)退回 network 字段/memo 正则;
 *  - 其余(奖励/成就/兑换/购买/质押/历史验证返还)不是链上转账,没有「交易详情」可看 →
 *    打开本页的账单详情弹层,只展示这条账单自己的字段,不编造交易。
 */
function billClickable(b: Bill): boolean {
  if (b.type === "withdraw") return !!b.ref;
  if (b.type === "topup") return txParamsForTopup(b) !== null;
  return false;
}
const detail = ref<Bill | null>(null);
useDialogA11y(computed(() => detail.value !== null), ".bills-sheet", () => { detail.value = null; });
function openBill(b: Bill) {
  if (billClickable(b)) goBill(b);
  else detail.value = b;
}
function goBill(b: Bill) {
  if (b.type === "withdraw") {
    // ref = 提现单号(USDT 主行与 NEX 燃烧行同 ref);追踪页按单号显示,查无此单走空态
    if (b.ref) navTo(`/pages/me/wallet-withdraw-tracking?id=${b.ref}`);
    return;
  }
  if (b.type === "topup") {
    const p = txParamsForTopup(b);
    if (p) navTo(`/pages/tx/hash?${p.toString()}`);
    return;
  }
  // 其余类型由 openBill 打开详情弹层;这里只是兜底防线
}
/** topup 行的 tx 页真实参数;拼不出真实网络就返回 null —— 宁可不可点,不让 tx 页编数。 */
function txParamsForTopup(b: Bill): URLSearchParams | null {
  const p = new URLSearchParams({ hash: billHash(b) });
  const rec = deposits.records.find((r) => (r.txHash ?? r.depositId) === b.ref);
  const recNet = rec ? CHAIN_NET_SHORT[rec.channel] : undefined;
  if (rec && recNet) {
    // 与 goRecord 同口径:金额 = 链上转账毛额(gross),确认数 = 真实值(修「56 confirmations」同类编造)
    p.set("amount", rec.grossAmountUsdt.toFixed(2));
    p.set("net", recNet);
    p.set("confs", String(rec.confirmations ?? 0));
    if (rec.address) p.set("to", rec.address);
    p.set("age", String(Math.max(1, Math.round((mockServerNow() - b.ts) / 60_000))));
    return p;
  }
  // 存量兜底(种子行等无入金记录):网络取字段或 memo 正则,金额用账单额(与本行自洽)
  const net = b.network ?? billNetwork(b);
  if (!net) return null;
  if (b.symbol === "USDT") p.set("amount", Math.abs(b.amount).toFixed(2));
  p.set("net", net);
  // 时敏路径统一走 mockServerNow 单时源(server-time.ts 约定;直用 Date.now 接后端换时源不跟)
  p.set("age", String(Math.max(1, Math.round((mockServerNow() - b.ts) / 60_000))));
  return p;
}

/**
 * 从账单 memo 里认出链(存量条目的 memo 带 `USDT-TRC20` 这类网络标识)。认不出就不认。
 * ⚠️ 必须返回**大写**:tx 页的 NET_LINES 键是 TRC20 / ERC20 / BEP20,且它用 `options.net in NET_LINES`
 * 做白名单校验 —— 传小写会被静默丢弃,参数「传了」但没生效,退化成随机编数(这类假修最难发现)。
 */
function billNetwork(b: Bill): string | null {
  const m = /USDT-(TRC20|ERC20|BEP20)/i.exec(b.memo);
  return m ? m[1].toUpperCase() : null;
}

function tabLabel(tb: Tab): string {
  if (tb === "all") return t.value.bills.tabAll;
  if (tb === "in") return t.value.bills.tabIn;
  if (tb === "reward") return t.value.bills.tabReward;
  return t.value.bills.tabOut;
}
/** 筛选单选组的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。 */
function moveTab(index: number, delta: number): void {
  const next = TABS[(index + delta + TABS.length) % TABS.length];
  if (!next || next === tab.value) return;
  tab.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-bills-type-radio[tabindex="0"]')?.focus();
  });
}

// ── styles ──
const ledgerErrorStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-danger) 10%, transparent)",
  color: "var(--v5-danger)",
  fontSize: "12px",
};
const loadingStyle: CSSProperties = { margin: "0 16px", padding: "32px", textAlign: "center", color: "var(--v5-ink-3)" };
const appendErrorStyle: CSSProperties = {
  marginTop: "8px", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", color: "var(--v5-danger)", fontSize: "12px",
};
const manualLoadMoreStyle: CSSProperties = {
  minHeight: "40px", margin: "4px 0 0", padding: "0 14px", borderRadius: "999px", background: "var(--v5-surface)", color: "var(--v5-ink-2)", fontSize: "12px",
};
function iconChipStyle(type: BillType): CSSProperties {
  return { background: walletBillTypeTint(type) };
}
</script>

<style scoped>
.bills-page { color: var(--v5-ink); padding-bottom: 24px; }
.bills-assets { margin: 0 16px 16px; }
.bills-overview { display:flex;flex-direction:column;gap:var(--v5-space-1);margin:0 16px 16px;padding:var(--ui-space-inset-hero);border:1px solid var(--v5-border);border-radius:var(--ui-radius-surface);background:var(--v5-surface); }
.bills-overview__label { font:var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-overview__amount { display:flex;align-items:baseline;font-size:var(--ui-type-wallet-amount);font-weight:var(--ui-type-wallet-amount-weight);line-height:var(--ui-type-wallet-amount-lh);letter-spacing:-.02em; }
.bills-overview__minor { color:var(--v5-ink-3); }
.bills-overview__currency { font-size:max(12px,.55em); }
.bills-overview__stats { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--ui-space-inline);margin-top:var(--ui-space-inline);padding-top:16px;border-top:1px solid var(--v5-border); }
.bills-overview__stat { display:flex;flex-direction:column;gap:var(--v5-space-1);min-width:0; }
.bills-overview__stat-label { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-overview__stat-value { overflow:hidden;font-size:15px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap; }
.bills-filters { display:flex;gap:var(--v5-space-1);margin:0 16px 16px; }
.bills-filter { display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;border-radius:999px;font:500 13px/18px var(--font-v5);color:var(--v5-ink-3);cursor:pointer; }
.bills-filter::after { content:"";position:absolute;inset:-6px 0; }
.bills-filter { position:relative; }
.bills-filter--on { background:color-mix(in srgb,var(--v5-ink) 10%,transparent);color:var(--v5-ink); }
.bills-filter:focus-visible { outline:2px solid var(--v5-brand);outline-offset:2px; }
.bills-list { margin: 0 16px 12px; }
.bills-day { margin-bottom: var(--ui-space-inset); }
.bills-day__label { display:block;padding:0 4px 8px;font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-day__group { overflow:hidden;border:1px solid var(--v5-border);border-radius:var(--ui-radius-surface);background:var(--v5-surface); }
.bills-row { display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;column-gap:var(--ui-space-inline);min-height:64px;box-sizing:border-box;padding:var(--ui-space-inline) 16px;cursor:pointer; }
.bills-row + .bills-row { border-top:1px solid var(--v5-border); }
.bills-row:active { background:var(--v5-surface-2); }
.bills-row:focus-visible { outline:2px solid var(--v5-brand);outline-offset:-2px; }
.bills-row__icon { display:grid;place-items:center;width:32px;height:32px;border-radius:10px; }
.bills-row__copy { display:flex;flex-direction:column;min-width:0; }
.bills-row__title-row { display:flex;align-items:center;gap:var(--v5-space-2);min-width:0; }
.bills-row__title { overflow:hidden;font:var(--ui-type-message-title-weight) var(--ui-type-message-title)/var(--ui-type-message-title-lh) var(--font-v5);text-overflow:ellipsis;white-space:nowrap; }
.bills-row__sub { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-row__figure { display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-left:var(--v5-space-1); }
.bills-row__amount { display:flex;align-items:baseline;gap:var(--v5-space-1);font:500 15px/22px var(--font-v5);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--v5-ink); }
.bills-row__amount--in { color:var(--v5-success-ink); }
.bills-row__unit { font:500 12px/16px var(--font-v5);color:var(--v5-ink-3); }
.bills-row__balance { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-end { display:block;padding:0 0 4px;text-align:center;font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-4); }
.bills-sheet-root { position:fixed;inset:0;z-index:790;display:flex;align-items:flex-end; }
.bills-sheet-scrim { position:absolute;inset:0;background:var(--v5-bg-color-mask); }
.bills-sheet { position:relative;display:flex;flex-direction:column;gap:var(--ui-space-inset);width:100%;box-sizing:border-box;padding:var(--v5-space-2) 16px calc(16px + var(--nx-overlay-safe-bottom, 0px));border-radius:28px 28px 0 0;background:var(--v5-surface); }
.bills-sheet__handle { align-self:center;width:36px;height:4px;border-radius:999px;background:color-mix(in srgb,var(--v5-ink) 18%,transparent); }
.bills-sheet__head { display:flex;flex-direction:column;align-items:center;gap:var(--v5-space-2);padding:var(--v5-space-2) 0 6px; }
.bills-sheet__icon { display:grid;place-items:center;width:48px;height:48px;border-radius:14px; }
.bills-sheet__type { font:var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5);color:var(--v5-ink-3); }
.bills-sheet__amount { display:flex;align-items:baseline;gap:10px;font-size:var(--ui-type-wallet-amount);font-weight:var(--ui-type-wallet-amount-weight);line-height:var(--ui-type-wallet-amount-lh);color:var(--v5-ink); }
.bills-sheet__amount--in { color:var(--v5-success-ink); }
.bills-sheet__unit { font:500 14px/20px var(--font-v5);color:var(--v5-ink-3); }
.bills-sheet__facts { display:flex;flex-direction:column;border-radius:var(--ui-radius-surface);background:var(--v5-surface-2); }
.bills-sheet__fact { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inset);min-height:48px;box-sizing:content-box;padding:0 16px;font:400 14px/20px var(--font-v5);color:var(--v5-ink-3); }
.bills-sheet__fact + .bills-sheet__fact { border-top:1px solid var(--v5-border); }
.bills-sheet__value { min-width:0;font-weight:400;text-align:right;color:var(--v5-ink);overflow-wrap:anywhere; }
.bills-sheet__ref { display:flex;align-items:center;gap:var(--v5-space-2);min-width:0; }
.bills-sheet__close { position:relative;isolation:isolate;display:grid;place-items:center;min-height:48px;border-radius:24px;color:var(--v5-ink);font:var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5);cursor:pointer; }
.bills-sheet__close > text { position:relative;z-index:1; }
</style>
