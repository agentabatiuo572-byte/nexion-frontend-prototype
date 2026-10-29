<!--
  SubPageHeader — sticky controls with independent round glass surfaces and a
  bare title. The chassis view layer hides the title when content scrolls under
  it and restores it at the top. The row keeps its height and content spacing.

  The plain variant keeps the title bare and gives the back control its own
  round glass surface. An optional action replaces the message bell. The solid
  variant swaps the glass for an opaque surface, for pages whose content stays
  bright under the controls.
-->
<template>
  <view class="spv" :class="{ 'spv--plain': plain, 'spv--design': design, 'spv--solid': solid }" :style="{ top: (statusBarHeight + pendingBarInset) + 'px', minHeight: rowH + 'px' }">
    <view
      class="spv-side spv-back"
      role="button"
      tabindex="0"
      :aria-label="t.profile.back"
      @click="goBack"

      @keydown.enter.prevent="onKeyboardActivate($event, goBack)" @keydown.space.prevent="onKeyboardActivate($event, goBack)"
    >
      <view class="spv-glass nx-design-glass">
        <LiquidGlass :radius="22" tone="navigation" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
    </view>
    <view class="spv-titlewrap">
      <text v-if="displayTitle" class="spv-title">{{ displayTitle }}</text>
      <text v-if="subtitle" class="spv-sub">{{ subtitle }}</text>
    </view>
    <view v-if="actionLabel && action" class="spv-action" role="button" tabindex="0" :aria-label="actionLabel" @click="action" @keydown.enter.prevent="onKeyboardActivate($event, action)" @keydown.space.prevent="onKeyboardActivate($event, action)">
      <view v-if="!design" class="spv-action-surface"><LiquidGlass :radius="18" /></view>
      <text>{{ actionLabel }}</text>
    </view>
    <view v-else-if="!plain && !design"
      class="spv-side spv-bell relative"
      role="button"
      tabindex="0"
      :aria-label="unread !== null && unread > 0 ? t.notifs.drawerTitle + ' · ' + unread : unread === null ? t.notifs.drawerTitle + ' · ' + t.notifs.unreadUnavailable : t.notifs.drawerTitle"
      @click="goBell"

      @keydown.enter.prevent="onKeyboardActivate($event, goBell)" @keydown.space.prevent="onKeyboardActivate($event, goBell)"
    >
      <view class="spv-glass nx-design-glass">
        <LiquidGlass :radius="22" tone="navigation" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        <view v-if="unread !== null && unread > 0" class="spv-belldot" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, onUnmounted } from "vue";
import { PENDING_BAR_INSET_KEY } from "@/store/pending-checkout-core";
import { useMessageDrawer } from "@/store/message-drawer";
import { useT } from "@/i18n/use-t";
import { resolveHeaderTitleText, routeFromH5Hash } from "@/lib/header-title";
import { navBack } from "@/lib/route";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";

const props = defineProps<{ back: string; title?: string; subtitle?: string; backAction?: () => void; plain?: boolean; design?: boolean; solid?: boolean; actionLabel?: string; action?: () => void }>();
// 待支付浮动条在场时 chassis 让内容整体下让一带,并把同一个值 provide 下来:sticky 行钉在带的下沿,
// 不与浮动条重叠(chassis 外渲染 / 无条时为 0)。
const pendingBarInset = inject(PENDING_BAR_INSET_KEY, ref(0));

const drawer = useMessageDrawer();
const t = useT();
const unread = computed(() => drawer.actionableUnread);
const rowH = computed(() => 56);

// Current uni route — last entry in getCurrentPages() (same readRoute() pattern
// as app-chassis.vue). Used to derive a route-based title when none is passed.
function readRoute(): string {
  try {
    if (typeof window !== "undefined") {
      const visibleH5Route = routeFromH5Hash(window.location.hash);
      if (visibleH5Route) return visibleH5Route;
    }
    const ps = getCurrentPages();
    return ps.length ? ((ps[ps.length - 1] as { route?: string }).route ?? "") : "";
  } catch {
    return "";
  }
}

// Display title precedence: explicit prop → route-derived title → "" (empty →
// .spv-title v-if doesn't render, matching the prototype's unmapped="" behaviour).
// Mirrors Nexion-prototype header.tsx computeTitle.
const currentRoute = ref(readRoute());
const syncRoute = () => { currentRoute.value = readRoute(); };
onMounted(() => {
  syncRoute();
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
  }
});
onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("hashchange", syncRoute);
    window.removeEventListener("popstate", syncRoute);
  }
});
const displayTitle = computed(() => props.title ?? resolveHeaderTitleText(currentRoute.value, t.value.headerTitles));
const statusBarHeight = computed(() => {
  try { return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight(); } catch { return h5DevicePreviewStatusBarHeight(); }
});

function goBack() {
  if (props.backAction) { props.backAction(); return; }
  navBack(props.back);
}
function goBell() {
  drawer.show();
}
function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}

import LiquidGlass from "@/components/liquid-glass.vue";
</script>

<style scoped>

.spv {
  position: sticky;
  left: 0;
  right: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: minmax(72px, max-content) minmax(0, 1fr) minmax(72px, max-content);
  align-items: center;
  gap: 0;
  padding: 6px;
  box-sizing: border-box;
  /* One shared spacing rule; only the individual controls carry glass. */
  margin: 0 0 12px;
  border-radius: 0;
}
.spv-side {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.spv-side:active {
  opacity: 0.7;
}
.spv-glass {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: transform 100ms cubic-bezier(.2,.8,.2,1);
}
.spv-side:active .spv-glass { transform: scale(.92); }
.spv-glass > svg { position: relative; z-index: 1; }
.spv-back { margin-left: 6px; }
.spv-bell { justify-self: end; margin-right: 6px; }
.spv--plain { border-radius: 0; }
.spv--plain .spv-glass { width: 44px; height: 44px; }
.spv--solid .spv-glass { background: var(--v5-surface-2); }
.spv--solid .spv-glass > .nx-liquid-glass { display: none; }
.spv--solid .spv-glass > svg { stroke: var(--v5-ink); }
:global([data-theme="light"] .spv--solid .spv-glass) { background: var(--v5-surface); box-shadow: 0 2px 6px rgba(23,31,45,.12); }
.spv-action { position: relative; z-index: 1; min-height: 44px; min-width: 72px; max-width: 100%; box-sizing: border-box; padding: 0 4px; display: flex; align-items: center; justify-content: center; color: var(--v5-ink-2); font-size: 14px; font-weight: 500; line-height: 18px; border-radius: 22px; text-align: center; }
.spv-action-surface { position: absolute; inset: 4px 0; border-radius: 18px; pointer-events: none; }
.spv-action > text { position: relative; z-index: 1; white-space: nowrap; }
.spv-action:active { opacity: .75; transform: scale(.98); }
.spv-action:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.spv-side:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; border-radius: 24px; }
.spv-titlewrap {
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
.spv-titlewrap[data-hidden="true"] { transform: translateY(-18px); opacity: 0; visibility: hidden; transition-delay: 0s, 0s, 200ms; }
@media (prefers-reduced-motion: reduce) {
  .spv-titlewrap, .spv-glass, .spv-action { transition: none; }
  .spv-titlewrap[data-hidden="true"], .spv-side:active .spv-glass, .spv-action:active { transform: none; }
}
.spv-title {
  max-width: 100%;
  font-family: var(--font-v5);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.014em;
  color: var(--v5-ink);
  line-height: 24px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.spv-glass svg { width: 20px; height: 20px; }
.spv-sub {
  max-width: 100%;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--v5-ink-3);
  white-space: normal;
  overflow-wrap: anywhere;
}
.spv-belldot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--v5-brand-2);
}
</style>

<style scoped>
.spv--design { display:grid;grid-template-columns:minmax(72px,max-content) minmax(0,1fr) minmax(72px,max-content);gap:0;margin:0 0 12px;padding:6px;border-radius:0; }
.spv--design .spv-back { margin-left:6px; }
.spv--design .spv-glass { width:44px;height:44px;border-radius:50%; }
.spv--design .spv-glass svg { width:20px;height:20px; }
.spv--design .spv-title { font-size:18px;line-height:24px;font-weight:600; }
.spv--design .spv-action { min-width:72px;padding:0 4px;font-size:14px; }
</style>
