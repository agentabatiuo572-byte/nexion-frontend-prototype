<!--
  MessageDrawer — chassis-level slide-in notification drawer. Ported from
  Nexion-prototype/app/components/message-drawer.tsx.
    · framer-motion slide-from-right + backdrop fade → CSS transform/opacity
      @keyframes (App has no DOM, P-009).
    · lucide icons (Bell / X / CheckCheck / ChevronDown / ArrowRight + per-kind)
      → inline <svg stroke> (dual-end webview).
    · <button onClick> / <Link>           → <view @click> (P-036).
    · all bare text wrapped in <text>       (P-026).

  Data source differs from the prototype, which used a hardcoded MESSAGES array:
  this reads the live notifications store (src/store/notifications.ts `items`) so
  the drawer and the /me/notifications page share one feed + read state. Open
  state comes from the dedicated src/store/message-drawer.ts (NOT ui.ts). The
  chassis header BELL calls useMessageDrawer().show(); always mounted so the
  slide-in/out plays. Root is a fixed full-bleed scrim + absolute panel — the
  same shape as every other business half-sheet (see .md-root note below).

  i18n: reuses the existing `notifs` namespace (kind labels / markAll / empty
  states + drawer-only drawerTitle / unreadCount / allCaughtUp / prefsFooter).
-->
<template>
  <view v-if="drawer.open" class="md-root">
    <!-- Backdrop -->
    <view class="md-backdrop" @click="close" />

    <!-- Panel — slides in from chassis right -->
    <view class="md-panel">
      <!-- Header -->
      <view class="md-head">
        <view class="md-head-l">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <view class="md-head-meta">
            <text class="md-head-title">{{ t.notifs.drawerTitle }}</text>
            <text class="md-head-sub">{{ unreadLabel }}</text>
          </view>
        </view>
        <view class="md-close" role="button" tabindex="0" :aria-label="t.ui.close" @click="close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- Tabs (category filter) -->
      <scroll-view scroll-x class="md-tabs" :show-scrollbar="false">
        <view class="md-tabs-inner">
          <template v-for="id in filterIds" :key="id">
            <view
              v-if="id === 'all' || countOf(id) > 0"
              class="md-tab"
              :class="{ 'md-tab--on': filter === id }"
              role="tab"
              tabindex="0"
              :aria-selected="filter === id ? 'true' : 'false'"
              @click="filter = id"
            >
              <text class="md-tab-t" :class="{ 'md-tab-t--on': filter === id }">{{ filterLabel(id) }}</text>
              <view v-if="countUnread(id) > 0" class="md-tab-badge" :class="{ 'md-tab-badge--on': filter === id }">
                <text class="md-tab-badge-t" :class="{ 'md-tab-badge-t--on': filter === id }">{{ countUnread(id) }}</text>
              </view>
            </view>
          </template>
          <view class="md-tabs-spacer" />
          <view v-if="unread > 0" class="md-markall" role="button" tabindex="0" :aria-label="t.notifs.markAll" @click="markAll">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></svg>
            <text class="md-markall-t">{{ t.notifs.markAll }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- List -->
      <scroll-view scroll-y class="md-list" :show-scrollbar="false">
        <view v-if="notifs.error" class="md-empty">
          <text class="md-empty-t">{{ notifsErrorText }}</text>
          <view class="md-detail-cta" data-testid="drawer-notification-retry" role="button" tabindex="0" :aria-label="t.ui.retry" @click="notifs.retryRemote()"><text class="md-detail-cta-t">{{ t.ui.retry }}</text></view>
        </view>
        <view v-if="filtered.length === 0" class="md-empty">
          <text class="md-empty-t">{{ emptyText }}</text>
        </view>

        <view
          v-for="n in filtered"
          :key="n.id"
          class="md-item"
          :class="{ 'md-item--unread': !n.readAt }"
        >
          <view class="md-row" role="button" tabindex="0" :aria-expanded="expandedId === n.id ? 'true' : 'false'" :aria-label="n.title" @click="toggle(n)">
            <view class="md-row-ico" :style="iconBoxStyle(n.kind, !n.readAt)">
              <view v-html="kindIcon(n.kind, !n.readAt)" />
            </view>
            <view class="md-row-body">
              <view class="md-row-titlewrap">
                <text class="md-row-title" :style="{ color: n.readAt ? 'var(--v5-ink-3)' : 'var(--v5-ink)' }">{{ n.title }}</text>
                <view v-if="!n.readAt" class="md-unread-dot" />
                <view class="md-chevron" :class="{ 'md-chevron--open': expandedId === n.id }">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="n.readAt ? 'var(--v5-ink-4)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </view>
              </view>
              <text v-if="n.body" class="md-row-preview" :style="{ color: n.readAt ? 'var(--v5-ink-4)' : 'var(--v5-ink-3)' }">{{ n.body }}</text>
              <text class="md-row-time" :style="{ color: 'var(--v5-ink-4)' }">{{ timeAgo(n.ts) }}</text>
            </view>
          </view>

          <!-- accordion detail -->
          <view v-if="expandedId === n.id" class="md-detail">
            <view class="md-detail-inner">
              <text v-if="n.body" class="md-detail-body">{{ n.body }}</text>
              <text class="md-detail-abs tabular-nums">{{ absoluteTime(n.ts) }}</text>
              <view v-if="n.ctaLabel && n.ctaHref" class="md-detail-cta" role="button" tabindex="0" :aria-label="n.ctaLabel" @click.stop="onCta(n)">
                <text class="md-detail-cta-t">{{ n.ctaLabel }}</text>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- Footer -->
      <view class="md-foot">
        <text class="md-foot-t">{{ t.notifs.prefsFooter }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useMessageDrawer } from "@/store/message-drawer";
import { useNotifications, type NotifKind, type Notification } from "@/store/notifications";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { navTo } from "@/lib/route";

const t = useT();
const drawer = useMessageDrawer();
const notifs = useNotifications();
// 同 notifications.vue:抽屉挂在 app-chassis,全站每页都能弹出这块,
// 裸插值 notifs.error 会把 SESSION_EXPIRED 这类工程码送到任意页面的用户眼前。
const notifsErrorText = computed(() => notifs.error ? t.value.notifs.loadFailed : "");

type Filter = "all" | NotifKind;
const filter = ref<Filter>("all");
const filterIds: Filter[] = ["all", "commission", "team", "staking", "market", "genesis", "system"];
const expandedId = ref<string | null>(null);

// Per-kind label key + tint + inline-svg path — mirrors the notifications page so
// the drawer and full page read identically.
const KIND_META: Record<NotifKind, { labelKey: string; tint: string }> = {
  commission: { labelKey: "kindMoney", tint: "var(--v5-success)" },
  team: { labelKey: "kindTeam", tint: "var(--v5-tech-cyan)" },
  staking: { labelKey: "kindStaking", tint: "var(--v5-success)" },
  market: { labelKey: "kindMarket", tint: "var(--v5-warning)" },
  genesis: { labelKey: "kindGenesis", tint: "var(--v5-brand-2)" },
  system: { labelKey: "kindSystem", tint: "var(--v5-tech-cyan)" },
};
const KIND_ICON: Record<NotifKind, string> = {
  commission: `<path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />`,
  team: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  staking: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
  market: `<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />`,
  genesis: `<path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" />`,
  system: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />`,
};
function kindIcon(k: NotifKind, unreadRow: boolean): string {
  const stroke = unreadRow ? KIND_META[k].tint : "var(--v5-ink-4)";
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[k]}</svg>`;
}

const unread = computed(() => notifs.unread);
const unreadLabel = computed(() =>
  unread.value > 0 ? fmt(t.value.notifs.unreadCount, { n: unread.value }) : t.value.notifs.allCaughtUp,
);

const filtered = computed(() =>
  filter.value === "all" ? notifs.items : notifs.items.filter((x) => x.kind === filter.value),
);
function countOf(id: Filter): number {
  return id === "all" ? notifs.items.length : notifs.items.filter((x) => x.kind === id).length;
}
function countUnread(id: Filter): number {
  const src = id === "all" ? notifs.items : notifs.items.filter((x) => x.kind === id);
  return src.filter((x) => !x.readAt).length;
}

function filterLabel(id: Filter): string {
  const key = id === "all" ? "filterAll" : KIND_META[id].labelKey;
  return (t.value.notifs as unknown as Record<string, string>)[key];
}
const emptyText = computed(() =>
  notifs.items.length === 0
    ? t.value.notifs.emptyAllTitle
    : fmt(t.value.notifs.emptyFilterTitle, { filter: filterLabel(filter.value) }),
);

function toggle(n: Notification) {
  notifs.markRead(n.id);
  expandedId.value = expandedId.value === n.id ? null : n.id;
}
function markAll() {
  notifs.markAllRead();
}
function close() {
  drawer.close();
}
// 🔴 焦点管理:遮罩只拦指针不拦键盘 —— 抽屉此前一个 tabindex 都没有,键盘用户既进不来
// (关闭 / 分类 / 标记全读 / 条目 CTA 全都 Tab 不到)、Tab 又会径直走到背景的提现下单按钮。
// 这个洞一直在,只是 .md-root 之前写成 position:absolute,机器门不把它当全屏弹层所以看不见;
// 本轮改成 fixed 后门立刻判红(a11y-activate [G]),按仓内统一写法接平台层。
// Enter/Space 由 lib/a11y-activate.ts 自动补,故上面只声明 role + tabindex,不手写 @keydown。
useDialogA11y(computed(() => drawer.open), ".md-root", close);
async function onCta(notification: Notification) {
  const canonicalRoute = await notifs.recordCta(notification.id);
  if (!canonicalRoute) return;
  close();
  navTo(canonicalRoute);
}

function timeAgo(ts: number): string {
  const mins = Math.max(1, Math.floor((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
function absoluteTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function iconBoxStyle(k: NotifKind, unreadRow: boolean): CSSProperties {
  // Prototype: backgroundColor `${iconColor}1A` = 0x1A/0xFF ≈ 10% alpha.
  return {
    background: `color-mix(in srgb, ${KIND_META[k].tint} 10%, transparent)`,
    opacity: unreadRow ? 1 : 0.5,
  };
}
</script>

<style scoped>
/* 🔴 层级 790/800 = 业务半屏带,与 trial-claim / voucher-claim 等同档(秩序表单源见
   captcha-slider.vue)。原值 110/120 低于里程碑庆祝(780),抽屉开着时庆祝画在它上面
   并模糊背景 —— 抽屉是用户主动点铃铛打开的,庆祝是自动弹的,谁让谁没有悬念。
   position 由 absolute 改 fixed:与其余 19 个全屏遮罩同形,几何上等价(.nx-chassis 本身
   就是 fixed + inset:0,无 transform 祖先),但**同形才进得了机器门的扫描面** ——
   scripts/zindex-order.mjs 契约③ 只认 position:fixed 的满屏遮罩,写成 absolute 时
   这块对门是隐形的(实测:把它从豁免清单里摘掉,门照样 0 违例)。 */
.md-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.md-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: md-fade 0.18s ease-out;
}
.md-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  width: 88%;
  display: flex;
  flex-direction: column;
  background: var(--v5-surface);
  border-left: 1px solid var(--v5-surface-3);
  animation: md-slide-in 0.28s ease-out;
}
@keyframes md-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes md-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
/* ── header ── */
.md-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--v5-surface-2);
}
.md-head-l {
  display: flex;
  align-items: center;
  gap: 8px;
}
.md-head-meta {
  display: flex;
  flex-direction: column;
}
.md-head-title {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.25;
}
.md-head-sub {
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 1px;
}
.md-close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
/* ── tabs ── */
.md-tabs {
  white-space: nowrap;
  border-bottom: 1px solid color-mix(in srgb, var(--v5-surface-2) 60%, transparent);
}
.md-tabs-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
}
.md-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--v5-surface);
  border: 1px solid transparent;
}
.md-tab--on {
  background: color-mix(in srgb, var(--v5-brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--v5-brand) 35%, transparent);
}
.md-tab-t {
  font-family: var(--font-v5);
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink-3);
}
.md-tab-t--on {
  color: var(--v5-brand);
}
.md-tab-badge {
  min-width: 16px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--v5-brand-2);
}
.md-tab-badge--on {
  background: var(--v5-brand);
}
.md-tab-badge-t {
  font-size: 12px;
  font-weight: 600;
  /* badge 底是 --v5-brand-2(暖橙);白字在其上 WCAG 不过(见 tokens.css on-brand-2 注释) */
  color: var(--v5-on-brand-2);
  line-height: 1;
}
.md-tab-badge-t--on {
  color: var(--v5-on-brand);
}
.md-tabs-spacer {
  flex: 1;
  min-width: 8px;
}
.md-markall {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
}
.md-markall-t {
  font-size: 12px;
  color: var(--v5-brand);
}
/* ── list ── */
.md-list {
  flex: 1;
  min-height: 0;
}
.md-empty {
  padding: 48px 20px;
  text-align: center;
}
.md-empty-t {
  font-size: 13px;
  color: var(--v5-ink-3);
}
.md-item {
  border-bottom: 1px solid color-mix(in srgb, var(--v5-surface-2) 60%, transparent);
}
.md-item--unread {
  background: color-mix(in srgb, var(--v5-brand) 3%, transparent);
}
.md-row {
  display: flex;
  gap: 12px;
  padding: 14px 20px;
}
.md-row-ico {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.md-row-body {
  flex: 1;
  min-width: 0;
}
.md-row-titlewrap {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.md-row-title {
  flex: 1;
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.25;
}
.md-unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--v5-brand);
  margin-top: 3px;
  flex-shrink: 0;
}
.md-chevron {
  margin-top: 1px;
  flex-shrink: 0;
  transition: transform 0.2s;
}
.md-chevron--open {
  transform: rotate(180deg);
}
.md-row-preview {
  display: block;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.375;
}
.md-row-time {
  display: block;
  font-size: 12px;
  margin-top: 6px;
}
/* ── accordion detail ── */
.md-detail {
  overflow: hidden;
  animation: md-detail-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes md-detail-in {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 240px; }
}
.md-detail-inner {
  margin-left: 48px;
  padding: 4px 20px 16px;
  border-left: 2px solid var(--v5-surface-2);
}
.md-detail-body {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-2);
  line-height: 1.625;
}
.md-detail-abs {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-4);
  margin-top: 10px;
}
.md-detail-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  margin-top: 12px;
  border-radius: 8px;
  background: var(--v5-brand);
}
.md-detail-cta-t {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
/* ── footer ── */
.md-foot {
  padding: 12px 20px;
  text-align: center;
  border-top: 1px solid var(--v5-surface-2);
}
.md-foot-t {
  font-size: 12px;
  color: var(--v5-ink-4);
}
</style>
