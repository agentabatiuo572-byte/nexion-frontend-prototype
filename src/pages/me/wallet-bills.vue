<!--
  Wallet Bills — ported from Nexion-prototype/app/(main)/me/wallet/bills/page.tsx.
  Transaction/bill ledger: segmented tabs (All / Credit / Debit) → month-grouped
  list of credits & debits, each with type icon + memo + ref + running USDT
  balance. Reads the existing useBills store (already ported). SetPageHeader →
  in-page SubPageHeader (back=/pages/me/wallet). SegmentedControl → inline pill
  tabs (events.vue pattern). The SSR mounted-guard is dropped (no SSR in uni).
  Wrapped in <AppChassis active="me">.

  Icon TYPE colours: a few are official accents not in the token set (refer
  green #86E81F, topup blue #3DA9FF) — kept literal like card-brand colours;
  the rest use var(--v5-*). Tinted icon bg uses color-mix (P-022), not `${hex}1A`.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet" :title="t.bills.title" />

      <!-- Tabs -->
      <GlassSegments :label="t.bills.tabGroupLabel" semantics="radio" v-model="tab" :options="tabOptions" style="margin: 0 16px 12px"  />

      <view v-if="initialError" :style="ledgerErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="refreshLedger">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <!-- Empty -->
      <view v-else-if="initialLoading" :style="loadingStyle" role="status" aria-live="polite" aria-busy="true"><text>{{ t.wallet.loadingTransactions }}</text></view>
      <!-- 空态按当前筛选说人话(zentao #220):「支出」筛到空时不能说「充值和到账」——
           那是收入语义,会让用户以为筛选没生效。 -->
      <EmptyState v-else-if="filtered.length === 0" kind="empty-list" :title="t.empty.billsTitle" :desc="emptyDesc" />

      <!-- Grouped list -->
      <view v-else :style="listWrapStyle">
        <view v-for="g in grouped" :key="g.month" :style="sectionStyle">
          <text class="block" :style="monthHeaderStyle">{{ monthLabel(g.month, g.rows.length) }}</text>
          <view
            v-for="(b, i) in g.rows"
            :key="b.id"
            class="flex items-center"
            :class="billClickable(b) ? 'active:opacity-90' : ''"
            :style="rowStyle(i)"
            :role="billClickable(b) ? 'button' : undefined"
            :tabindex="billClickable(b) ? 0 : undefined"
            :aria-label="billClickable(b) ? billAria(b) : undefined"
            v-on="billRowOn(b)"
          >
            <view class="grid place-items-center shrink-0" :style="iconChipStyle(b.type)">
              <BillTypeIcon :type="b.type" :color="typeColor(b.type)" />
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center" style="gap: 8px">
                <text class="truncate" :style="typeLabelStyle">{{ typeLabel(b.type) }}</text>
                <text :style="statusBadgeStyle(b.status)">{{ statusLabel(b.status) }}</text>
              </view>
              <view :class="b.memoKey === 'learningReward' ? '' : 'truncate'" :style="memoStyle">
                <text>{{ billMemo(b) }}</text>
                <text v-if="b.ref && b.memoKey !== 'learningReward'" style="color: var(--v5-ink-4); margin: 0 4px">·</text>
                <text v-if="b.ref && b.memoKey !== 'learningReward'" class="font-mono-tabular">{{ b.ref }}</text>
              </view>
              <text v-if="b.memoKey === 'learningReward' && b.ref" class="block active:opacity-70" style="color: var(--v5-ink-3); font-size: 12px; margin-top: 4px" role="button" tabindex="0" :aria-label="sourceRefOpen === b.id ? t.rewards.hideSourceId : t.rewards.showSourceId" @click="toggleSourceRef(b.id)"  @keydown.enter.prevent="toggleSourceRef(b.id)" @keydown.space.prevent="toggleSourceRef(b.id)">{{ sourceRefOpen === b.id ? t.rewards.hideSourceId : t.rewards.showSourceId }}</text>
              <text v-if="sourceRefOpen === b.id && b.memoKey === 'learningReward'" class="block" style="color: var(--v5-ink-3); font-size: 12px; overflow-wrap: anywhere">{{ b.ref }}</text>
              <text class="block" :style="timeStyle">{{ fmtTime(b.ts) }}</text>
            </view>
            <view class="text-right shrink-0" style="margin-left: 8px">
              <view :style="amountStyle(b.amount)">
                <text>{{ b.amount >= 0 ? "+" : "-" }}{{ fmtAmount(b) }}</text>
                <text style="font-size: 12px; color: var(--v5-ink-4); margin-left: 4px">{{ b.symbol }}</text>
              </view>
              <text
                v-if="b.balanceAfter !== undefined && b.symbol === 'USDT'"
                class="block tabular-nums"
                :style="balanceAfterStyle"
              >{{ runningBalanceLabel(b.balanceAfter!) }}</text>
            </view>
          </view>
        </view>
        <view ref="scrollAnchor" style="height: 1px" />
        <view v-if="fundsServerEnabled && activePager.loadingMore" :style="loadingStyle" role="status" aria-live="polite" aria-busy="true"><text>{{ t.wallet.loadingTransactions }}</text></view>
        <view v-if="refreshErrorWithRows" :style="appendErrorStyle">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="inline-flex items-center active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="refreshLedger">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
        <view v-else-if="appendError" :style="appendErrorStyle">
          <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
          <view class="inline-flex items-center active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="loadMore">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
        <view v-if="showManualLoadMore" class="inline-flex items-center active:opacity-70" :style="manualLoadMoreStyle" role="button" tabindex="0" @click="loadMore">
          <text>{{ t.receipt.loadMore }}</text>
        </view>
      </view>

      <text class="block" :style="footerStyle">{{ t.bills.footer }}</text>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import BillTypeIcon from "@/components/me/bill-type-icon.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { walletBillMonthKey, walletBillMonthLabel, walletBillTimeLabel } from "@/lib/wallet-bill-date";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { useCourseRewardTitles } from "@/composables/use-course-reward-titles";
import { useBills, type Bill, type BillType, type BillStatus } from "@/store/bills";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useDeposits, CHAIN_NET_SHORT } from "@/store/deposits";
import { mockServerNow } from "@/store/server-time";
import { navTo } from "@/lib/route";
import { fundsServerEnabled, sessionVault } from "@/api/runtime";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { useManualScrollLoadMore } from "@/composables/use-manual-scroll-load-more";

const t = useT();
const app = useApp();
const auth = useAuth();
const billsStore = useBills();
const courseTitles = useCourseRewardTitles();
const sourceRefOpen = ref("");
watch(() => app.accountBindingEpoch, () => { sourceRefOpen.value = ""; });
const deposits = useDeposits();
const remoteSessionReady = computed(() => binarySessionReady({
  remote: fundsServerEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));

type Tab = "all" | "in" | "out";
const TABS: Tab[] = ["all", "in", "out"];
const tab = ref<Tab>("all");
const allPager = billsStore.getLedger();
const inPager = billsStore.getLedger({ direction: "IN" });
const outPager = billsStore.getLedger({ direction: "OUT" });
const activePager = computed(() => tab.value === "in" ? inPager : tab.value === "out" ? outPager : allPager);
// 空态描述跟筛选走(zentao #220)。「支出」筛到空时不能复用收入口径的
// 「每一笔充值和到账都会记在这里」—— 充值/到账是进账,与当前筛选自相矛盾。
const emptyDesc = computed(() => tab.value === "out" ? t.value.empty.billsOutDesc
  : tab.value === "in" ? t.value.empty.billsInDesc
    : t.value.empty.billsDesc);
const scrollAnchor = ref<unknown>(null);

async function refreshLedger() {
  if (!fundsServerEnabled || !remoteSessionReady.value) return;
  try { await activePager.value.refresh(); } catch { /* pager owns recoverable state */ }
}
async function loadMore() {
  if (!fundsServerEnabled) return;
  try { await activePager.value.loadMore(); } catch { /* retain rows; render retry */ }
}
onShow(() => { void refreshLedger(); });
watch(tab, () => { void refreshLedger(); });
// Cookie restore and same-page account rebind both reset the active ledger.
watch([remoteSessionReady, () => app.accountBindingEpoch], ([ready, epoch], [wasReady, previousEpoch]) => {
  if (ready && (!wasReady || epoch !== previousEpoch)) void refreshLedger();
});
useManualScrollLoadMore(scrollAnchor, {
  enabled: () => fundsServerEnabled && !activePager.value.error,
  hasMore: () => activePager.value.hasMore,
  loading: () => activePager.value.loadingMore || activePager.value.status === "loading",
  loadMore,
});
const initialLoading = computed(() => fundsServerEnabled && !activePager.value.rows.length
  && (!remoteSessionReady.value || activePager.value.status === "idle" || activePager.value.status === "loading"));
const initialError = computed(() => fundsServerEnabled && activePager.value.status === "error" && activePager.value.rows.length === 0);
const refreshErrorWithRows = computed(() => fundsServerEnabled && activePager.value.status === "error" && activePager.value.rows.length > 0);
const appendError = computed(() => fundsServerEnabled && activePager.value.status === "ready" && activePager.value.rows.length > 0 && Boolean(activePager.value.error));
const showManualLoadMore = computed(() => fundsServerEnabled && activePager.value.status === "ready" && activePager.value.hasMore && !activePager.value.loadingMore && !appendError.value && !refreshErrorWithRows.value);

// Type accent colours. Most map to tokens; refer/topup use official accents
// (like the card-brand colours) kept literal on purpose.
const TYPE_COLOR: Record<BillType, string> = {
  earn: "var(--v5-brand)",
  refer: "#86E81F",
  bonus: "var(--v5-warning)",
  topup: "#3DA9FF",
  withdraw: "var(--v5-brand-2)",
  purchase: "var(--v5-tech-cyan)",
  swap: "var(--v5-brand)",
  verification: "var(--v5-tech-cyan)",
  stake: "var(--v5-warning)",
  unstake: "var(--v5-ink-3)",
  achievement: "var(--v5-warning)",
  other: "var(--v5-ink-3)",
};
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
const filtered = computed<Bill[]>(() => {
  if (fundsServerEnabled) return activePager.value.rows;
  if (tab.value === "all") return billsStore.bills;
  if (tab.value === "in") return billsStore.bills.filter((b) => b.amount > 0);
  return billsStore.bills.filter((b) => b.amount < 0);
});

const grouped = computed<Array<{ month: string; rows: Bill[] }>>(() => {
  const map = new Map<string, Bill[]>();
  for (const b of filtered.value) {
    const key = walletBillMonthKey(b.ts);
    const arr = map.get(key) ?? [];
    arr.push(b);
    map.set(key, arr);
  }
  const locale = dateLocale();
  return Array.from(map.values()).map((rows) => ({ month: walletBillMonthLabel(rows[0].ts, locale), rows }));
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
function monthLabel(month: string, n: number): string {
  return fmt(n === 1 ? t.value.bills.monthLabelOne : t.value.bills.monthLabel, { month, n });
}
/**
 * 账单文案:有 memoKey 就**渲染时翻译**,没有才回落到写入时那句(存量 / 未迁移调用方)。
 * 之前种子行是英文硬串,越南语用户会在同一个列表里看到中文表头 + 英文摘要 + 越南语新行,三种语言。
 */
function billMemo(b: Bill): string {
  return resolveWalletBillMemo(b, t.value.bills.memo as Record<string, string>, courseTitles.value);
}
function toggleSourceRef(id: string) { sourceRefOpen.value = sourceRefOpen.value === id ? "" : id; }
function runningBalanceLabel(bal: number): string {
  return `${t.value.bills.runningBalance}: ${bal.toFixed(2)}`;
}
function fmtAmount(b: Bill): string {
  const abs = Math.abs(b.amount);
  return b.symbol === "USDT" ? abs.toFixed(4) : abs.toLocaleString();
}
function fmtTime(ts: number): string {
  return walletBillTimeLabel(ts, dateLocale());
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
 *    行不可点(billClickable 同判据),宁可不可点也不编造。
 */
function billClickable(b: Bill): boolean {
  if (b.type === "withdraw") return !!b.ref;
  if (b.type === "topup") return txParamsForTopup(b) !== null;
  return false;
}
/** 不可点行**不注册** click 监听:留着监听器 + 零按压反馈会被 tap-feedback 门判成死控件,
 *  读屏/命中层面也仍在伪装可点(审计 P1)。 */
function billRowOn(b: Bill) {
  return billClickable(b)
    ? { click: (e: Event) => { e.stopPropagation(); goBill(b); } }
    : {};
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
  // 其余类型不导航(billClickable 已把行渲染为不可点,这里只是键盘/兜底防线)
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

// ── styles ──
// Mirrors prototype shared SegmentedControl (segmented-control.tsx):
// container gap-0.5(2px)/p-1(4px)/rounded-2xl(16px) L1 surface bg; segment
// h-11(44px)/rounded-[10px]; active = brand-filled indicator + on-brand text.
// Header→content breathing is global (SubPageHeader 24px); no extra top offset.
const segWrapStyle: CSSProperties = {
  margin: "0 16px 12px",
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 brand 实底,不撞色
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "4px",
  gap: "2px",
};
function pillStyle(tb: Tab): CSSProperties {
  const on = tab.value === tb;
  return {
    height: "44px",
    borderRadius: "10px",
    background: on ? "var(--v5-brand)" : "transparent",
  };
}
function pillLabelStyle(tb: Tab): CSSProperties {
  const on = tab.value === tb;
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: on ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
function tabLabel(tb: Tab): string {
  if (tb === "all") return t.value.bills.tabAll;
  if (tb === "in") return t.value.bills.tabIn;
  return t.value.bills.tabOut;
}
/** 类型单选组的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。 */
function moveTab(index: number, delta: number): void {
  const next = TABS[(index + delta + TABS.length) % TABS.length];
  if (!next || next === tab.value) return;
  tab.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-bills-type-radio[tabindex="0"]')?.focus();
  });
}

// Empty state (de-card white-list): dashed outline, no fill.
const emptyStyle: CSSProperties = {
  margin: "0 16px",
  border: "1px dashed var(--v5-border-strong)",
  borderRadius: "16px",
  padding: "32px",
  textAlign: "center",
};
const emptyTextStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)" };

const listWrapStyle: CSSProperties = { margin: "0 16px 12px" };
const ledgerErrorStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-danger) 10%, transparent)",
  color: "var(--v5-danger)",
  fontSize: "12px",
};
const retryBtnStyle: CSSProperties = {
  minHeight: "32px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontSize: "12px",
};
const loadingStyle: CSSProperties = { margin: "0 16px", padding: "32px", textAlign: "center", color: "var(--v5-ink-3)" };
const appendErrorStyle: CSSProperties = {
  marginTop: "8px", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", color: "var(--v5-danger)", fontSize: "12px",
};
const manualLoadMoreStyle: CSSProperties = {
  minHeight: "40px", margin: "4px 0 0", padding: "0 14px", borderRadius: "999px", background: "var(--v5-surface)", color: "var(--v5-ink-2)", fontSize: "12px",
};
// Transparent hairline group per month: container border-top opens it, the mono
// month header + rows carry their own dividers (first row = no top border).
const sectionStyle: CSSProperties = {
  marginBottom: "20px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
const monthHeaderStyle: CSSProperties = {
  padding: "8px 0",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
  borderBottom: "1px solid var(--v5-border)",
};
function rowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderTop: i !== 0 ? "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)" : "none",
  };
}
function iconChipStyle(type: BillType): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    background: `color-mix(in srgb, ${TYPE_COLOR[type]} 12%, transparent)`,
  };
}
const typeLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
function statusBadgeStyle(s: BillStatus): CSSProperties {
  const base: CSSProperties = {
    fontSize: "12px",
    padding: "1px 6px",
    borderRadius: "4px",
  };
  // 行是透明 hairline 组,badge 直接坐在页面底上:原 surface-2 与页面底同色不可辨,改 L1 surface。
  if (s === "posted") return { ...base, background: "var(--v5-surface)", color: "var(--v5-ink-3)" };
  if (s === "pending")
    return { ...base, background: "color-mix(in srgb, var(--v5-warning) 15%, transparent)", color: "var(--v5-warning)" };
  return { ...base, background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)", color: "var(--v5-brand-2)" };
}
const memoStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
const timeStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-4)" };
function amountStyle(amount: number): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 600,
    color: amount >= 0 ? "var(--v5-brand)" : "var(--v5-brand-2)",
    fontVariantNumeric: "tabular-nums",
  };
}
const balanceAfterStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-4)" };
const footerStyle: CSSProperties = {
  margin: "12px 24px 24px",
  textAlign: "center",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.625,
};

import GlassSegments from "@/components/glass-segments.vue";
const tabOptions = computed(() => TABS.map(value => ({ value, label: tabLabel(value) })));
</script>
