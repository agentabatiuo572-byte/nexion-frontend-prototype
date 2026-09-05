<!--
  SubPageHeader — STICKY in-content top chrome for sub-pages. Prototype-faithful
  nav row: glass back tile (left) + CENTERED title/subtitle + glass bell tile
  (right). position:sticky so it pins to the top of the chassis scroll container on
  scroll and frosts the content scrolling beneath it (the chassis content is a plain
  overflow:auto view per P-041, so a sticky child shares its paint surface and
  backdrop-filter works). Per-page + in-content → survives back-navigation with no
  store/onShow gymnastics (uni delivers onShow only to pages, not components).

  Was: scrolled away with content, LEFT title, surface tiles — diverged from the
  prototype. API unchanged (back / title / subtitle), so all ~55 callers are fixed
  at once with no per-page edits.
-->
<template>
  <view class="spv" :style="{ top: (statusBarHeight + pendingBarInset) + 'px', height: rowH + 'px' }">
    <view
      class="spv-side spv-back"
      role="button"
      tabindex="0"
      :aria-label="t.profile.back"
      @click="goBack"
      @keydown.enter.prevent="goBack"
      @keydown.space.prevent="goBack"
    >
      <view class="spv-glass">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
    </view>
    <view class="spv-titlewrap">
      <text v-if="displayTitle" class="spv-title">{{ displayTitle }}</text>
      <text v-if="subtitle" class="spv-sub">{{ subtitle }}</text>
    </view>
    <view
      class="spv-side spv-bell relative"
      role="button"
      tabindex="0"
      :aria-label="t.me.notifications"
      @click="goBell"
      @keydown.enter.prevent="goBell"
      @keydown.space.prevent="goBell"
    >
      <view class="spv-glass">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        <view v-if="unread > 0" class="spv-belldot" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { PENDING_BAR_INSET_KEY } from "@/store/pending-checkout-core";
import { useMessageDrawer } from "@/store/message-drawer";
import { useNotifications } from "@/store/notifications";
import { useT } from "@/i18n/use-t";
import { resolveHeaderTitleText } from "@/lib/header-title";
import { navBack } from "@/lib/route";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";

const props = defineProps<{ back: string; title?: string; subtitle?: string }>();
// 待支付浮动条在场时 chassis 让内容整体下让一带,并把同一个值 provide 下来:sticky 行钉在带的下沿,
// 不与浮动条重叠(chassis 外渲染 / 无条时为 0)。
const pendingBarInset = inject(PENDING_BAR_INSET_KEY, ref(0));

const drawer = useMessageDrawer();
const notifications = useNotifications();
const t = useT();
const unread = computed(() => notifications.unread);
const rowH = computed(() => (props.subtitle ? 56 : 44));

// Current uni route — last entry in getCurrentPages() (same readRoute() pattern
// as app-chassis.vue). Used to derive a route-based title when none is passed.
function readRoute(): string {
  try {
    const ps = getCurrentPages();
    return ps.length ? ((ps[ps.length - 1] as { route?: string }).route ?? "") : "";
  } catch {
    return "";
  }
}

// Display title precedence: explicit prop → route-derived title → "" (empty →
// .spv-title v-if doesn't render, matching the prototype's unmapped="" behaviour).
// Mirrors Nexion-prototype header.tsx computeTitle.
const displayTitle = computed(() => props.title ?? resolveHeaderTitleText(readRoute(), t.value.headerTitles));
const statusBarHeight = computed(() => {
  try { return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight(); } catch { return h5DevicePreviewStatusBarHeight(); }
});

function goBack() {
  navBack(props.back);
}
function goBell() {
  drawer.show();
}
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
  padding: 0 12px;
  /* Global header→content breathing (owner 2026-07-09: nav sat too close to
     content across every sub-page). One place, all ~55 sub-pages; tab pages use
     the chassis header so they're untouched. Pages must NOT add their own top
     padding on top of this — reset to 0 when de-carding. */
  margin-bottom: 24px;
  background: var(--v5-chrome-bg);
  border-bottom: 1px solid var(--v5-chrome-border);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
}
.spv-side {
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
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--v5-glass-bg);
  border: 1px solid var(--v5-glass-border);
  box-shadow: var(--v5-glass-shadow);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
}
.spv-titlewrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
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
