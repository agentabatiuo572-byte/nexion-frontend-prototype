<!--
  AppChassis — page shell (uni has no root layout / App.vue renders no template,
  P-004). Route-aware like the prototype's root layout (header.tsx + tab-bar.tsx):
    · TAB routes (home/earn/store/team/me): brand row (N badge + NexGrid/title +
      search + bell-badge) + FLOATING frosted-glass pill TabBar (5 tabs, active =
      gradient brand pill) + home indicator. Liquid-Glass faithful to v5.
    · SUB routes (everything else): NO brand row + NO 5-tab pill (the page carries
      its own in-page back/title row); only the status bar + home indicator. This
      keeps all ~56 sub-pages correct with zero per-page edits.
  Route is read from getCurrentPages() so the chassis self-detects mode; the
  `active` prop is an optional fallback for the very first frame.
-->
<template>
  <view class="nx-chassis" style="background: var(--v5-bg)">
    <view class="nx-top-chrome" :style="{ height: topChromeHeight + 'px' }" />

    <!-- Status bar safe area (real on device, ~0 on desktop H5) -->
    <DeviceStatusBar />

    <!-- Header brand row — TAB routes only (sub-pages carry their own back row) -->
    <view v-if="isTabRoute" class="nx-header" :style="{ top: statusBarHeight + 'px' }">
      <view class="nx-header__l">
        <view class="nx-logo" aria-hidden="true">
          <image class="nx-logo-img nx-logo-img--light" src="/static/img/brand/header-logo-light.png" mode="aspectFit" />
          <image class="nx-logo-img nx-logo-img--dark" src="/static/img/brand/header-logo-dark.png" mode="aspectFit" />
        </view>
      </view>
      <view class="nx-header__center" />
      <view class="nx-header__r">
        <view class="nx-icon-btn active:opacity-60" role="button" tabindex="0" :aria-label="t.headerTitles.search" @click="goSearch" @keydown.enter.prevent="goSearch" @keydown.space.prevent="goSearch">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </view>
        <view class="nx-icon-btn nx-bell active:opacity-60" role="button" tabindex="0" :aria-label="t.notifs.drawerTitle" @click="goNotifications" @keydown.enter.prevent="goNotifications" @keydown.space.prevent="goNotifications">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <view v-if="unread > 0" class="nx-badge"><text class="nx-badge__t">{{ unreadLabel }}</text></view>
        </view>
      </view>
    </view>

    <!-- Page nav header — sub-pages that registered via useSetPageHeader. Sticky
         chassis row (NOT inside page content) so it pins on scroll + frosts the
         content behind it, mirroring the prototype Header nav row. Tab pages never
         set pageHeader, so this never shows for them (brand row stays untouched). -->
    <view v-if="!isTabRoute && navHeader" class="nx-navheader" :style="{ top: statusBarHeight + 'px', height: navHeaderH + 'px' }">
      <view class="nx-nav-side" @click="navBack">
        <view class="nx-nav-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </view>
      </view>
      <view class="nx-nav-titlewrap">
        <text class="nx-nav-title">{{ navHeader.title }}</text>
        <text v-if="navHeader.subtitle" class="nx-nav-sub">{{ navHeader.subtitle }}</text>
      </view>
      <view class="nx-nav-side" @click="goNotifications">
        <view class="nx-nav-glass">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <view class="nx-nav-belldot" />
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
        <view class="nx-page-enter" :style="{ paddingTop: (contentTop + pendingBarInset) + 'px', paddingBottom: contentBottom + 'px' }">
          <slot name="pageTop" />
          <!-- Voucher fallback banner — chassis-injected at content top so the
               5 protected tab pages stay untouched (ALIGNMENT red-line). Self-
               hides unless a claimable voucher targets the current surface. -->
          <VoucherBanner v-if="bannerSurface" :surface="bannerSurface" />
          <slot />
        </view>
      </view>
    </view>

    <!-- Bottom chrome: floating pill TabBar (tab routes) + home indicator (always) -->
    <view class="nx-tabbar-wrap">
      <view v-if="isTabRoute" class="nx-tabbar-pill">
        <view aria-hidden class="nx-tab-specular" />
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="nx-tab active:opacity-70"
          :style="tab.key === activeTab ? activeTabStyle : { color: 'var(--v5-ink-3)' }"
          role="tab"
          tabindex="0"
          :aria-selected="tab.key === activeTab ? 'true' : 'false'"
          :aria-label="tab.label"
          @click="go(tab)"
          @keydown.enter.prevent="go(tab)"
          @keydown.space.prevent="go(tab)"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            :stroke="tab.key === activeTab ? 'var(--v5-brand)' : 'var(--v5-ink-3)'"
            :stroke-width="tab.key === activeTab ? 2.4 : 2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="tab.icon" />
            <template v-if="tab.icon2"><path :d="tab.icon2" /></template>
          </svg>
          <text class="nx-tab__label" :style="{ color: tab.key === activeTab ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ tab.label }}</text>
        </view>
      </view>
      <DeviceHomeIndicator />
    </view>

    <!-- Nova 浮标 — tab routes only. Remote mode keeps the real Gemma entry
         resident; mock mode retains the prototype's unread-triggered behavior.
         `dimmed` = 正在滚动 → 让路给内容(见 markScrolling)。 -->
    <NovaBubble v-if="isTabRoute" :dimmed="scrolling" />

    <!-- Chassis-level overlays (each self-gates on its own store's open state,
         mirroring the prototype IOSFrame). Ported P-043. -->
    <template v-if="showBusinessOverlays">
      <TrialClaimSheet />
      <VoucherClaimSheet />
      <SlotActionSheet />
      <TradeinSheets />
      <LuckySpinSheet />
      <StickyCtaBar />
      <MessageDrawer />
      <!-- 待支付浮动条:结算扫码步开出的那笔发票还没付,全站置顶提醒 + 一键回到同一笔。
           自隐藏:无在途会话 / 已过期 / 结算页正在展示它。位置见 pendingBarTop / pendingBarInset。 -->
      <PendingCheckoutBar :top="pendingBarTop" />
    </template>

    <!-- Global overlay host (toast / confirm / netError) -->
    <GlobalUi />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onActivated, nextTick, provide, type CSSProperties } from "vue";
import GlobalUi from "@/components/global-ui.vue";
import NovaBubble from "@/components/nova/nova-bubble.vue";
import TrialClaimSheet from "@/components/trial-claim-sheet.vue";
import SlotActionSheet from "@/components/slot-action-sheet.vue";
import StickyCtaBar from "@/components/sticky-cta-bar.vue";
import PendingCheckoutBar from "@/components/pending-checkout-bar.vue";
import TradeinSheets from "@/components/tradein-sheets.vue";
import LuckySpinSheet from "@/components/lucky-spin-sheet.vue";
import MessageDrawer from "@/components/message-drawer.vue";
import VoucherClaimSheet from "@/components/voucher-claim-sheet.vue";
import VoucherBanner from "@/components/voucher-banner.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import { useT } from "@/i18n/use-t";
import { useNotifications } from "@/store/notifications";
import { useMessageDrawer } from "@/store/message-drawer";
import { useRefresh } from "@/store/refresh";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { usePageHeader } from "@/store/page-header";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useVoucher } from "@/store/voucher";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { usePendingCheckout } from "@/store/pending-checkout";
import { PENDING_BAR_INSET_KEY } from "@/store/pending-checkout-core";
import { VOUCHER_POPUP } from "@/mock/vouchers";
import { usePopupArbiter, runPriorityRound, type AutoPushCandidate, type PopupId } from "@/store/popup-arbiter";
import { navBack as navBackTo, navTo } from "@/lib/route";
import { isStaticReviewRoute } from "@/lib/static-review-routes";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { saveScrollPos, getScrollPos, dropScrollPos } from "@/lib/scroll-memory";

const props = defineProps<{
  active?: "home" | "earn" | "store" | "team" | "me";
}>();

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
const SETTLE_RETRY_MS = 300;
// 资格复算窗口:只在安顿点评一次会重演缺陷 ②(异步目录还没到货)。
// ponytail: 有界重试,20 × 300ms = 6s;超时就这一趟不弹 —— 比让低优先级顶上去好。
const SETTLE_MAX_TICKS = 20;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let settleRetry: ReturnType<typeof setInterval> | null = null;
let settleTicks = 0;

// 顺序**不在这里定**(按 POPUP_PRIORITY 排),这里只声明每个 id 的资格与推送方式。
const autoPushCandidates: AutoPushCandidate[] = [
  {
    id: "voucher-claim",
    eligible: () => voucher.claimableVouchers.some((v) => v.popupEnabled),
    ready: () => voucher.catalogReady,
    push: () =>
      voucherClaimSheet.tryAutoPush({
        cooldownHours: VOUCHER_POPUP.cooldownHours,
        maxPerSession: VOUCHER_POPUP.maxPerSession,
      }),
  },
  {
    id: "trial-claim",
    // 试用的判据全部来自本地 config 与试用状态,无异步依赖,恒就绪。
    eligible: () => trialConfig.config.autoPushEnabled && freeTrial.canStart(),
    ready: () => true,
    push: () =>
      trialClaimSheet.tryAutoPush({
        cooldownHours: trialConfig.config.autoPushCooldownHours,
        maxPerSession: trialConfig.config.autoPushMaxPerSession,
      }),
  },
];

// 延迟回归本职「让首屏先安顿」,不再兼任优先级。取各候选配置延迟的较大值,
// 保证每个候选都过了它自己那份 autoPushDelayMs 才被评。
function settleDelayMs(): number {
  return Math.max(trialConfig.config.autoPushDelayMs, VOUCHER_POPUP.autoPushDelayMs);
}

/** 按优先级评一轮。返回 true = 该停表(有人弹出来了,或已离开首页)。 */
// 评选逻辑本体在 store/popup-arbiter.ts 的 runPriorityRound —— 放在 store 层是为了让
// 机器门能测**正主**;埋在组件里时门只能用正则猜写法,而正则对改名 / 挪位 / 装饰性
// 保留一概判绿(独立审计实测:两条旧定时器改个变量名搬回来,门 57/57 全绿)。
function runAutoPushRound(): boolean {
  if (readRoute() !== "pages/index/index") return true;
  return runPriorityRound({
    currentHolder: () => popupArbiter.current,
    acquire: (id) => popupArbiter.acquire(id),
    release: (id) => popupArbiter.release(id),
    candidates: autoPushCandidates,
    waitForReady: settleTicks < SETTLE_MAX_TICKS,
  });
}

function stopAutoPush() {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (settleRetry) {
    clearInterval(settleRetry);
    settleRetry = null;
  }
}

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

// uni <view> template ref → DOM element via $el on H5 (P-019); read scrollTop
// directly so the pull only arms when the content is at the very top.
function chassisScrollDom(): HTMLElement | null {
  const raw = scrollEl.value as { $el?: HTMLElement } | HTMLElement | null;
  return (raw && typeof raw === "object" && "$el" in raw ? raw.$el : raw) as HTMLElement | null;
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
  try {
    const ps = getCurrentPages();
    const top = ps.length ? (ps[ps.length - 1] as { $page?: { fullPath?: string }; route?: string }) : undefined;
    return top?.$page?.fullPath ?? top?.route ?? route.value;
  } catch {
    return route.value;
  }
}
// ── Nova 浮标让路 —— 滚动中淡出,停下再淡回 ──
// 浮标 fixed 在右下角,而内容区一直延伸到它下面(内容底部只留 TABBAR_INSET=104px,
// 浮标含浮动动画顶到 152px)→ 它永远横在正在读的内容上。滚动 = 用户在看内容,
// 此刻让它隐身;停下 SCROLL_IDLE_MS 后淡回(主人 2026-08-17 拍板)。
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
  if (isHome.value) {
    popupArbiter.beginHomeVisit();
    settleTicks = 0;
    settleTimer = setTimeout(() => {
      if (runAutoPushRound()) return;
      settleRetry = setInterval(() => {
        settleTicks += 1;
        if (runAutoPushRound() || settleTicks >= SETTLE_MAX_TICKS) stopAutoPush();
      }, SETTLE_RETRY_MS);
    }, settleDelayMs());
  }
});
onUnmounted(() => {
  const scrollDom = chassisScrollDom();
  if (scrollDom && typeof scrollDom.removeEventListener === "function") {
    scrollDom.removeEventListener("scroll", onChassisScroll);
  }
  if (scrollIdleTimer) { clearTimeout(scrollIdleTimer); scrollIdleTimer = null; }
  stopAutoPush();
});

const routeTab = computed(() => TAB_ROUTE_KEY[route.value]);
const showBusinessOverlays = computed(() => !!route.value && !isStaticReviewRoute(route.value));
// Tab route when the current route is one of the 5 mains. First-frame fallback:
// if the route isn't resolved yet but the page passed a tab `active` prop AND no
// route string, treat as tab (the 5 tab pages always pass it; sub-pages resolve
// their route synchronously so won't be mis-flagged).
const isTabRoute = computed(() => routeTab.value !== undefined || (route.value === "" && !!props.active));
const activeTab = computed(() => routeTab.value ?? props.active ?? "home");
const isHome = computed(() => activeTab.value === "home");

// Voucher fallback banner surface = current tab route (home/store/me/earn). team
// is not a configured claim surface. The VoucherBanner self-hides unless a
// claimable voucher targets the surface, so this only maps the route → surface.
const bannerSurface = computed<"home" | "store" | "me" | "earn" | null>(() => {
  // Tab pages only — sub-pages (checkout/detail/…) pass active="store" etc. but
  // must NOT carry the banner (it's scoped to the 4 first-level surfaces).
  if (!isTabRoute.value) return null;
  const tab = activeTab.value;
  return tab === "home" || tab === "store" || tab === "me" || tab === "earn" ? tab : null;
});

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

const unread = computed(() => notifications.unread);
const unreadLabel = computed(() => (unread.value > 99 ? "99+" : String(unread.value)));

// ── layout insets ──
const statusBarHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});
const HEADER_H = 52;
// Floor breathing (owner 2026-07-09: 加大底部呼吸). Both give ~18px clear space
// below the last element so it isn't jammed against the tabbar / screen edge.
const TABBAR_INSET = 104; // floating pill (64) + home indicator (22) + 18 breathing (was 92)
const SUB_BOTTOM = 40; //  home indicator (~22) + 18 breathing (was 26)
const contentTop = computed(() => statusBarHeight.value + (isTabRoute.value ? HEADER_H : navHeaderH.value));
const contentBottom = computed(() => (isTabRoute.value ? TABBAR_INSET : SUB_BOTTOM));
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
const topChromeHeight = computed(() => contentTop.value);

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

function go(tab: { key: string; route: string }) {
  // 再点当前 tab = 回到顶部(《05》§5.3);原实现直接 return,实测 scrollTop
  // 900→900 零位移,是全站唯一「点了没反应」的控件。
  // behavior 显式跟随系统「减少动态」偏好——CSS 的 scroll-behavior 兜底管不到
  // JS scrollTo 的显式 behavior 参数。App 端无 matchMedia,try 兜住即可。
  if (tab.key === activeTab.value) {
    const dom = chassisScrollDom();
    if (!dom) return;
    let reduce = false;
    try { reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { /* App 端无 matchMedia */ }
    dom.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    return;
  }
  navTo(tab.route);
}
function goSearch() {
  uni.navigateTo({ url: "/pages/search/search", fail: () => {} });
}
// Bell → in-place slide-in MessageDrawer (now ported, P-043), matching the
// prototype. (Was routing to the full /pages/me/notifications page as a stopgap.)
function goNotifications() {
  messageDrawer.show();
}
</script>

<style scoped>
.nx-chassis {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
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
  position: absolute;
  left: 0;
  right: 0;
  z-index: 100;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--v5-chrome-border);
}
/* Page nav header (sub-pages) — its OWN chrome surface so the brand row
   (.nx-header) stays byte-identical for the 5 tab pages. Mirrors the prototype
   Header nav row: 44/56 tall, back + centered title + bell, frosted. */
.nx-navheader {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--v5-chrome-border);
}
.nx-nav-side {
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
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--v5-glass-bg);
  border: 1px solid var(--v5-glass-border);
  box-shadow: var(--v5-glass-shadow);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
}
.nx-nav-titlewrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
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
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 104px;
  flex-shrink: 0;
}
.nx-header__center {
  position: absolute;
  left: 50%;
  top: 0;
  height: 52px;
  max-width: calc(100% - 208px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  text-align: center;
  pointer-events: none;
}
.nx-logo {
  position: relative;
  width: 96px;
  height: 27px;
  display: block;
  flex-shrink: 0;
}
.nx-logo-img {
  width: 100%;
  height: 100%;
  display: block;
}
.nx-logo-img--dark {
  display: none;
}
html[data-theme="dark"] .nx-logo-img--light {
  display: none;
}
html[data-theme="dark"] .nx-logo-img--dark {
  display: block;
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
  display: flex;
  align-items: center;
  gap: 2px;
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
}
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
  display: flex;
  align-items: stretch;
  padding: 4px;
  border-radius: 22px;
  overflow: hidden;
  position: relative;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 45%, transparent 100%),
    var(--v5-tabbar-bg);
  backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
  -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(1.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12),
    0 10px 36px rgba(0, 0, 0, 0.4),
    0 0 0 0.5px rgba(255, 255, 255, 0.04);
}
.nx-tab-specular {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
  opacity: 0.7;
  pointer-events: none;
}
.nx-tab {
  flex: 1;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 16px;
}
.nx-tab__label {
  font-size: 12px;
  line-height: 14px; /* 《02》§2 tab.label 12/14/600 */
  font-weight: 600;
  font-family: var(--font-v5);
  letter-spacing: -0.005em;
}
</style>
