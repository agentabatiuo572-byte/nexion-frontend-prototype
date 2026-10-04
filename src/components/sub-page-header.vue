<!--
  SubPageHeader — sticky controls with independent round glass surfaces and a
  bare title. The chassis view layer hides the title when content scrolls under
  it and restores it at the top. The row keeps its height and content spacing.

  The plain variant keeps the title bare and gives the back control its own
  round glass surface. An optional action replaces the message bell.
-->
<template>
  <view class="spv" :class="{ 'spv--plain': plain }" :style="{ top: (statusBarHeight + pendingBarInset) + 'px', height: rowH + 'px' }">
    <view
      class="spv-side spv-back"
      role="button"
      tabindex="0"
      :aria-label="t.profile.back"
      @click="goBack"

      @keydown.enter.prevent="onKeyboardActivate($event, goBack)" @keydown.space.prevent="onKeyboardActivate($event, goBack)"
    >
      <view class="spv-glass">
        <LiquidGlass :radius="plain ? 22 : 18" tone="navigation" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
    </view>
    <view class="spv-titlewrap">
      <text v-if="displayTitle" class="spv-title">{{ displayTitle }}</text>
      <text v-if="subtitle" class="spv-sub">{{ subtitle }}</text>
    </view>
    <view v-if="actionLabel && action" class="spv-action" role="button" tabindex="0" :aria-label="actionLabel" @click="action" @keydown.enter.prevent="onKeyboardActivate($event, action)" @keydown.space.prevent="onKeyboardActivate($event, action)">
      <view class="spv-action-surface"><LiquidGlass :radius="18" /></view>
      <text>{{ actionLabel }}</text>
    </view>
    <view v-else-if="!plain"
      class="spv-side spv-bell relative"
      role="button"
      tabindex="0"
      :aria-label="unread > 0 ? t.notifs.drawerTitle + ' · ' + unread : t.notifs.drawerTitle"
      @click="goBell"

      @keydown.enter.prevent="onKeyboardActivate($event, goBell)" @keydown.space.prevent="onKeyboardActivate($event, goBell)"
    >
      <view class="spv-glass">
        <LiquidGlass :radius="18" tone="navigation" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        <view v-if="unread > 0" class="spv-belldot" />
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

const props = defineProps<{ back: string; title?: string; subtitle?: string; backAction?: () => void; plain?: boolean; actionLabel?: string; action?: () => void }>();
// 待支付浮动条在场时 chassis 让内容整体下让一带,并把同一个值 provide 下来:sticky 行钉在带的下沿,
// 不与浮动条重叠(chassis 外渲染 / 无条时为 0)。
const pendingBarInset = inject(PENDING_BAR_INSET_KEY, ref(0));

const drawer = useMessageDrawer();
const t = useT();
const unread = computed(() => drawer.totalUnread);
const rowH = computed(() => (props.subtitle ? 56 : 44));

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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  /* Global header→content breathing (owner 2026-07-09: nav sat too close to
     content across every sub-page). One place, all ~55 sub-pages; tab pages use
     the chassis header so they're untouched. Pages must NOT add their own top
     padding on top of this — reset to 0 when de-carding. */
  margin: 0 12px 24px;
  margin-bottom: 24px;
  border-radius: 28px;
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: transform 100ms cubic-bezier(.2,.8,.2,1);
}
.spv-side:active .spv-glass { transform: scale(.92); }
.spv-glass > svg { position: relative; z-index: 1; }
.spv--plain { display: grid; grid-template-columns: 92px minmax(0, 1fr) 92px; border-radius: 0; padding: 0; }
.spv--plain .spv-glass { width: 44px; height: 44px; }
.spv-action { position: relative; z-index: 1; min-height: 44px; width: 92px; max-width: 100%; box-sizing: border-box; padding: 0 10px; display: flex; align-items: center; justify-content: center; color: var(--v5-ink-2); font-size: 12px; font-weight: 500; line-height: 16px; border-radius: 22px; }
.spv-action-surface { position: absolute; inset: 4px 0; border-radius: 18px; pointer-events: none; }
.spv-action > text { position: relative; z-index: 1; }
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
@media (prefers-reduced-motion: reduce) { .spv-titlewrap { transition: none; } .spv-titlewrap[data-hidden="true"] { transform: none; } }
/* 《02》14 档里没有「顶栏标题」专档(有 tab.label 给底部 Tab,顶栏没有)。
   17px 是 iOS 导航栏惯例值,但不在合法集。两个候选:
   · heading.h3 20/28 —— 标题语义对,但顶栏高度固定,要验放不放得下
   · body.m 15/22 —— 布局零风险,可它是「正文」档,顶栏标题会掉到与正文同级
   取 20:顶栏标题的职责是「我在哪一页」,层级必须高于正文;实测顶栏高度与溢出后确认。 */
.spv-title {
  max-width: 100%;
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.014em;
  color: var(--v5-ink);
  line-height: 28px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.spv--plain .spv-title { font-size: 20px; line-height: 22px; white-space: normal; overflow: visible; text-overflow: clip; }
@media (max-width: 360px) { .spv--plain .spv-title { font-size: 15px; line-height: 20px; } }
.spv-sub {
  max-width: 100%;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--v5-ink-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
