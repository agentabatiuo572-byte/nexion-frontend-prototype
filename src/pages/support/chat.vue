<!--
  Conversation chat — full-screen thread for one conversation. Bare full-screen
  (own header + ConversationThread), NOT wrapped in AppChassis: a focused chat wants
  no tabbar / nova bubble, and its own flex column (header + scrolling messages +
  pinned input) would fight the chassis scroll container. Not standalone-page-shell
  either: the pinned input row owns the bottom safe-area itself (P-040), which the
  shell's reserved band would double — so this page draws its own status bar and
  home indicator.

  query ?type=ai     → backed by the nova store (Nova): quick prompt chips (human
                       support lives in the conversation center's support tab).
  query ?cid=<id>    → backed by the conversations store (advisor / support).

  A separate route (vs in-page state) means each open gets a fresh onLoad, sidestepping
  the H5 same-page hash-query staleness (P-044/P-049). Bare text in <text> (P-026).
-->
<template>
  <view class="cp-root">
    <!-- Simulated device status bar (preview shell only) — bare page draws its own. -->
    <DeviceStatusBar />

    <!-- Header -->
    <view class="cp-head" :style="{ paddingTop: statusBarHeight + 10 + 'px' }">
      <view class="cp-back active:opacity-60" role="button" tabindex="0" :aria-label="t.conversations.back" @click="goBack">
        <LiquidGlass :radius="22" />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>

      <view class="cp-ava" :style="avaStyle">
        <view v-html="headerIcon" />
      </view>

      <view class="cp-meta">
        <text class="cp-name">{{ headerName }}</text>
        <view class="cp-role">
          <view class="cp-dot" :style="dotStyle" />
          <text class="cp-role-t">{{ headerRole }}</text>
        </view>
      </view>
    </view>

    <view v-if="loading" class="cp-state" role="status"><text>{{ t.help.loadingMore }}</text></view>
    <view v-if="loadError" class="cp-state" role="alert"><text>{{ t.conversations.loadError }}</text><view role="button" tabindex="0" @click="load"><text>{{ t.conversations.retry }}</text></view></view>
    <view v-if="historyCursor" class="cp-state" role="button" :tabindex="historyBusy ? -1 : 0" :aria-disabled="historyBusy" @click="loadEarlier"><text>{{ historyBusy ? t.help.loadingMore : t.conversations.loadEarlier }}</text></view>

    <!-- Thread body (messages + chips + input) -->
    <ConversationThread
      :messages="threadMessages"
      :input-placeholder="inputPlaceholder"
      :draft-value="draft"
      :disabled="loading || sending"
      :send-label="t.conversations.send"
      :image-error-label="t.conversations.image.failed"
      :input-label="t.conversations.inputPlaceholder"
      :empty-hint="emptyHint"
      :typing="agentTyping"
      :typing-label="t.conversations.agentTyping"
      :reveal-tick="revealTick"
      :closed="isClosedSession"
      :restart-label="t.conversations.restartSession"
      @send="onSend"
      @draft="saveDraft"
      @retry-image="load"
      @cta="onCta"
      @restart="onRestart"
    />

    <!-- Home Indicator — bare page (no AppChassis) draws its own. Sits over the input
         row's bottom safe-area padding; pointer-events:none so it never blocks the input. -->
    <view class="cp-home">
      <DeviceHomeIndicator />
    </view>

    <!-- Overlay host — this is a bare full-screen page (no AppChassis), so it must
         carry its own GlobalUi or toast/confirm/netError raised here (e.g. the send
         rate-limit warning) would post to the store with nothing rendering them. -->
    <GlobalUi />
  </view>
</template>

<script setup lang="ts">
import LiquidGlass from "@/components/liquid-glass.vue";
import { ref, computed, watch, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onUnload, onShow, onHide } from "@dcloudio/uni-app";
import ConversationThread from "@/components/support/conversation-thread.vue";
import GlobalUi from "@/components/global-ui.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import type { ThreadMsg } from "@/components/support/thread-types";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo, navBack } from "@/lib/route";
import { createSendLimiter } from "@/lib/send-limiter";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { useConversations } from "@/store/conversations";
import { useApp } from "@/store/app";
import { toast } from "@/store/ui";
import { presentRecommendation, localMessageImage } from "@/components/support/message-presentation";
import { useLocaleStore } from "@/store/locale";

const t = useT(), convStore = useConversations(), app = useApp(), locale = useLocaleStore();
const cid = ref(""), draft = ref(""), loading = ref(false), loadError = ref(false), sending = ref(false);
const revealTick = ref(0), historyBusy = ref(false);
let visible = false, epoch = 0, timer: ReturnType<typeof setTimeout> | undefined;
let limiter = createSendLimiter(5, 15000, 1000);
let legacyAiRoute = false;
const draftKey = computed(() => cid.value || "new:advisor");
const conv = computed(() => convStore.get(cid.value) ?? convStore.historyRows.find(row => row.id === cid.value));
const isClosedSession = computed(() => conv.value?.status === "transferred");
const headerName = computed(() => t.value.conversations.typeAdvisor);
const agentTyping = computed(() => Object.values(convStore.typingIds).some(Boolean));
const headerRole = computed(() => loading.value ? t.value.help.loadingMore : isClosedSession.value ? t.value.conversations.sessionTransferred : agentTyping.value ? t.value.conversations.agentTyping : t.value.conversations.roleAdvisor);
const headerIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M6 21a6 6 0 0 1 12 0"/></svg>';
const avaStyle: CSSProperties = { color: "var(--v5-brand)", background: "var(--v5-brand-soft)" };
const dotStyle: CSSProperties = { background: "var(--v5-ink-4)", animation: "none" };
const inputPlaceholder = computed(() => t.value.conversations.inputPlaceholder);
const emptyHint = computed(() => t.value.conversations.listEmptyAdvisor);
const statusBarHeight = computed(() => { try { return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight(); } catch { return h5DevicePreviewStatusBarHeight(); } });
const historyCursor = computed(() => convStore.historyRows.find(row => row.historyNextCursor));
const allMessages = computed(() => [...new Map(convStore.historyRows.flatMap(row => row.messages).map(message => [message.id, message])).values()]
  .sort((a, b) => a.ts - b.ts || Number(a.id) - Number(b.id)));

const threadMessages = computed<ThreadMsg[]>(() => {
  const rows = allMessages.value, lastUser = rows.map(message => message.sender).lastIndexOf("user");
  return rows.map((message, i) => ({
    id: message.id, side: message.sender === "user" ? "right" : "left",
    tone: message.sender === "system" ? "system" : message.sender === "user" ? "user" : "agent",
    text: message.kind === "IMAGE" && !message.text ? t.value.conversations.image.message : message.text,
    imageSrc: message.kind === "IMAGE" ? localMessageImage(message.imageSrc) : undefined,
    imageLabel: message.kind === "IMAGE" ? t.value.conversations.image.view : undefined,
    imageError: message.kind === "IMAGE" && !localMessageImage(message.imageSrc),
    meta: (message.sender === "user" ? t.value.conversations.image.you : message.authorName || t.value.conversations.typeAdvisor)
      + " · " + new Date(message.ts).toLocaleString(locale.code === "zh" ? "zh-CN" : locale.code === "vi" ? "vi-VN" : "en-US"),
    receipt: message.sender === "user" && i === lastUser && message.status ? message.status === "read" ? t.value.conversations.receiptRead : t.value.conversations.receiptSent : undefined,
    ...presentRecommendation(message, t.value.conversations.recommendation),
  }));
});
function current(request: number, account: string) { return visible && epoch === request && app.accountKey === account; }
async function load() {
  if (!visible || loading.value) return;
  const request = epoch, account = app.accountKey;
  loading.value = true; loadError.value = false;
  try {
    await convStore.refresh();
    if (!current(request, account)) return;
    if (cid.value) await convStore.open(cid.value, () => current(request, account));
    if (!current(request, account)) return;
    await convStore.loadHumanHistory(() => current(request, account));
    if (current(request, account)) draft.value = convStore.readDraft(draftKey.value);
  } catch { if (current(request, account)) loadError.value = true; }
  finally { if (current(request, account)) loading.value = false; }
}
async function loadEarlier() {
  if (historyBusy.value || !historyCursor.value) return;
  const request = epoch, account = app.accountKey;
  historyBusy.value = true;
  try { await convStore.loadEarlier(historyCursor.value.id, () => current(request, account)); }
  catch { if (current(request, account)) loadError.value = true; }
  finally { if (current(request, account)) historyBusy.value = false; }
}
function saveDraft(value: string) {
  draft.value = value;
  try { convStore.saveDraft(draftKey.value, value); } catch { loadError.value = true; }
}
async function onSend(text: string, restore?: () => void) {
  if (sending.value || loading.value || isClosedSession.value) { restore?.(); return; }
  const verdict = limiter.tryAcquire();
  if (!verdict.ok) { restore?.(); toast.warn(t.value.conversations.rateLimited, fmt(t.value.conversations.rateLimitedRetry, { n: verdict.retryInSec })); return; }
  const account = app.accountKey, request = epoch, oldKey = draftKey.value;
  sending.value = true;
  try {
    if (!cid.value) {
      const id = await convStore.startConversation("advisor", text);
      if (!current(request, account)) return;
      cid.value = id;
    } else await convStore.sendUser(cid.value, text);
    if (!current(request, account)) return;
    convStore.saveDraft(oldKey, ""); convStore.saveDraft(draftKey.value, ""); draft.value = "";
    await convStore.loadHumanHistory(() => current(request, account)); revealTick.value++;
  } catch { if (current(request, account)) { restore?.(); saveDraft(text); toast.error(t.value.conversations.image.sendFailed, ""); } }
  finally { if (current(request, account)) sending.value = false; }
}
function onRestart() { cid.value = ""; draft.value = convStore.readDraft("new:advisor"); }
function onCta(href: string) { navTo(href); }
function goBack() { navBack("/pages/me/notifications?section=service"); }
function stop() { visible = false; epoch++; loading.value = false; sending.value = false; historyBusy.value = false; clearTimeout(timer); }
function schedule() { clearTimeout(timer); timer = setTimeout(async () => { if (!visible) return; await load(); if (visible) schedule(); }, 5000); }
onLoad(query => { if (query?.type === "ai") { legacyAiRoute = true; navTo("/pages/me/notifications?section=service"); } else if (typeof query?.cid === "string") cid.value = query.cid; });
onShow(() => { if (legacyAiRoute) return; visible = true; revealTick.value++; void load(); schedule(); });
onHide(stop); onUnload(stop); onUnmounted(stop);
watch(() => [app.accountKey, convStore.scopeRevision], () => { epoch++; cid.value = ""; draft.value = ""; sending.value = false; loading.value = false; loadError.value = false; limiter = createSendLimiter(5, 15000, 1000); if (visible) void load(); });
watch(() => convStore.historyRows.map(row => row.lastPublicMessageId).join("|"), () => {
  const request = epoch, account = app.accountKey;
  if (visible && !loading.value) void convStore.loadHumanHistory(() => current(request, account)).catch(() => { if (current(request, account)) loadError.value = true; });
});
</script>

<style scoped>
.cp-state { padding:8px 16px; color:var(--v5-ink-3); font-size:13px; display:flex; gap:12px; align-items:center; }
.cp-state[role="button"], .cp-state [role="button"] { min-height:44px; display:flex; align-items:center; color:var(--v5-brand); }
.cp-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--v5-bg);
}
.cp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 12px;
  /* top padding is bound inline to the device status-bar height (see cp-head :style) */
  border-bottom: 1px solid var(--v5-border);
}
.cp-ai-safety {
  padding: 8px 16px;
  background: color-mix(in srgb, var(--v5-tech-cyan) 8%, var(--v5-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--v5-tech-cyan) 18%, var(--v5-border));
}
.cp-ai-safety-t {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  color: var(--v5-ink-3);
}
.cp-back {
  /* 《07》tap≥44:原 36×36。负 margin 由 -6 调到 -10,图标视觉位置不动、只有热区变大 */
  width: 44px;
  height: 44px;
  margin-left: -10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.cp-ava {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.cp-meta {
  flex: 1;
  min-width: 0;
}
.cp-ticket {
  min-height: 44px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  color: var(--v5-brand);
  font-size: 12px;
  font-weight: 600;
}
.cp-name {
  display: block;
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.008em;
  color: var(--v5-ink);
}
.cp-role {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.cp-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  animation: mc-pulse 1.6s ease-in-out infinite;
}
.cp-role-t {
  font-size: 12px;
  color: var(--v5-ink-3);
}
/* Home Indicator overlay — pinned to the bottom safe area over the input row's
   padding (.cp-root is position:fixed, so absolute anchors to it). */
.cp-home {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 110;
  pointer-events: none;
}
.cp-back { position: relative; overflow: visible; }
.cp-back > svg { position: relative; z-index: 1; }
</style>
