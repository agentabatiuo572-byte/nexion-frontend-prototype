<!--
  Receipts — ported from Nexion-prototype/app/(main)/me/receipts/page.tsx.
  Remote mode separates Proof-of-Compute from VietQR top-up receipts and keeps
  loading, error, empty, and pagination state scoped to the selected kind.
  Local fallback is a Proof-of-Compute receipt list with horizontally-scrollable
  category tabs (All / IG / VG / LL / FT / EM / SP / KY), a clear-all action,
  and a month-agnostic row list that opens the ReceiptModal detail.
  clear →
  confirm() (destructive). Long-press a row copies its signature (uni.
  setClipboardData, P-028). SetPageHeader → SubPageHeader. Wrapped in
  <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="remoteReceiptsMode ? remoteReceiptTitle : t.receipt.title" />

      <view v-if="remoteReceiptsMode" style="margin: 0 16px">
        <!-- 推理收据／充值收据是互斥类型切换(选一个另一个必然取消),不是可多选的开关。
             role="button" + aria-pressed 会让浏览器按「切换按钮/复选框」朗读 —— 用户以为能两个都选。
             改成 tablist/tab + aria-selected,与页面本身的"类型切换"语义一致。 -->
        <view class="flex items-center" :style="remoteTabsRowStyle" role="tablist" :aria-label="t.receipt.kindGroupLabel">
          <view
            v-for="(kind, kindIndex) in REMOTE_RECEIPT_KINDS"
            :key="kind"
            class="flex-1 grid place-items-center active:opacity-70"
            :style="remoteTabStyle(kind)"
            role="tab"
            :tabindex="remoteReceiptKind === kind ? 0 : -1"
            :aria-label="remoteReceiptKindLabel(kind)"
            :aria-selected="remoteReceiptKind === kind ? 'true' : 'false'"
            @click="selectRemoteReceiptKind(kind)"



            @keydown.enter.prevent="selectRemoteReceiptKind(kind)" @keydown.space.prevent="selectRemoteReceiptKind(kind)" @keydown.left.prevent="moveRemoteReceiptKind(kindIndex, -1)" @keydown.right.prevent="moveRemoteReceiptKind(kindIndex, 1)"
          >
            <text :style="remoteTabLabelStyle(kind)">{{ remoteReceiptKindLabel(kind) }}</text>
          </view>
        </view>
        <EmptyState
          v-if="showRemoteReceiptInitialError"
          kind="recoverable-error"
          :title="t.empty.errorTitle"
          :desc="t.empty.errorDesc"
          :cta-label="t.empty.errorCta"
          emphasis
          @cta="retryRemoteReceipts"
        />
        <EmptyState v-else-if="!remoteReceiptLoading && remoteReceiptItems.length === 0" kind="empty-list" :title="remoteReceiptEmptyTitle" :desc="remoteReceiptEmptyHint" />
        <view v-else :style="listStyle">
          <template v-if="remoteReceiptKind === 'compute'">
            <view
              v-for="r in remoteComputeReceiptItems"
              :key="`compute:${r.receiptNo}`"
              class="flex items-center active:opacity-80"
              :style="rowStyle(0)"
              role="button"
              tabindex="0"
              @click.stop="openRemoteComputeReceipt(r)"

              @keydown.enter.stop.prevent="openRemoteComputeReceipt(r)" @keydown.space.stop.prevent="openRemoteComputeReceipt(r)"
            >
              <view class="flex-1 min-w-0">
                <text class="block truncate" :style="rowTitleStyle">{{ r.receiptNo }}</text>
                <text class="block truncate" :style="rowSubStyle">{{ t.receipt.computeTitle }} · {{ r.model }}</text>
              </view>
              <view class="text-right shrink-0" style="margin-left: 8px">
                <text class="block tabular-nums" :style="remoteAmountStyle">+${{ r.rewardUsdt.toFixed(3) }}</text>
                <text class="block" :style="rowDateStyle">{{ shortDate(r.completedAt) }}</text>
              </view>
            </view>
          </template>
          <template v-if="remoteReceiptKind === 'deposit'">
            <view v-for="r in remoteVietQrReceiptItems" :key="r.receiptNo" class="flex items-center" :style="rowStyle(0)">
              <view class="flex-1 min-w-0">
                <text class="block truncate" :style="rowTitleStyle">{{ r.receiptNo }}</text>
                <text class="block truncate" :style="rowSubStyle">{{ r.intentNo }} · {{ remoteReceiptStatus(r) }}</text>
              </view>
              <view class="text-right shrink-0" style="margin-left: 8px">
                <text class="block tabular-nums" :style="remoteReceiptAmountStyle(r)">{{ remoteReceiptAmount(r) }}</text>
                <text class="block" :style="rowDateStyle">{{ shortDate(Date.parse(r.createdAt)) }}</text>
              </view>
            </view>
          </template>
        </view>
        <view
          v-if="showRemoteReceiptInlineError"
          class="flex items-center justify-center active:opacity-70"
          style="min-height: 44px; margin: 8px 0"
          role="button"
          tabindex="0"
          :aria-label="t.empty.errorCta"
          @click="retryRemoteReceipts"

          @keydown.enter.stop.prevent="retryRemoteReceipts" @keydown.space.stop.prevent="retryRemoteReceipts"
        >
          <text :style="rowSubStyle">{{ t.empty.errorDesc }} · {{ t.empty.errorCta }}</text>
        </view>
        <view
          v-if="remoteReceiptHasMore"
          class="grid place-items-center active:opacity-70"
          style="min-height: 44px; margin: 8px 0 16px"
          role="button"
          tabindex="0"
          :aria-disabled="remoteMoreLoading"
          @click="loadSelectedMoreRemoteReceipts"

          @keydown.enter.stop.prevent="loadSelectedMoreRemoteReceipts" @keydown.space.stop.prevent="loadSelectedMoreRemoteReceipts"
        >
          <text :style="rowSubStyle">{{ remoteMoreLoading ? "…" : t.receipt.loadMore }}</text>
        </view>
      </view>

      <!-- Tabs + clear-all -->
      <view v-if="!remoteReceiptsMode" class="flex items-center" :style="tabsRowStyle">
        <GlassSegments :label="t.receipt.categoryGroupLabel" v-model="tab" :options="categoryOptions" layout="scroll" class="flex-1 min-w-0"  />
        <view v-if="receipts.length > 0" class="grid place-items-center shrink-0 active:opacity-70" :style="clearBtnStyle" role="button" tabindex="0" :aria-label="t.receipt.clearAll" @click="handleClearAll" @keydown.enter.prevent="handleClearAll" @keydown.space.prevent="handleClearAll">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
        </view>
      </view>

      <!-- Empty -->
      <EmptyState v-if="!remoteReceiptsMode && filtered.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" />

      <!-- List -->
      <view v-else-if="!remoteReceiptsMode" :style="listStyle">
        <view
          v-for="(r, i) in visibleReceipts"
          :key="`${r.signature}-${i}`"
          class="flex items-center active:opacity-80"
          :style="rowStyle(i)"
          role="button"
          tabindex="0"
          :aria-label="`${r.model} ${typeLabel(r)}`"
          @click="open = r"

          @keydown.enter.prevent="open = r" @keydown.space.prevent="open = r"
          @longpress="copySig(r)"
        >
          <view class="grid place-items-center shrink-0" :style="rowIconStyle(r)">
            <ReceiptCatIcon :category="r.category" :color="r.category === 'KY' ? 'var(--v5-brand-2)' : 'var(--v5-brand)'" />
          </view>
          <view class="flex-1 min-w-0">
            <view class="truncate" :style="rowTitleStyle">
              <text>{{ r.model }}</text>
              <text style="color: var(--v5-ink-4); margin: 0 4px">·</text>
              <text style="color: var(--v5-ink-3)">{{ typeLabel(r) }}</text>
            </view>
            <view class="truncate" :style="rowSubStyle">
              <text>{{ r.client }}</text>
              <text style="color: var(--v5-ink-4); margin: 0 4px">·</text>
              <text class="font-mono-tabular tabular-nums">#{{ r.id }}</text>
            </view>
          </view>
          <view class="text-right shrink-0" style="margin-left: 8px">
            <text class="block tabular-nums" :style="rowAmountStyle(r)">{{ rowAmount(r) }}</text>
            <text class="block" :style="rowDateStyle">{{ shortDate(r.settledAt) }}</text>
          </view>
        </view>
      </view>

      <!-- Always mounted (even while empty) so the observer below attaches at
           first mount rather than missing it if this tab starts with 0 items. -->
      <view v-if="!remoteReceiptsMode" ref="loadMoreSentinel" style="height: 1px" />

      <text v-if="!remoteReceiptsMode" class="block" :style="footerStyle">{{ t.receipt.footerNote }}</text>

      <ReceiptModal :receipt="open" @close="open = null" />
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watchEffect, watch, onUnmounted, type CSSProperties } from "vue";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import ReceiptCatIcon from "@/components/me/receipt-cat-icon.vue";
import ReceiptModal from "@/components/me/receipt-modal.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { workloadLabel } from "@/lib/workload-label";
import { useReceipts, filterByCategory } from "@/store/receipts";
import type { Receipt, ReceiptCategory } from "@/mock/receipt";
import { confirm, toast } from "@/store/ui";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";
import { remoteApiEnabled, taskAssignmentApi } from "@/api/runtime";
import type { CanonicalComputeReceipt, CanonicalComputeReceiptSummary } from "@/api/task-assignment-api";
import { useDeposits, type ServerReceiptListItem } from "@/store/deposits";
import { useApp } from "@/store/app";

import { presentVietQrReceipt } from "@/lib/vietqr-receipt-presentation";
import { createReceiptsPageRequestFence } from "./receipts-page-request-fence";
import { canLoadRemoteComputeMore } from "./receipts-page-pagination";

type Tab = "ALL" | ReceiptCategory;
type RemoteReceiptKind = "compute" | "deposit";
const TAB_ORDER: Tab[] = ["ALL", "IG", "VG", "LL", "FT", "EM", "SP", "KY"];
const REMOTE_RECEIPT_KINDS: RemoteReceiptKind[] = ["compute", "deposit"];
// One screen's worth per load — reduces initial render + (future) server load.
const PAGE_SIZE = 10;

const t = useT();
const app = useApp();
const depositsStore = useDeposits();
const receiptsPageFence = createReceiptsPageRequestFence(
  () => app.accountKey,
  () => app.accountBindingEpoch,
);
// Remote mode owns the entire receipt surface. Never construct
// the local store in a remote session: its setup reads account-scoped localStorage.
const remoteReceiptsMode = remoteApiEnabled;
const remoteReceiptKind = ref<RemoteReceiptKind>("compute");
const remoteComputeReceiptItems = ref<CanonicalComputeReceiptSummary[]>([]);
const remoteComputeReceiptNextOffset = ref<number | null>(null);
const remoteComputeReceiptNextCursor = ref<string | null>(null);
const remoteComputeReceiptLoading = ref(remoteReceiptsMode);
const remoteComputeInitialLoading = ref(remoteReceiptsMode);
const remoteComputeReceiptStatus = ref<"loading" | "ready" | "error">(
  remoteReceiptsMode ? "loading" : "ready",
);
const failedComputeReceiptRequest = ref<{ offset: number; cursor: string | null; append: boolean } | null>(null);
const remoteComputeMoreLoading = ref(false);
const remoteDepositMoreLoading = ref(false);
const remoteVietQrReceiptItems = computed<ServerReceiptListItem[]>(() => depositsStore.remoteReceipts);
const remoteVietQrInitialLoading = computed(() => depositsStore.remoteReceiptInitialStatus === "loading");
const remoteReceiptItems = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeReceiptItems.value
  : remoteVietQrReceiptItems.value);
const remoteReceiptLoading = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeReceiptLoading.value
  : remoteVietQrInitialLoading.value);
const remoteReceiptInitialStatus = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeReceiptStatus.value
  : depositsStore.remoteReceiptInitialStatus);
const remoteReceiptMoreStatus = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeReceiptStatus.value
  : depositsStore.remoteReceiptMoreStatus);
const remoteMoreLoading = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeMoreLoading.value
  : remoteDepositMoreLoading.value);
const remoteReceiptHasMore = computed(() => remoteReceiptKind.value === "compute"
  ? remoteComputeReceiptNextCursor.value !== null || remoteComputeReceiptNextOffset.value !== null
  : depositsStore.remoteReceiptNextOffset !== null);
const showRemoteReceiptInitialError = computed(() => remoteReceiptInitialStatus.value === "error" && remoteReceiptItems.value.length === 0);
const showRemoteReceiptInlineError = computed(() => remoteReceiptMoreStatus.value === "error" && remoteReceiptItems.value.length > 0);
const remoteReceiptTitle = computed(() => remoteReceiptKind.value === "compute"
  ? t.value.receipt.computeTitle
  : t.value.receipt.depositTitle);
const remoteReceiptEmptyTitle = computed(() => remoteReceiptKind.value === "compute"
  ? t.value.receipt.computeEmptyTitle
  : t.value.receipt.depositEmptyTitle);
const remoteReceiptEmptyHint = computed(() => remoteReceiptKind.value === "compute"
  ? t.value.receipt.computeEmptyHint
  : t.value.receipt.depositEmptyHint);
const receiptsStore = remoteReceiptsMode ? null : useReceipts();
const tab = ref<Tab>("ALL");
const open = ref<Receipt | CanonicalComputeReceipt | null>(null);
let receiptRequestEpoch = 0;
const visibleCount = ref(PAGE_SIZE);
watch(tab, () => { visibleCount.value = PAGE_SIZE; });

const receipts = computed(() => receiptsStore?.receipts ?? []);
const filtered = computed(() => filterByCategory(receipts.value, tab.value));
const visibleReceipts = computed(() => filtered.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < filtered.value.length);

function remoteReceiptAmount(receipt: ServerReceiptListItem): string {
  return presentVietQrReceipt(receipt.status, receipt.creditedUsdt).amountText;
}

function remoteReceiptStatus(receipt: ServerReceiptListItem): string {
  const presentation = presentVietQrReceipt(receipt.status, receipt.creditedUsdt);
  return t.value.receipt.vietQrStatus[presentation.statusKey];
}

function remoteReceiptAmountStyle(receipt: ServerReceiptListItem): CSSProperties {
  const presentation = presentVietQrReceipt(receipt.status, receipt.creditedUsdt);
  return {
    ...remoteAmountStyle,
    color: presentation.credited ? "var(--v5-brand-2)" : "var(--v5-ink-3)",
  };
}

let receiptPageRequestEpoch = 0;
async function loadRemoteComputeReceipts(offset: number, append: boolean, cursor: string | null = null): Promise<void> {
  if (!remoteReceiptsMode || !receiptsPageFence.isVisible()) return;
  const requestEpoch = ++receiptPageRequestEpoch;
  const requestScope = receiptsPageFence.capture("compute");
  const expectedAccountKey = app.accountKey;
  const expectedBindingEpoch = app.accountBindingEpoch;
  if (!append) {
    remoteComputeInitialLoading.value = true;
    remoteComputeReceiptNextOffset.value = null;
    remoteComputeReceiptNextCursor.value = null;
  }
  remoteComputeReceiptLoading.value = true;
  remoteComputeReceiptStatus.value = "loading";
  failedComputeReceiptRequest.value = null;
  try {
    const page = await taskAssignmentApi.receipts(offset, 20, cursor);
    if (requestEpoch !== receiptPageRequestEpoch
      || !receiptsPageFence.isCurrent(requestScope)
      || expectedAccountKey !== app.accountKey
      || expectedBindingEpoch !== app.accountBindingEpoch) return;
    if (append && cursor !== null && page.nextCursor === cursor) {
      throw new Error("TASK_RECEIPT_CURSOR_NOT_ADVANCING");
    }
    remoteComputeReceiptItems.value = append
      ? [...remoteComputeReceiptItems.value, ...page.items]
      : page.items;
    remoteComputeReceiptNextOffset.value = page.nextOffset;
    remoteComputeReceiptNextCursor.value = page.nextCursor;
    remoteComputeReceiptStatus.value = "ready";
  } catch {
    if (requestEpoch === receiptPageRequestEpoch
      && receiptsPageFence.isCurrent(requestScope)
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) {
      failedComputeReceiptRequest.value = { offset, cursor, append };
      remoteComputeReceiptStatus.value = "error";
      toast.error(t.value.wallet.receiptsUnavailableTitle, t.value.wallet.receiptsUnavailableBody);
    }
  } finally {
    if (requestEpoch === receiptPageRequestEpoch
      && receiptsPageFence.isCurrent(requestScope)
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) {
        remoteComputeReceiptLoading.value = false;
        if (!append) remoteComputeInitialLoading.value = false;
      }
  }
}

async function loadSelectedMoreRemoteReceipts(): Promise<void> {
  if (!remoteReceiptsMode || remoteMoreLoading.value || !receiptsPageFence.isVisible()) return;
  if (remoteReceiptKind.value === "compute") {
    if (!canLoadRemoteComputeMore({
      initialLoading: remoteComputeInitialLoading.value,
      moreLoading: remoteComputeMoreLoading.value,
      nextOffset: remoteComputeReceiptNextOffset.value,
      nextCursor: remoteComputeReceiptNextCursor.value,
    })) return;
    const cursor = remoteComputeReceiptNextCursor.value;
    const offset = remoteComputeReceiptNextOffset.value;
    if (offset === null && cursor === null) return;
    const requestScope = receiptsPageFence.capture("compute-more");
    remoteComputeMoreLoading.value = true;
    try {
      await loadRemoteComputeReceipts(offset ?? 0, true, cursor);
    } finally {
      if (receiptsPageFence.isCurrent(requestScope)) remoteComputeMoreLoading.value = false;
    }
    return;
  }
  if (depositsStore.remoteReceiptNextOffset === null) return;
  const requestScope = receiptsPageFence.capture("deposit-more");
  remoteDepositMoreLoading.value = true;
  try {
    await depositsStore.loadMoreRemoteVietQrReceipts();
  } finally {
    if (receiptsPageFence.isCurrent(requestScope)) remoteDepositMoreLoading.value = false;
  }
}

function retryRemoteReceipts(): void {
  if (remoteReceiptKind.value === "compute" && remoteComputeReceiptStatus.value === "error") {
    const failed = failedComputeReceiptRequest.value ?? { offset: 0, cursor: null, append: false };
    if (failed.append) void loadSelectedMoreRemoteReceipts();
    else void loadRemoteComputeReceipts(failed.offset, false, failed.cursor);
    return;
  }
  if (remoteReceiptKind.value === "deposit" && depositsStore.remoteReceiptInitialStatus === "error") {
    void depositsStore.refreshRemoteVietQrDeposits();
    return;
  }
  if (remoteReceiptKind.value === "deposit" && depositsStore.remoteReceiptMoreStatus === "error") {
    void loadSelectedMoreRemoteReceipts();
  }
}

function loadSelectedRemoteReceipts(): void {
  if (!remoteReceiptsMode || !receiptsPageFence.isVisible()) return;
  if (remoteReceiptKind.value === "compute") {
    void loadRemoteComputeReceipts(0, false);
    return;
  }
  void depositsStore.refreshRemoteVietQrDeposits();
}

function selectRemoteReceiptKind(kind: RemoteReceiptKind): void {
  if (remoteReceiptKind.value === kind) return;
  invalidateRemoteReceiptsPage();
  remoteReceiptKind.value = kind;
  loadSelectedRemoteReceipts();
}
/** roving tabindex 的标准行为:左右方向键移一格并选上,焦点跟到新选中项。 */
function moveRemoteReceiptKind(index: number, delta: number): void {
  const next = REMOTE_RECEIPT_KINDS[(index + delta + REMOTE_RECEIPT_KINDS.length) % REMOTE_RECEIPT_KINDS.length];
  if (!next) return;
  selectRemoteReceiptKind(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
}

async function openRemoteComputeReceipt(task: CanonicalComputeReceiptSummary): Promise<void> {
  if (!remoteReceiptsMode || !receiptsPageFence.isVisible()) return;
  const requestEpoch = ++receiptRequestEpoch;
  const requestScope = receiptsPageFence.capture("detail");
  const expectedAccountKey = app.accountKey;
  const expectedBindingEpoch = app.accountBindingEpoch;
  try {
    const detail = await taskAssignmentApi.receipt(task.receiptNo);
    if (requestEpoch === receiptRequestEpoch
      && receiptsPageFence.isCurrent(requestScope)
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) open.value = detail;
  } catch {
    if (requestEpoch === receiptRequestEpoch
      && receiptsPageFence.isCurrent(requestScope)
      && expectedAccountKey === app.accountKey
      && expectedBindingEpoch === app.accountBindingEpoch) {
      toast.error(t.value.wallet.receiptsUnavailableTitle, t.value.wallet.receiptsUnavailableBody);
    }
  }
}

watch(
  () => [app.accountKey, app.accountBindingEpoch] as const,
  () => {
    if (!remoteReceiptsMode) return;
    invalidateRemoteReceiptsPage();
    remoteComputeReceiptItems.value = [];
    remoteComputeReceiptNextOffset.value = null;
    remoteComputeReceiptNextCursor.value = null;
    if (receiptsPageFence.isVisible()) refreshRemoteReceiptsPage();
  },
  { immediate: true },
);

function invalidateRemoteReceiptsPage(): void {
  receiptRequestEpoch += 1;
  receiptPageRequestEpoch += 1;
  receiptsPageFence.invalidate();
  remoteComputeMoreLoading.value = false;
  remoteDepositMoreLoading.value = false;
  remoteComputeReceiptLoading.value = false;
  remoteComputeInitialLoading.value = false;
  remoteComputeReceiptStatus.value = remoteReceiptsMode ? "loading" : "ready";
  failedComputeReceiptRequest.value = null;
  open.value = null;
  depositsStore.invalidateRemoteVietQrReceiptReads();
}

function refreshRemoteReceiptsPage(): void {
  loadSelectedRemoteReceipts();
}

onLoad((options) => {
  remoteReceiptKind.value = options?.kind === "deposit" ? "deposit" : "compute";
});

onShow(() => {
  if (!remoteReceiptsMode) return;
  receiptsPageFence.show();
  loadSelectedRemoteReceipts();
});

onHide(() => {
  if (!remoteReceiptsMode) return;
  receiptsPageFence.hide();
  invalidateRemoteReceiptsPage();
});

onUnmounted(() => {
  if (!remoteReceiptsMode) return;
  receiptsPageFence.hide();
  invalidateRemoteReceiptsPage();
});

// Sentinel row (always mounted so the observer attaches from the start —
// hasMore can flip true later as receipts arrive) sits at the list end;
// watchEffect re-checks on every dependency change, not just inView flips,
// so a tab/data change that leaves the sentinel already in view still loads.
// ponytail: on a viewport tall enough to fit >1 page of rows, this can load
// several pages back-to-back before the sentinel actually scrolls out of
// view (Vue's reactive re-run can outrun the browser's next real
// intersection check). Harmless on real phone viewports (one page ≈ one
// screen); if a very tall/tablet viewport needs a hard one-page-per-scroll
// cap, gate the bump behind a nextTick() + rAF pair before re-checking.
// ponytail: useScrollGrowProgress falls back to inView=true when
// IntersectionObserver is unavailable (its other 20 call sites are cosmetic
// scroll-in animations, where "show the final state" is a safe default) —
// here that fallback means pagination silently no-ops and every matching
// receipt renders at once instead of erroring. Modern App-webview targets
// (WKWebView/Android System WebView) support IntersectionObserver, so this
// should stay latent; if it ever fires for real, the fix is a local
// capability check in this file, not changing the shared composable's
// default for its other 20 cosmetic consumers.
const { elRef: loadMoreSentinel, inView: loadMoreInView } = useScrollGrowProgress({ threshold: 0 });
watchEffect(() => {
  if (loadMoreInView.value && hasMore.value) {
    visibleCount.value = Math.min(filtered.value.length, visibleCount.value + PAGE_SIZE);
  }
});

const counts = computed<Record<Tab, number>>(() => {
  const c: Record<Tab, number> = { ALL: receipts.value.length, IG: 0, VG: 0, LL: 0, FT: 0, EM: 0, SP: 0, KY: 0 };
  for (const r of receipts.value) c[r.category] += 1;
  return c;
});

/** roving tabindex 的标准行为:左右方向键移一格并选上,焦点跟到新选中项。 */
function moveCategoryTab(index: number, delta: number): void {
  const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length];
  if (!next) return;
  tab.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
}

function tabLabel(c: Tab): string {
  const map: Record<Tab, string> = {
    ALL: t.value.receipt.tabAll,
    IG: t.value.receipt.catIG,
    VG: t.value.receipt.catVG,
    LL: t.value.receipt.catLL,
    FT: t.value.receipt.catFT,
    EM: t.value.receipt.catEM,
    SP: t.value.receipt.catSP,
    KY: t.value.receipt.catKY,
  };
  return map[c];
}

function remoteReceiptKindLabel(kind: RemoteReceiptKind): string {
  return kind === "compute" ? t.value.receipt.computeTab : t.value.receipt.depositTab;
}

async function handleClearAll() {
  const ok = await confirm({
    title: t.value.receipt.clearAll,
    message: t.value.receipt.clearConfirm,
    danger: true,
    icon: "danger",
  });
  if (ok) {
    const n = receipts.value.length;
    receiptsStore?.clear();
    toast.success(t.value.receipt.clearAll, fmt(t.value.receipt.clearedToast, { n }));
  }
}

// Receipts persist, so the baked English `r.type` is resolved from `category`
// at render instead — see lib/workload-label.ts.
function typeLabel(r: Receipt): string {
  return workloadLabel(t.value, r.category);
}

function copySig(r: Receipt) {
  uni.setClipboardData({ data: r.signature, showToast: false, fail: () => {} });
  toast.success(t.value.receipt.sigCopied, r.signature.substring(0, 16) + "...");
}

function rowAmount(r: Receipt): string {
  return r.category === "KY" ? `✓ ${r.netPaid.toFixed(2)}` : `+${r.netPaid.toFixed(4)}`;
}
function shortDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── styles ──
const tabsRowStyle: CSSProperties = { margin: "0 16px 12px", gap: "8px" };
const remoteTabsRowStyle: CSSProperties = { marginBottom: "12px", gap: "8px" };
function remoteTabStyle(kind: RemoteReceiptKind): CSSProperties {
  const selected = remoteReceiptKind.value === kind;
  return {
    minHeight: "40px",
    borderRadius: "999px",
    background: selected ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)" : "var(--v5-surface)",
  };
}
function remoteTabLabelStyle(kind: RemoteReceiptKind): CSSProperties {
  return {
    fontSize: "13px",
    fontWeight: 500,
    color: remoteReceiptKind.value === kind ? "var(--v5-brand)" : "var(--v5-ink-3)",
  };
}
function tabPillStyle(c: Tab): CSSProperties {
  const on = tab.value === c;
  // Filter chip — filled tint (active) vs L1 surface (idle), no border: the fill
  // + text color is the single visual difference (V5 chip idiom).
  return {
    height: "44px",
    padding: "0 16px",
    borderRadius: "999px",
    gap: "4px",
    // 未选中原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),胶囊直接坐在页面底上 → 改 L1
    background: on ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)" : "var(--v5-surface)",
  };
}
function tabLabelStyle(c: Tab): CSSProperties {
  const on = tab.value === c;
  return { fontSize: "12px", fontWeight: 500, color: on ? "var(--v5-brand)" : "var(--v5-ink-3)" };
}
const tabCountStyle: CSSProperties = { fontSize: "12px", opacity: 0.7 };
const clearBtnStyle: CSSProperties = { width: "44px", height: "44px", borderRadius: "999px" };

// Empty state — dashed outline hint, no fill (V5 empty-state idiom).
const emptyStyle: CSSProperties = {
  margin: "0 16px",
  border: "1px dashed var(--v5-border-strong)",
  borderRadius: "16px",
  padding: "32px",
  textAlign: "center",
};
const emptyTitleStyle: CSSProperties = { marginTop: "12px", fontSize: "13px", color: "var(--v5-ink-2)" };
const emptyHintStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };

// De-carded: transparent hairline group (earnings-ledger idiom). The surface +
// outer border was redundant boundary weight — rows are already hairline-split.
// border-top opens the group; 2px optical inset aligns rows under the gutter.
const listStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function rowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "13px 0",
    borderBottom: i < visibleReceipts.value.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
function rowIconStyle(r: Receipt): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    background:
      r.category === "KY"
        ? "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)"
        : "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
  };
}
const rowTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const rowSubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
function rowAmountStyle(r: Receipt): CSSProperties {
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "13px",
    fontWeight: 600,
    color: r.category === "KY" ? "var(--v5-brand-2)" : "var(--v5-brand)",
  };
}
const rowDateStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-4)" };
const remoteAmountStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-brand-2)",
};
const footerStyle: CSSProperties = {
  margin: "16px 24px 24px",
  textAlign: "center",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.625,
};

import GlassSegments from "@/components/glass-segments.vue";
const categoryOptions = computed(() => TAB_ORDER.map(value => ({ value, label: tabLabel(value), count: counts.value[value] || undefined })));
</script>
