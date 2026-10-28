<!--
  AppChassis — page shell (uni has no root layout / App.vue renders no template,
  P-004). Route-aware like the prototype's root layout (header.tsx + tab-bar.tsx):
    · TAB routes (home/earn/store/team/me): brand row (N badge + UVEL/title +
      search + bell-badge) + FLOATING frosted-glass pill TabBar (5 tabs, active =
      sliding refractive lens) + home indicator.
    · SUB routes (everything else): NO brand row + NO 5-tab pill (the page carries
      its own in-page back/title row); only the status bar + home indicator. This
      keeps all ~56 sub-pages correct with zero per-page edits.
  Route is read from getCurrentPages() so the chassis self-detects mode; the
  `active` prop is an optional fallback for the very first frame.
-->
<template>
  <view v-bind="$attrs" :id="chassisHostId" class="nx-chassis" :data-tab-key="tabHost ? tabLocationKey : undefined" :data-tab-revision="tabHost ? tabRevision : undefined" :data-page-visible="pageVisible && hostVisible ? 'true' : 'false'" style="background: var(--v5-bg)" :chrome-config="chromeConfiguration" :change:chrome-config="chromeView.update">
    <view class="nx-top-chrome" :style="{ height: statusBarHeight + 'px' }" />

    <!-- Status bar safe area (real on device, ~0 on desktop H5) -->
    <DeviceStatusBar />

    <!-- Header brand row — TAB routes only (sub-pages carry their own back row) -->
    <view v-if="isTabRoute" class="nx-header" :style="{ top: statusBarHeight + 'px' }">
      <view class="nx-header__l">
        <BrandLockup :height="50" style="width:100%;height:100%" />
      </view>
      <view class="nx-header__center" />
      <view class="nx-header__r">
        <template v-if="activeTab === 'me'">
          <!-- #ifdef APP-PLUS -->
          <InviteScanEntry icon-only :label="t.me.shortcutLabels.scan" data-header-action="scan">
            <LiquidGlass :radius="22" tone="control" backdrop=".nx-page-enter" />
            <view class="nx-header-scan-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3m-8 0H5a2 2 0 0 1-2-2v-3M3 12h18" /></svg></view>
          </InviteScanEntry>
          <!-- #endif -->
          <!-- #ifndef APP-PLUS -->
          <view class="nx-icon-btn nx-design-glass" data-header-action="scan" role="button" tabindex="0" :aria-label="t.me.shortcutLabels.scan" @click="toast.info(t.me.scanAppOnly)" @keydown.enter.prevent="toast.info(t.me.scanAppOnly)" @keydown.space.prevent="toast.info(t.me.scanAppOnly)">
            <LiquidGlass :radius="22" tone="control" backdrop=".nx-page-enter" />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3m-8 0H5a2 2 0 0 1-2-2v-3M3 12h18" /></svg>
          </view>
          <!-- #endif -->
        </template>
        <view v-else class="nx-icon-btn nx-design-glass" role="button" tabindex="0" :aria-label="t.headerTitles.search" @click="goSearch"  @keydown.enter.prevent="onKeyboardActivate($event, goSearch)" @keydown.space.prevent="onKeyboardActivate($event, goSearch)">
          <LiquidGlass :radius="22" tone="control" backdrop=".nx-page-enter" />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </view>
	        <view class="nx-icon-btn nx-bell nx-design-glass" role="button" tabindex="0" :aria-label="unread !== null && unread > 0 ? t.notifs.drawerTitle + ' · ' + unreadLabel : unread === null ? t.notifs.drawerTitle + ' · ' + t.notifs.unreadUnavailable : t.notifs.drawerTitle" @click="goNotifications"  @keydown.enter.prevent="onKeyboardActivate($event, goNotifications)" @keydown.space.prevent="onKeyboardActivate($event, goNotifications)">
          <LiquidGlass :radius="22" tone="control" backdrop=".nx-page-enter" />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <view v-if="unread !== null && unread > 0" class="nx-badge"><text class="nx-badge__t">{{ unreadLabel }}</text></view>
        </view>
      </view>
    </view>

    <!-- Registered sub-page header: round glass controls stay available while
         the bare title hides as content scrolls into the reserved header gap. -->
    <view v-if="!isTabRoute && navHeader" class="nx-navheader" :class="{ 'nx-navheader--capsule': navCapsule }" :style="{ top: statusBarHeight + 'px', height: navHeaderH + 'px' }">
      <LiquidGlass v-if="navCapsule" :radius="navHeaderH / 2" tone="navigation" backdrop=".nx-page-enter" />
      <view class="nx-nav-side" role="button" tabindex="0" :aria-label="t.privacy.back" @click="navBack"  @keydown.enter.prevent="onKeyboardActivate($event, navBack)" @keydown.space.prevent="onKeyboardActivate($event, navBack)">
        <view class="nx-nav-glass">
          <LiquidGlass v-if="!navCapsule" :radius="18" tone="navigation" backdrop=".nx-page-enter" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </view>
      </view>
      <view class="nx-nav-titlewrap" :data-persistent="navCapsule ? 'true' : undefined">
        <text class="nx-nav-title">{{ navHeader.title }}</text>
        <text v-if="navHeader.subtitle" class="nx-nav-sub">{{ navHeader.subtitle }}</text>
      </view>
	      <view class="nx-nav-side" role="button" tabindex="0" :aria-label="unread !== null && unread > 0 ? t.notifs.drawerTitle + ' · ' + unreadLabel : unread === null ? t.notifs.drawerTitle + ' · ' + t.notifs.unreadUnavailable : t.notifs.drawerTitle" @click="goNotifications"  @keydown.enter.prevent="onKeyboardActivate($event, goNotifications)" @keydown.space.prevent="onKeyboardActivate($event, goNotifications)">
        <view class="nx-nav-glass">
          <LiquidGlass v-if="!navCapsule" :radius="18" tone="navigation" backdrop=".nx-page-enter" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <view v-if="unread !== null && unread > 0" class="nx-nav-belldot" />
        </view>
      </view>
    </view>

    <!-- Scrollable content — a plain overflow:auto <view> (NOT <scroll-view>):
         uni's <scroll-view> renders on its own compositing layer, which makes
         the fixed chrome's backdrop-filter unable to frost the scrolled content
         (P-039) → chrome looks flat/opaque. A normal overflow:auto view shares
         the paint surface (exactly what the prototype's `absolute inset-0
         overflow-y-auto` div does) so the frosted glass renders. Pull-to-refresh
         is the prototype's own touch-gesture port (themed brand spinner). -->
    <view
      ref="scrollEl"
      class="nx-content nx-scroll"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!-- themed pull-to-refresh indicator — anchored just below the header,
           centered in the pull gap. -->
      <view
        class="nx-refresher"
        :style="{ top: contentTop + 'px', transform: `translate(-50%, ${indicatorY / 2 - 18}px)`, opacity: refresherVisible ? 1 : 0, transition: pulling ? 'opacity .15s' : 'transform .28s cubic-bezier(.16,1,.3,1), opacity .2s' }"
      >
        <view class="nx-refresher-icon" :class="{ 'nx-spinning': refreshing }" :style="{ transform: refreshing ? '' : `rotate(${Math.min(1, pullY / 70) * 270}deg)` }">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-6.2-8.5" stroke="var(--v5-brand)" stroke-width="2.4" stroke-linecap="round" /><path d="M21 3v6h-6" stroke="var(--v5-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </view>
      </view>
      <!-- pull translate wrapper — transform applies ONLY while pulling/refreshing.
           When idle it MUST carry NO transform: a lingering `translateY(0)`
           promotes this content to its own compositing layer, which the chrome's
           backdrop-filter cannot sample → the frosted glass shows nothing (looks
           opaque). Mirrors the prototype PullableContent ("transform must be
           ABSENT, not translateY(0), when idle"). (P-041) -->
      <view :style="pullActive ? { transform: `translateY(${indicatorY}px)`, transition: pulling ? 'none' : 'transform .28s cubic-bezier(.16,1,.3,1)', willChange: 'transform' } : {}">
        <!-- Padded so content sits BELOW the header / ABOVE the tabbar, while the
             scroll container (.nx-content) spans the FULL chassis (top:0/bottom:0).
             This is the crux: content then scrolls BEHIND the frosted chrome and
             actually gets frosted. With the old top:contentTop inset, .nx-content
             clipped everything above the header so there was nothing behind the
             chrome to frost → it read as solid black. (P-041) `backwards` fill on
             the entrance so no transform lingers. -->
        <view class="nx-page-enter" :class="{ 'nx-page-enter--tab': isTabRoute }" :style="{ paddingTop: (contentTop + pendingBarInset) + 'px', paddingBottom: contentBottom }">
          <slot name="pageTop" />
          <!-- Voucher fallback banner — chassis-injected at content top so the
               5 protected tab pages stay untouched (ALIGNMENT red-line). Self-
               hides unless a claimable voucher targets the current surface. -->
          <slot />
        </view>
      </view>
    </view>

    <slot name="pageFixed" :top="contentTop + pendingBarInset" />

    <!-- Bottom chrome: floating pill TabBar (tab routes) + home indicator (always) -->
    <view class="nx-tabbar-wrap">
      <!-- Anchor to the actual navigation height, including its safe area. -->
      <NovaBubble v-if="showFloatingSupport" :dimmed="scrolling" />
      <GlassSegments v-if="isTabRoute" :key="navigationReset" class="nx-tabbar-pill" variant="navigation" selection="flat" :options="navigationOptions" :model-value="activeTab" :from-value="navigationReset ? undefined : navigationFrom" :navigation-on-arrival="tabHost ? false : undefined" @select="selectNavigation">
        <template #option="{ option: tab, selected }">
          <view class="nx-tab__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              :stroke="selected ? 'var(--v5-brand)' : 'var(--v5-ink-2)'"
              :stroke-width="selected ? 2.3 : 1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="tab.icon" />
              <template v-if="tab.icon2"><path :d="tab.icon2" /></template>
            </svg>
          </view>
        </template>
      </GlassSegments>
      <DeviceHomeIndicator />
    </view>

    <!-- Chassis-level overlays (each self-gates on its own store's open state,
         mirroring the prototype IOSFrame). Ported P-043. -->
    <template v-if="showBusinessOverlays">
      <TrialClaimSheet />
      <VoucherClaimSheet />
      <SlotActionSheet />
      <TradeinSheets />
      <LuckySpinSheet />
      <StickyCtaBar />
      <!-- 待支付浮动条:结算扫码步开出的那笔发票还没付,全站置顶提醒 + 一键回到同一笔。
           自隐藏:无在途会话 / 已过期 / 结算页正在展示它。位置见 pendingBarTop / pendingBarInset。 -->
      <PendingCheckoutBar :top="pendingBarTop" />
    </template>

    <!-- Global overlay host (toast / confirm / netError) -->
    <GlobalUi />
  </view>
</template>

<script setup lang="ts">
import { rememberGlassNavigation, consumeGlassNavigation } from "@/lib/liquid-glass-core";
import { ref, computed, watch, onMounted, onUnmounted, onActivated, nextTick, provide, type CSSProperties, getCurrentInstance } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import BrandLockup from "@/components/brand-lockup.vue";
// #ifdef APP-PLUS
import InviteScanEntry from "@/components/team/invite-scan-entry.vue";
// #endif
import GlobalUi from "@/components/global-ui.vue";
import { toast } from "@/store/ui";
import NovaBubble from "@/components/nova/nova-bubble.vue";
import TrialClaimSheet from "@/components/trial-claim-sheet.vue";
import SlotActionSheet from "@/components/slot-action-sheet.vue";
import StickyCtaBar from "@/components/sticky-cta-bar.vue";
import PendingCheckoutBar from "@/components/pending-checkout-bar.vue";
import TradeinSheets from "@/components/tradein-sheets.vue";
import LuckySpinSheet from "@/components/lucky-spin-sheet.vue";
import VoucherClaimSheet from "@/components/voucher-claim-sheet.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import { useT } from "@/i18n/use-t";
import { useNotifications } from "@/store/notifications";
import { useMessageDrawer } from "@/store/message-drawer";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { useRefresh } from "@/store/refresh";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { usePageHeader } from "@/store/page-header";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useVoucher } from "@/store/voucher";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { usePendingCheckout } from "@/store/pending-checkout";
import { PENDING_BAR_INSET_KEY } from "@/store/pending-checkout-core";
import { usePopupArbiter, type PopupId } from "@/store/popup-arbiter";
import { navBack as navBackTo, navTo } from "@/lib/route";
import { isCurrentNativeTab } from "@/lib/native-tab-navigation";
import { isStaticReviewRoute } from "@/lib/static-review-routes";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { saveScrollPos, getScrollPos, dropScrollPos } from "@/lib/scroll-memory";
import { resolveChassisScrollElement, scrollCurrentTabToTop, scrollNativeCurrentTabToTop } from "@/lib/chassis-scroll";
import { createVoucherPopupScheduler } from "@/lib/voucher-popup-scheduler";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import type { RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { isAcceptanceObservationModalOpen, onAcceptanceObservationModalClosed, onAcceptanceObservationModalOpened } from "@/services/behavior-analytics";

// Uni forwards query parameters such as product `id` through the page root.
// Bind fallthrough attrs explicitly so they cannot replace the view adapter's ID.
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  active?: "home" | "earn" | "store" | "team" | "me";
  logicalRoute?: string;
  tabLocationKey?: string;
  tabHost?: boolean;
  hostVisible?: boolean;
  navCapsule?: boolean;
}>(), { hostVisible: true });

const t = useT();
const notifications = useNotifications();
const messageDrawer = useMessageDrawer();
const refresh = useRefresh();
const trialClaimSheet = useTrialClaimSheet();
const pageHeader = usePageHeader();
const freeTrial = useFreeTrial();
const trialConfig = useTrialConfig();
const voucher = useVoucher();
const voucherClaimSheet = useVoucherClaimSheet();
const pendingCheckout = usePendingCheckout();
const popupArbiter = usePopupArbiter();

type VoucherPopupRequestScope = {
  account: RemoteAccountRequest;
  commerce: RuntimeRevisionScope;
};

function captureVoucherPopupScope(): VoucherPopupRequestScope {
  return { account: captureAccountScope(), commerce: captureRuntimeRevision() };
}

function isCurrentVoucherPopupScope(scope: VoucherPopupRequestScope): boolean {
  return isCurrentAccountScope(scope.account) && isCurrentRuntimeRevision(scope.commerce);
}

let autoPushMounted = false;
const voucherPopupScheduler = createVoucherPopupScheduler<VoucherPopupRequestScope>({
  isHome: () => false, // Marketing is user-initiated from the single home benefit slot.
  isObservationModalOpen: isAcceptanceObservationModalOpen,
  isBlockingSheetOpen: () => popupArbiter.current !== null || popupArbiter.visitClaimed,
  sessionShownCount: () => voucherClaimSheet.sessionShownCount,
  cadence: () => voucher.autoPopupCadence,
  captureScope: captureVoucherPopupScope,
  isCurrentScope: isCurrentVoucherPopupScope,
  tryAutoPush: (options) => {
    if (!popupArbiter.acquire("voucher-claim")) return false;
    const opened = voucherClaimSheet.tryAutoPush({ surface: "home", ...options });
    if (!opened) popupArbiter.release("voucher-claim"); // persist-verdict-ok: 弹层令牌释放(popup-arbiter),void 无判决,非资金 / 落盘原语
    else stopAutoPush();
    return opened;
  },
  markPopupSeen: (voucherId) => voucher.markPopupSeen(voucherId),
});
let stopObservationOpened: (() => void) | null = null;
let stopObservationClosed: (() => void) | null = null;
let stopVoucherRunScope: (() => void) | null = null;

function bindVoucherClaimSheetScope(): void {
  const account = captureAccountScope();
  const commerce = captureRuntimeRevision();
  voucherClaimSheet.bindScope({
    accountKey: account.accountKey,
    accountEpoch: account.epoch,
    runId: commerce.runId,
    runEpoch: commerce.epoch,
  });
}

// ── 首页自动弹层编排(主人 2026-08-16 拍板 A1 / B1 / C1)──────────────────────
// 旧写法是两条各自独立的定时器 + 两两手写 `!对方.open`,优先级只体现为 1300ms 与
// 1500ms 的延迟之差 —— 那是一段 200ms 的赛跑,不是一条规则。实测出的三条缺陷:
//   ① 庆祝浮层对谁都不让,画在领取弹层之上并模糊背景(两两互斥不封闭,加第三个面必漏);
//   ② 资格在挂载那一刻就锁死,而 remote 档下代金券目录是异步拉回来的,那时还是空的
//      → 代金券的定时器根本没排上,试用无人竞争地弹出,漏斗顺序被静默反转;
//   ③ 谁先弹取决于两个延迟数字,改延迟 = 不知情地改掉漏斗顺序。
// 现在:一条安顿定时器 + 一张优先级表(store/popup-arbiter)。到点后按优先级顺序
// 逐个问「你现在够条件吗」,第一个够的拿走令牌。
// 🔴 B1「一次进首页只弹一个」由「只评出一个赢家、评出即停表」自然成立 —— 不另设闩:
//    赢家关掉之后不会再有第二个候选被评,因为表已经停了。
// Marketing sheets open only after an explicit user action.
function stopAutoPush() { voucherPopupScheduler.cancel(); }

// 令牌跟着弹层的真实开合走 —— 从 banner 手动打开的也算占屏,庆祝浮层同样要让路。
// 写成 watch 而不是散在各个关闭路径上:关闭出口有好几个(hide / closeTransient /
// 直接置 open),漏接任何一个都会把令牌永久扣住,之后谁都再弹不出来。
function syncSheetToken(id: PopupId, open: boolean) {
  if (open) popupArbiter.acquire(id);
  else popupArbiter.release(id); // persist-verdict-ok: 弹层令牌释放(popup-arbiter),void 无判决,非资金 / 落盘原语
}
watch(
  [() => voucherClaimSheet.open, () => trialClaimSheet.open],
  ([voucherOpen, trialOpen]) => {
    syncSheetToken("voucher-claim", voucherOpen);
    syncSheetToken("trial-claim", trialOpen);
  },
  { immediate: true },
);

// ── Pull-to-refresh — touch gesture ported from the prototype's PullToRefresh
// (lib/store/refresh + ui/pull-to-refresh.tsx). The plain overflow:auto view
// (see template) needs its own gesture since we dropped <scroll-view>. Only
// fires when scrolled to top + not already refreshing. Brand-themed spinner.
const TRIGGER_PX = 70; // pull distance (damped) needed to fire
const MAX_PX = 110; // visual ceiling
const HOLD_PX = 56; // parked spinner position while loading
const DAMP = 0.5; // iOS-like resistance
const pullY = ref(0);
const pulling = ref(false);
// pullActive gates whether the content wrapper carries a transform at all. It
// stays true during the pull + ~340ms after release (so the spring-back still
// animates) then drops to false → transform removed → chrome backdrop-filter
// can frost the content again. (P-041)
const pullActive = ref(false);
let deactivateTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDeactivate() {
  if (deactivateTimer) clearTimeout(deactivateTimer);
  deactivateTimer = setTimeout(() => {
    if (pullY.value === 0 && !refresh.isRefreshing) pullActive.value = false;
  }, 340);
}
const scrollEl = ref<unknown>(null);
let startY: number | null = null;

const refreshing = computed(() => refresh.isRefreshing);
const indicatorY = computed(() => (refreshing.value ? HOLD_PX : pullY.value));
const refresherVisible = computed(() => refreshing.value || pullY.value > 6);

// H5's uni <view> ref exposes the DOM element via $el. APP-PLUS page logic has
// no document; its ref still serves scroll-memory reads, while writes use evalJS.
function chassisScrollDom(): HTMLElement | null {
  const raw = scrollEl.value as { $el?: HTMLElement } | HTMLElement | null;
  // #ifdef APP-PLUS
  return (raw && typeof raw === "object" && "$el" in raw ? raw.$el : raw) as HTMLElement | null;
  // #endif
  return resolveChassisScrollElement(raw, () => null);
}
function currentScrollTop(): number {
  return chassisScrollDom()?.scrollTop ?? 0;
}

// ── scroll-position restore on back-navigation — uni hides stacked pages with
// display:none (zeroing this inner container's scrollTop) and only auto-restores
// PAGE-level scroll, so every navigateBack used to land the parent page at the
// top. Record continuously, restore on keep-alive re-activation; a fresh mount
// (forward navigation / reLaunch) intentionally starts clean at the top. ──
let scrollMemKey = "";
function pageScrollKey(): string {
  if (props.tabHost) return props.tabLocationKey ?? props.logicalRoute ?? "";
  try {
    const ps = getCurrentPages();
    const top = ps.length ? (ps[ps.length - 1] as { $page?: { fullPath?: string }; route?: string }) : undefined;
    return top?.$page?.fullPath ?? top?.route ?? route.value;
  } catch {
    return route.value;
  }
}
// ── Nova 浮标让路 —— 滚动中淡出,停下再淡回 ──
// 浮标锚定导航上方；滚动时让出正在阅读的内容，停下后淡回。
// 页尾另加空间，确保最后一个操作可以完整滚过浮标。
// 复位靠 debounce 而非 scrollend:后者 Safari / uni webview 都还没有。
const SCROLL_IDLE_MS = 200;
const scrolling = ref(false);
let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
function markScrolling() {
  scrolling.value = true;
  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    scrolling.value = false;
    scrollIdleTimer = null;
  }, SCROLL_IDLE_MS);
}
function onChassisScroll() {
  markScrolling();
  const el = chassisScrollDom();
  if (el) saveScrollPos(scrollMemKey, el.scrollTop);
}
function restoreChassisScroll() {
  const saved = getScrollPos(scrollMemKey);
  if (saved === undefined || saved <= 0) return;
  void nextTick(() => {
    const el = chassisScrollDom();
    if (el) el.scrollTop = saved;
  });
}
onActivated(() => {
  scrollMemKey = pageScrollKey();
  restoreChassisScroll();
});
function touchY(e: TouchEvent): number | null {
  const tp = e.touches?.[0] ?? e.changedTouches?.[0];
  return tp ? tp.clientY : null;
}
function onTouchStart(e: TouchEvent) {
  if (refreshing.value || currentScrollTop() > 0) { startY = null; return; }
  startY = touchY(e);
}
function onTouchMove(e: TouchEvent) {
  if (startY === null || refreshing.value) return;
  const y = touchY(e);
  if (y === null) return;
  const dy = y - startY;
  if (dy <= 0) { pullY.value = 0; pulling.value = false; return; }
  pulling.value = true;
  pullActive.value = true; // arm the transform layer only now (idle stays clean)
  if (deactivateTimer) { clearTimeout(deactivateTimer); deactivateTimer = null; }
  pullY.value = Math.min(MAX_PX, dy * DAMP);
}
async function onTouchEnd() {
  if (startY === null) return;
  const pulled = pullY.value;
  startY = null;
  pulling.value = false;
  if (pulled >= TRIGGER_PX && !refreshing.value) {
    pullY.value = HOLD_PX;
    await refresh.refresh();
  }
  pullY.value = 0;
  scheduleDeactivate(); // drop the transform after the spring-back finishes
}

// ── route self-detection (mirrors the prototype root layout) ──
const TAB_ROUTE_KEY: Record<string, "home" | "earn" | "store" | "team" | "me"> = {
  "pages/index/index": "home",
  "pages/earn/earn": "earn",
  "pages/store/store": "store",
  "pages/team/team": "team",
  "pages/me/me": "me",
};
function readRoute(): string {
  if (props.logicalRoute) return props.logicalRoute;
  try {
    const ps = getCurrentPages();
    const route = ps.length ? ((ps[ps.length - 1] as { route?: string }).route ?? "") : "";
    if (route) return route;
  } catch {
    // fall through to H5 hash fallback
  }
  // #ifdef H5
  try {
    return window.location.hash.replace(/^#\/?/, "").replace(/^\//, "");
  } catch {
    return "";
  }
  // #endif
  return "";
}
const route = ref(readRoute());
onMounted(() => {
  autoPushMounted = true;
  bindVoucherClaimSheetScope();
  stopVoucherRunScope = subscribeRuntimeRevision(() => {
    bindVoucherClaimSheetScope();
    voucherPopupScheduler.cancel();
    if (readRoute() === "pages/index/index") voucherPopupScheduler.schedule();
  });
  route.value = readRoute();
  // Fresh mount = fresh landing: start at top and wipe stale memory; only a
  // keep-alive re-activation (back-navigation) restores. H5-only listener —
  // App-side pages live in their own webview, which keeps scroll natively.
  scrollMemKey = pageScrollKey();
  dropScrollPos(scrollMemKey);
  const scrollDom = chassisScrollDom();
  if (scrollDom && typeof scrollDom.addEventListener === "function") {
    scrollDom.addEventListener("scroll", onChassisScroll, { passive: true });
  }
  const closeTransient = (trialClaimSheet as { closeTransient?: () => void }).closeTransient;
  if (typeof closeTransient === "function") closeTransient();
  else trialClaimSheet.open = false;
  voucherClaimSheet.closeTransient();

  // 首页自动弹层编排入口(编排规则见文件上半部 autoPushCandidates / runAutoPushRound)。
  // 挂载即排一条安顿定时器;到点评一轮,评不出赢家就有界重试(等异步目录到货),
  // 直到有人弹出 / 离开首页 / 超时。isHome 守卫让受保护的 index.vue 不必被编辑
  // (ALIGNMENT 红线);路由在**触发时**复检,绝不弹到延迟期间跳过去的别的页上。
  beginHomeAutoPush(true);
});
function beginHomeAutoPush(newVisit: boolean) {
  stopAutoPush();
  voucherPopupScheduler.cancel();
  stopObservationOpened?.(); stopObservationOpened = null;
  stopObservationClosed?.(); stopObservationClosed = null;
  if (props.hostVisible && isHome.value) {
    if (newVisit) popupArbiter.beginHomeVisit();
    voucherPopupScheduler.schedule();
    stopObservationOpened = onAcceptanceObservationModalOpened(() => {
      voucherPopupScheduler.onObservationModalOpened(captureVoucherPopupScope());
    });
    stopObservationClosed = onAcceptanceObservationModalClosed(({ token }) => {
      voucherPopupScheduler.onObservationModalClosed(token);
    });

  }
}
watch(() => [props.logicalRoute, props.tabLocationKey], () => {
  if (!props.tabHost) return;
  route.value = readRoute();
  scrollMemKey = pageScrollKey();
  dropScrollPos(scrollMemKey);
  startY = null; pullY.value = 0; pulling.value = false; pullActive.value = false;
  // The view controller restores each tab after its retained content is visible.
});
watch(() => [route.value, props.hostVisible], ([current], [previous]) => {
  if (autoPushMounted && props.tabHost) beginHomeAutoPush(current !== previous);
});
onUnmounted(() => {
  autoPushMounted = false;
  voucherPopupScheduler.cancel();
  stopVoucherRunScope?.();
  stopVoucherRunScope = null;
  stopObservationOpened?.();
  stopObservationOpened = null;
  stopObservationClosed?.();
  stopObservationClosed = null;
  const scrollDom = chassisScrollDom();
  if (scrollDom && typeof scrollDom.removeEventListener === "function") {
    scrollDom.removeEventListener("scroll", onChassisScroll);
  }
  if (scrollIdleTimer) { clearTimeout(scrollIdleTimer); scrollIdleTimer = null; }
  stopAutoPush();
});

watch(
  () => voucher.autoPopupCadence,
  () => {
    if (autoPushMounted) voucherPopupScheduler.schedule();
  },
  { deep: true },
);

const routeTab = computed(() => TAB_ROUTE_KEY[route.value]);
const showBusinessOverlays = computed(() => !!route.value && !isStaticReviewRoute(route.value));
// Tab route when the current route is one of the 5 mains. First-frame fallback:
// if the route isn't resolved yet but the page passed a tab `active` prop AND no
// route string, treat as tab (the 5 tab pages always pass it; sub-pages resolve
// their route synchronously so won't be mis-flagged).
const isTabRoute = computed(() => routeTab.value !== undefined || (route.value === "" && !!props.active));
const activeTab = computed(() => routeTab.value ?? props.active ?? "home");
const isHome = computed(() => activeTab.value === "home");

// Sub-page nav header (registered via useSetPageHeader). Null on tab routes → brand
// row. navHeaderH drives both the row height and the content-top inset, so only
// converted sub-pages get the inset (un-converted ones keep contentTop+0, unchanged).
const navHeader = computed(() => (isTabRoute.value ? null : pageHeader.header));
const navHeaderH = computed(() => (navHeader.value ? (navHeader.value.subtitle ? 56 : 44) : 0));
function navBack() {
  // Stack-aware back: pop real history (restores prev page + scroll), else fall
  // back to the declared backHref. navigateBack alone no-ops on cold-open (P-054).
  navBackTo(navHeader.value?.backHref);
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}

const unread = computed(() => messageDrawer.actionableUnread);
const unreadLabel = computed(() => formatUnreadBadge(unread.value));

// ── layout insets ──
const statusBarHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});
const HEADER_H = 56;
// Preserve the existing floor clearance while the navigation rail changes height.
const TABBAR_CLEARANCE = 36; // HomeIndicator (22) + 14px gap, in addition to the responsive rail height.
const SUB_BOTTOM = 40; //  home indicator (~22) + 18 breathing (was 26)
const contentTop = computed(() => statusBarHeight.value + (isTabRoute.value ? HEADER_H : navHeaderH.value));
const showFloatingSupport = computed(() => isTabRoute.value && ['home', 'earn', 'team'].includes(activeTab.value));
// Let the last page action scroll fully above the floating support shortcut.
const contentBottom = computed(() => isTabRoute.value
  ? `calc(var(--nx-tabbar-height, 56px) + ${TABBAR_CLEARANCE + (showFloatingSupport.value ? 60 : 0)}px)`
  : `${SUB_BOTTOM}px`);
// ── 待支付浮动条的落位 ──
// 浮动条永远占 chrome 之下自己的一条带(top = contentTop + 8),页面内容整体下让 PENDING_BAR_INSET,
// 任何页都不被盖住:tab 页 / useSetPageHeader 子页的 chassis 头在带之上;用 sub-page-header(内容内
// sticky 行)的子页,那一行随内容一起下让,并经 provide 拿到同一个内缩值当自己的 sticky top —— 滚动时
// 钉在带的下沿,不再从浮动条底下穿过。(此前只给有 chassis 头的页内缩,~55 个 sub-page-header 子页的
// 首屏被压 36px:独立审查按像素常量推算 + Playwright 实测 daily / wallet-nex 页 overlap=36。)
const PENDING_BAR_INSET = 60;
// 与渲染条件同谓词:静态审查路由 / 首帧 route 未解析时条不渲染,内容也不能白让一带。
const pendingBarVisible = computed(() => !!pendingCheckout.barSession && showBusinessOverlays.value);
const pendingBarTop = computed(() => contentTop.value + 8);
const pendingBarInset = computed(() => (pendingBarVisible.value ? PENDING_BAR_INSET : 0));
provide(PENDING_BAR_INSET_KEY, pendingBarInset);

// lucide-style outline paths (Home / Zap / ShoppingBag / Users / User)
const tabs = computed(() => [
  { key: "home", route: "/pages/index/index", label: t.value.tabs.home, icon: "M3 10.5 11.2 3.2a1.2 1.2 0 0 1 1.6 0L21 10.5", icon2: "M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" },
  { key: "earn", route: "/pages/earn/earn", label: t.value.tabs.earn, icon: "M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" },
  { key: "store", route: "/pages/store/store", label: t.value.tabs.store, icon: "M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z", icon2: "M9 8V6a3 3 0 0 1 6 0v2" },
  { key: "team", route: "/pages/team/team", label: t.value.tabs.team, icon: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", icon2: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-2a4 4 0 0 0-3-3.8" },
  { key: "me", route: "/pages/me/me", label: t.value.tabs.me, icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", icon2: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
]);

// Liquid-Glass active-tab gradient pill (faithful to prototype tab-bar.tsx).
const activeTabStyle: CSSProperties = {
  color: "var(--v5-brand)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--v5-brand) 22%, transparent) 0%, color-mix(in srgb, var(--v5-brand) 8%, transparent) 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.22)," +
    "inset 0 0 16px color-mix(in srgb, var(--v5-brand) 14%, transparent)," +
    "0 0 0 0.5px color-mix(in srgb, var(--v5-brand) 28%, transparent)",
};

function go(tab: { key: string; route: string }, reason = "activation") {
  if (props.tabHost) {
    const attempt = ++navigationAttempt;
    // Props can still describe A while the service has already selected B.
    // Decide same-tab taps from the host's synchronous route, including B→A.
    if (isCurrentNativeTab(tab.route)) {
      const pages = getCurrentPages();
      scrollNativeCurrentTabToTop(pages[pages.length - 1]);
    } else {
      void navTo(tab.route).then(ok => { if (!ok && attempt === navigationAttempt) navigationReset.value++; });
    }
    return;
  }
  // #ifdef APP-PLUS
  if (navigationPending) return;
  // #endif
  // 再点当前 tab = 回到顶部(《05》§5.3);原实现直接 return,实测 scrollTop
  // 900→900 零位移,是全站唯一「点了没反应」的控件。
  // behavior 显式跟随系统「减少动态」偏好——CSS 的 scroll-behavior 兜底管不到
  // JS scrollTo 的显式 behavior 参数。App 端无 matchMedia,try 兜住即可。
  if (tab.key === activeTab.value) {
    // #ifdef APP-PLUS
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    scrollNativeCurrentTabToTop(pages[pages.length - 1]);
    // #endif
    // #ifndef APP-PLUS
    const dom = chassisScrollDom();
    if (!dom) return;
    let reduce = false;
    try { reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { /* App 端无 matchMedia */ }
    scrollCurrentTabToTop(dom, reduce);
    // #endif
    return;
  }
  let from: string = activeTab.value;
  // A native drag already moved the lens under the finger in the outgoing view.
  // #ifdef APP-PLUS
  if (reason === "drag") from = tab.key;
  // #endif
  rememberGlassNavigation(from, tab.key);
  // #ifdef APP-PLUS
  navigationPending = true;
  void navTo(tab.route).then(ok => {
    navigationPending = false;
    if (!ok) {
      rememberGlassNavigation(activeTab.value, activeTab.value);
      navigationReset.value++;
    }
  });
  // #endif
  // #ifndef APP-PLUS
  void navTo(tab.route);
  // #endif
}
function goSearch() {
  navTo("/pages/search/search");
}
// Every bell opens the full-page center; back restores its origin page.
function goNotifications() {
  messageDrawer.show();
}

import LiquidGlass from "@/components/liquid-glass.vue";
import GlassSegments from "@/components/glass-segments.vue";

const chassisHostId = `nx-chassis-host-${getCurrentInstance()!.uid}`;
const pageVisible = ref(true);
const tabRevision = ref(0);
watch(() => props.tabLocationKey, () => { tabRevision.value += 1; }, { flush: "sync" });
onShow(() => { pageVisible.value = true; });
onHide(() => { pageVisible.value = false; });
let scrollDiagnostics = false;
// #ifdef APP-PLUS
scrollDiagnostics = import.meta.env.VITE_UVEL_SCROLL_DEBUG === "true";
// #endif
const chromeConfiguration = computed(() => ({ hostId: chassisHostId, tabKey: props.tabHost ? props.tabLocationKey : undefined, tabRevision: props.tabHost ? tabRevision.value : undefined, visible: pageVisible.value && props.hostVisible, debug: scrollDiagnostics }));
declare const chromeView: { update(value: { hostId: string; tabKey?: string; tabRevision?: number; visible?: boolean; debug?: boolean }): void };
const navigationOptions = computed(() => tabs.value.map(tab => ({ ...tab, value: tab.key })));
const navigationFrom = consumeGlassNavigation(activeTab.value);
let navigationPending = false;
let navigationAttempt = 0;
const navigationReset = ref(0);
function selectNavigation(value: string, reason: string) {
  const tab = tabs.value.find(item => item.key === value);
  if (tab) go(tab, reason);
}
</script>

<script module="chromeView" lang="renderjs">
import { chassisView } from "@/lib/liquid-glass-view";
// @ts-expect-error vue-tsc 1.x treats uni renderjs as a second normal script.
export default chassisView;
</script>

<style scoped>
.nx-chassis {
  --nx-tabbar-height: 56px;
  position: fixed;
  inset: 0;
  overflow: hidden;
}
@media (min-width: 360px) { .nx-chassis { --nx-tabbar-height: 60px; } }
@media (min-width: 375px) { .nx-chassis { --nx-tabbar-height: 62px; } }
@media (min-width: 390px) { .nx-chassis { --nx-tabbar-height: 64px; } }
@media (min-width: 414px) { .nx-chassis { --nx-tabbar-height: 68px; } }
.nx-top-chrome {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
  background: var(--v5-chrome-bg);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  pointer-events: none;
}
.nx-header {
  isolation: isolate;
  position: absolute;
  left: 0;
  right: 0;
  z-index: 100;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 12px;
}
/* Sub-page row has no shared surface; each control owns its round glass. */
.nx-navheader {
  position: absolute;
  left: 12px;
  right: 12px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  border-radius: 28px;
}
.nx-navheader--capsule { box-shadow: 0 0 0 1px var(--v5-liquid-rim); }
.nx-nav-side {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.nx-nav-side:active {
  opacity: 0.7;
}
.nx-nav-glass {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: transform 100ms cubic-bezier(.2,.8,.2,1);
}
.nx-nav-glass > svg { position: relative; z-index: 1; }
.nx-nav-titlewrap {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: transform 200ms cubic-bezier(.23,1,.32,1), opacity 200ms, visibility 0s;
}
.nx-nav-titlewrap[data-hidden="true"] { transform: translateY(-18px); opacity: 0; visibility: hidden; transition-delay: 0s, 0s, 200ms; }
@media (prefers-reduced-motion: reduce) { .nx-nav-titlewrap { transition: none; } .nx-nav-titlewrap[data-hidden="true"] { transform: none; } }
.nx-nav-title {
  max-width: 100%;
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.014em;
  color: var(--v5-ink);
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nx-nav-sub {
  max-width: 100%;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--v5-ink-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nx-nav-belldot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--v5-brand-2);
}
.nx-header__l {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 146px;
  height: 50px;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 200ms cubic-bezier(.23,1,.32,1), opacity 200ms, visibility 0s;
}
.nx-header__l[data-hidden="true"] { transform: translateY(-18px); opacity: 0; visibility: hidden; transition-delay: 0s, 0s, 200ms; }
@media (prefers-reduced-motion: reduce) { .nx-header__l { transition: none; } .nx-header__l[data-hidden="true"] { transform: none; } }
.nx-header__center {
  position: absolute;
  left: 50%;
  top: 0;
  height: 52px;
  /* 两侧各让出一个槽宽(120px),左右都不会压到居中区。原值 208 = 旧槽宽 104×2。 */
  max-width: calc(100% - 240px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  text-align: center;
  pointer-events: none;
}
.nx-brand {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--v5-ink);
  white-space: nowrap;
}
.nx-ver {
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink-4);
  white-space: nowrap;
}
.nx-header__r {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 3px;
  flex-shrink: 0;
}
.nx-icon-btn {
  /* 《07》tap ≥44pt — 原 38×38 不足;图标视觉尺寸不变,只扩热区 */
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: transform 100ms cubic-bezier(.2,.8,.2,1);
}
.nx-icon-btn:active, .nx-nav-side:active .nx-nav-glass { transform: scale(.92); }
.nx-icon-btn:focus-visible, .nx-nav-side:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; border-radius: 24px; }
.nx-badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--v5-brand-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.nx-badge__t {
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-on-brand-2);
  font-family: var(--font-v5);
  line-height: 1;
}
.nx-content {
  /* absolute (NOT fixed) inside the fixed chassis — mirrors the prototype's
     `absolute inset-0 overflow-y-auto`. And NO -webkit-overflow-scrolling:touch:
     that promotes a separate iOS momentum compositing layer which (like
     <scroll-view>) the fixed/absolute chrome's backdrop-filter cannot frost.
     Plain absolute overflow:auto stays on the chassis paint surface → the
     frosted glass actually renders. (P-039 / P-040) */
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
}
/* hide scrollbar (match the prototype's no-scrollbar utility) */
.nx-content::-webkit-scrollbar {
  display: none;
}
/* themed pull-to-refresh indicator — dark chip + brand spinner */
.nx-refresher {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 5;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--v5-surface);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  pointer-events: none;
}
.nx-refresher-icon {
  display: grid;
  place-items: center;
  transition: transform 0.15s;
}
.nx-spinning {
  animation: nx-spin 0.8s linear infinite;
}
@keyframes nx-spin {
  to {
    transform: rotate(360deg);
  }
}
/* page entrance — fade + slight-y, re-fires on each page (chassis) mount.
   `backwards` (NOT `both`): applies the `from` state before start for a clean
   fade-in, but does NOT hold a `transform` after the animation ends — a lingering
   transform would composite the content and block the chrome's backdrop-filter
   frosting (P-041). After 0.36s the element reverts to its base (no transform). */
.nx-page-enter {
  animation: nx-page-in 0.36s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
/* Native tab roots replace the webview; another content translation makes that
   replacement look like a second transition underneath the moving lens. */
/* #ifdef APP-PLUS */
.nx-page-enter--tab { animation: none; }
/* #endif */
@keyframes nx-page-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.nx-tabbar-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  /* transparent wrapper — the pill's own backdrop blurs content behind it */
}
.nx-tabbar-pill {
  margin: 0 12px;
}
/* APP's view thread supplies this state when the logic thread has no DOM. */
.nx-chassis[data-scrolling="true"] :deep(.nx-nova-bubble) { opacity: 0; pointer-events: none; }
.nx-chassis[data-scrolling="true"] :deep(.nx-nova-motion),
.nx-chassis[data-scrolling="true"] :deep(.nx-nova-halo) { animation-play-state: paused; }
</style>

<style scoped>
.nx-header { height:56px;padding-inline:16px; }
.nx-header__r { gap:8px;padding:0; }
.nx-icon-btn { isolation:isolate;border-radius:50%; }
.nx-icon-btn > svg { position:relative;z-index:1; }
.nx-header-scan-icon { position:relative;z-index:1;display:flex;align-items:center;justify-content:center; }
@media (max-width:374px) {
  .nx-header__l { width:124px; height:43px; }
}
@media (max-width:350px) {
  .nx-header__l { width:112px; height:39px; }
}
</style>

<style scoped>
.nx-badge {right:4px;background:var(--ui-unread-badge);z-index:2;} .nx-badge__t {font-size:10.5px;color:var(--ui-unread-badge-ink);}
</style>

<style scoped>.nx-header__l {justify-content:flex-start;}</style>
