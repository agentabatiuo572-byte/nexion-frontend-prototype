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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>

      <NovaAvatar v-if="isAi" :size="40" pulse />
      <view v-else class="cp-ava" :style="avaStyle">
        <view v-html="headerIcon" />
      </view>

      <view class="cp-meta">
        <text class="cp-name">{{ headerName }}</text>
        <view class="cp-role">
          <view class="cp-dot" :style="dotStyle" />
          <text class="cp-role-t">{{ headerRole }}</text>
        </view>
      </view>
      <view v-if="!isAi && conv && !isClosedSession" class="cp-ticket active:opacity-70" role="button" tabindex="0" :aria-label="t.conversations.convertTicket" @click="onConvertToTicket">
        <text>{{ t.conversations.convertTicket }}</text>
      </view>
    </view>

    <view v-if="isAi && remoteApiEnabled" class="cp-ai-safety" role="note">
      <text class="cp-ai-safety-t">{{ t.nova.localSafetyNotice }}</text>
    </view>

    <!-- Thread body (messages + chips + input) -->
    <ConversationThread
      :messages="threadMessages"
      :input-placeholder="inputPlaceholder"
      :quick-chips="quickChips"
      :empty-hint="emptyHint"
      :typing="agentTyping"
      :typing-label="t.conversations.agentTyping"
      :reveal-tick="revealTick"
      :closed="isClosedSession"
      :restart-label="isAi && remoteApiEnabled ? t.nova.localRetry : t.conversations.restartSession"
      @send="onSend"
      @chip="onChip"
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
import { ref, computed, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onUnload, onShow, onHide } from "@dcloudio/uni-app";
import NovaAvatar from "@/components/nova/nova-avatar.vue";
import ConversationThread from "@/components/support/conversation-thread.vue";
import GlobalUi from "@/components/global-ui.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import type { ThreadMsg, QuickChip } from "@/components/support/thread-types";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo, navBack } from "@/lib/route";
import { createSendLimiter } from "@/lib/send-limiter";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";
import { isDeviceOnline } from "@/lib/hashpower";
import { useConversations } from "@/store/conversations";
import { useNova } from "@/store/nova";
import { useApp } from "@/store/app";
import { toast } from "@/store/ui";
import { replyToQuickPrompt, type QuickPromptKey } from "@/mock/nova-templates";
import type { ConversationType } from "@/domain/support";
import { novaAiApi, remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import { useLocaleStore } from "@/store/locale";

const t = useT();
const convStore = useConversations();
const nova = useNova();
const app = useApp();
const locale = useLocaleStore();

const cid = ref("");
const isAi = ref(false);
const initialPrompt = ref("");
// Nova availability belongs only to ?type=ai. Human advisor/support routes must
// never inherit a provisional local-model state before their route is resolved.
const novaProviderHold = ref(false);
const novaStatusLoading = ref(false);
const novaAiRequestInFlight = ref(false);
let novaStatusEpoch = 0;
const startType = ref<Exclude<ConversationType, "ai"> | null>(null);
const HUMAN_THREAD_POLL_MS = 5_000;
let humanThreadPoll: ReturnType<typeof setTimeout> | undefined;
let humanThreadEpoch = 0;
let humanThreadVisible = false;
let humanThreadPollInFlight = false;

function stopHumanThreadPolling() {
  humanThreadVisible = false;
  humanThreadEpoch += 1;
  if (humanThreadPoll !== undefined) clearTimeout(humanThreadPoll);
  humanThreadPoll = undefined;
  humanThreadPollInFlight = false;
}

async function pollHumanThread() {
  const pollEpoch = humanThreadEpoch;
  const activeId = cid.value;
  if (!humanThreadVisible || isAi.value || !activeId || humanThreadPollInFlight) return;
  humanThreadPollInFlight = true;
  try {
    await convStore.open(activeId, () => humanThreadVisible && pollEpoch === humanThreadEpoch && activeId === cid.value);
    if (!humanThreadVisible || pollEpoch !== humanThreadEpoch || activeId !== cid.value) return;
  } catch {
    // Preserve the last authoritative snapshot while a transient poll fails.
  } finally { humanThreadPollInFlight = false; }
}

function startHumanThreadPolling(openEpoch: number) {
  if (humanThreadPoll !== undefined) clearTimeout(humanThreadPoll);
  humanThreadPoll = undefined;
  if (humanThreadVisible && openEpoch === humanThreadEpoch && !isAi.value && cid.value) {
    const schedule = () => {
      humanThreadPoll = setTimeout(async () => {
        await pollHumanThread();
        if (humanThreadVisible && openEpoch === humanThreadEpoch) schedule();
      }, HUMAN_THREAD_POLL_MS);
    };
    schedule();
  }
}

// Bare full-screen page (no AppChassis), so it must reserve the device status-bar
// space itself. Match the chassis source (real device height, else the H5
// device-preview simulated height) — env(safe-area-inset-top) is 0 inside the H5
// shell iframe, which left the header tucked under the simulated status bar.
const statusBarHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});
// Bumped on every re-reveal so the thread re-pins to the newest message. uni H5
// navigateTo pushes a keep-alive page and hides it with display:none (zeroing the
// inner list's scrollTop); on navigateBack the page is re-shown, not re-mounted,
// so neither onMounted nor the messages/typing watch fires — without this the list
// would sit stuck at the top after any forward-then-back (P1: "messages vanished").
const revealTick = ref(0);

onLoad((q) => {
  if (q?.type === "ai") {
    isAi.value = true;
    if (typeof q?.prompt === "string") initialPrompt.value = q.prompt.trim().slice(0, 800);
    return;
  }
  if (typeof q?.cid === "string") {
    cid.value = q.cid;
    return;
  }
  if (q?.start === "advisor" || q?.start === "support") startType.value = q.start;
});

// onShow/onHide track the hidden-but-alive state that onUnload/onUnmounted miss.
// onShow fires on first open AND on navigateBack re-reveal; onHide fires when a
// forward navigateTo hides this page. Managing Nova's open flag here (not only in
// cleanup) fixes the unread-suppression bug: leaving the AI chat forward used to
// leave isOpen=true forever, so every later proactive push silently zeroed unread.
// While a human-support thread is on screen the idle state machine must advance
// LIVE (quiet 1 min → in-thread countdown warning; quiet 5 min → auto-close), so a
// coarse interval keeps calling the sweep. Store-side idempotence (idleWarnedAt /
// sessionStatus guards) makes redundant ticks free. A real backend pushes these
// events — the interval then becomes a harmless no-op.
onShow(async () => {
  revealTick.value += 1;
  if (isAi.value) {
    if (remoteApiEnabled) nova.bindRemoteAccount(app.accountKey);
    nova.open(); // mark Nova as being viewed → clears + tracks unread
    if (remoteApiEnabled) await refreshNovaAvailability();
  }
  else if (cid.value) {
    humanThreadVisible = true;
    const openEpoch = humanThreadEpoch;
    const openId = cid.value;
    try { await convStore.open(cid.value, () => humanThreadVisible && openEpoch === humanThreadEpoch && openId === cid.value); } catch {
      if (!humanThreadVisible || openEpoch !== humanThreadEpoch) return;
      navBack("/pages/support/messages");
      return;
    }
    if (humanThreadVisible && openEpoch === humanThreadEpoch && openId === cid.value) startHumanThreadPolling(openEpoch);
  }
});
onHide(() => {
  if (isAi.value) nova.close(); // no longer viewing Nova → later pushes accrue unread
  stopHumanThreadPolling();
});

const ADVISOR_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21a6 6 0 0 1 12 0" /></svg>`;
const SUPPORT_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>`;

const conv = computed(() => (cid.value ? convStore.get(cid.value) : undefined));
const humanType = computed<Exclude<ConversationType, "ai"> | null>(() =>
  conv.value?.type === "advisor" || conv.value?.type === "support" ? conv.value.type : startType.value,
);

// Timed-out support session → thread is read-only history with a restart CTA.
const isClosedSession = computed(() =>
  isAi.value ? novaProviderHold.value : conv.value?.sessionStatus === "closed",
);

const headerName = computed(() => {
  if (isAi.value) return t.value.nova.name;
  if (conv.value) return displayAgentName(conv.value.agentName);
  return humanType.value === "advisor" ? t.value.conversations.typeAdvisor : humanType.value === "support" ? t.value.conversations.typeSupport : "";
});

function displayAgentName(name: string): string {
  const normalized = name.trim();
  return normalized && normalized.toLowerCase() !== "unassigned"
    ? normalized
    : t.value.conversations.unassignedAgent;
}
const agentTyping = computed(() =>
  isAi.value ? nova.typing : (cid.value ? convStore.typingIds[cid.value] === true : false),
);
const headerRole = computed(() => {
  if (agentTyping.value) return t.value.conversations.agentTyping;
  if (isAi.value && novaStatusLoading.value) return t.value.nova.localConnecting;
  if (isAi.value && novaProviderHold.value) return t.value.nova.localUnavailable;
  if (isAi.value && remoteApiEnabled) return t.value.nova.localRole;
  if (isAi.value) return t.value.conversations.roleAi;
  if (startType.value) return t.value.conversations.startConversation;
  if (!conv.value) return "";
  if (isClosedSession.value) return t.value.conversations.sessionEnded;
  return t.value.conversations[conv.value.roleKey];
});
const headerTint = computed(() =>
  isAi.value ? "var(--v5-brand-2)" : conv.value?.avatarTint ?? (humanType.value === "advisor" ? "var(--v5-brand)" : "var(--v5-tech-cyan)"),
);
// Presence dot: closed session must not claim "online" — grey it and stop the pulse.
const dotStyle = computed<CSSProperties>(() =>
  isClosedSession.value
    ? { background: "var(--v5-ink-4)", animation: "none" }
    : { background: headerTint.value },
);
const headerIcon = computed(() => (humanType.value === "advisor" ? ADVISOR_ICON : SUPPORT_ICON));
const avaStyle = computed<CSSProperties>(() => ({
  color: headerTint.value,
  background: `color-mix(in srgb, ${headerTint.value} 14%, transparent)`,
}));

const inputPlaceholder = computed(() =>
  isAi.value && novaProviderHold.value
    ? t.value.nova.localUnavailable
    : isAi.value
      ? remoteApiEnabled ? t.value.nova.localInputPlaceholder : t.value.nova.inputPlaceholder
      : t.value.conversations.inputPlaceholder,
);
const emptyHint = computed(() => {
  if (isAi.value && novaStatusLoading.value) return t.value.nova.localConnecting;
  if (isAi.value && novaProviderHold.value) return t.value.nova.localUnavailable;
  if (isAi.value) return remoteApiEnabled ? t.value.nova.localEmptyHint : t.value.nova.emptyHint;
  return humanType.value === "advisor" ? t.value.conversations.listEmptyAdvisor : t.value.conversations.listEmptySupport;
});

const quickChips = computed<QuickChip[]>(() =>
  isAi.value && !novaProviderHold.value
    ? [
        ...(initialPrompt.value ? [{ key: "search-query", emoji: "🔎", label: initialPrompt.value }] : []),
        { key: "explain-today", emoji: "📦", label: quickLabel("explain-today") },
        { key: "how-to-boost", emoji: "🎫", label: quickLabel("how-to-boost") },
        { key: "whats-hot", emoji: "🔐", label: quickLabel("whats-hot") },
        { key: "show-top-jobs", emoji: "💬", label: quickLabel("show-top-jobs") },
      ]
    : [],
);

// Receipt shown on the LAST user-sent message only (iMessage convention — keeps
// the column quiet while still answering "did they see it?").
function receiptFor(status: "sent" | "read" | undefined, isLastUserMsg: boolean): string | undefined {
  if (!status || !isLastUserMsg) return undefined;
  return status === "read" ? t.value.conversations.receiptRead : t.value.conversations.receiptSent;
}

const threadMessages = computed<ThreadMsg[]>(() => {
  if (isAi.value) {
    const msgs = nova.messages;
    const lastUser = msgs.map((m) => m.sender).lastIndexOf("user");
    return msgs.map((m, i) => ({
      id: m.id,
      side: m.sender === "user" ? "right" : "left",
      tone: m.sender === "user" ? "user" : "agent",
      text: m.text,
      receipt: receiptFor(m.status, i === lastUser),
      ctaLabel: m.ctaLabel,
      ctaHref: m.ctaHref,
    }));
  }
  const c = conv.value;
  if (!c) return [];
  const lastUser = c.messages.map((m) => m.sender).lastIndexOf("user");
  return c.messages.map((m, i) => ({
    id: m.id,
    side: m.sender === "user" ? "right" : "left",
    tone: m.sender === "user" ? "user" : m.sender === "system" ? "system" : "agent",
    text: m.text,
    receipt: receiptFor(m.status, i === lastUser),
  }));
});

// Restart returns to the same server-backed compose path. A durable conversation
// is created only after the user submits the opening message.
function onRestart() {
  if (isAi.value && remoteApiEnabled) {
    void refreshNovaAvailability();
    return;
  }
  navTo("/pages/support/chat?start=support");
}

async function refreshNovaAvailability() {
  if (!remoteApiEnabled || !isAi.value) return;
  const epoch = ++novaStatusEpoch;
  const accountKey = app.accountKey;
  novaStatusLoading.value = true;
  try {
    const status = await novaAiApi.status();
    if (epoch !== novaStatusEpoch || accountKey !== app.accountKey) return;
    novaProviderHold.value = !status.available;
  } catch {
    if (epoch !== novaStatusEpoch || accountKey !== app.accountKey) return;
    novaProviderHold.value = true;
  } finally {
    if (epoch === novaStatusEpoch && accountKey === app.accountKey) novaStatusLoading.value = false;
  }
}

function quickLabel(k: QuickPromptKey): string {
  if (remoteApiEnabled) {
    switch (k) {
      case "explain-today": return t.value.nova.localQOrder;
      case "how-to-boost": return t.value.nova.localQTicket;
      case "whats-hot": return t.value.nova.localQSecurity;
      case "show-top-jobs": return t.value.nova.localQHuman;
    }
  }
  switch (k) {
    case "explain-today": return t.value.nova.qExplainToday;
    case "how-to-boost": return t.value.nova.qHowToBoost;
    case "whats-hot": return t.value.nova.qWhatsHot;
    case "show-top-jobs": return t.value.nova.qShowTopJobs;
  }
}

// One-shot reply timers — tracked so they can be cancelled if the user leaves the
// chat before the reply lands. Otherwise a ghost reply posts to the singleton store
// after unmount; for AI it would also bump unread once isOpen is reset below.
const pendingTimers: ReturnType<typeof setTimeout>[] = [];
function schedule(fn: () => void, ms: number) {
  pendingTimers.push(setTimeout(fn, ms));
}
function cleanup() {
  stopHumanThreadPolling();
  pendingTimers.forEach(clearTimeout);
  pendingTimers.length = 0;
  // Cancelled timers would otherwise leave a ghost "typing…" flag on the store
  // (it bleeds into the list preview) — always drop it on the way out.
  nova.setTyping(false);
  // Reset Nova's open flag (the AI chat page acted as the "open" view). Without this
  // isOpen stays true forever and every future proactive push would silently zero
  // unread → the bubble would never surface Nova news again after one AI visit.
  if (isAi.value) nova.close();
}
onUnload(cleanup);
onUnmounted(cleanup);

// ── send rate limit — anti-spam guard across every channel of this chat
// (advisor / support / AI free text, incl. quick chips). A real backend answers
// 429 + Retry-After with the same policy; the limiter mirrors that contract.
const SEND_MAX = 5; // max sends…
const SEND_WINDOW_MS = 15_000; // …per rolling window
const SEND_MIN_GAP_MS = 1000; // min gap between two consecutive sends
const sendLimiter = createSendLimiter(SEND_MAX, SEND_WINDOW_MS, SEND_MIN_GAP_MS);

function acquireSendSlot(): boolean {
  const verdict = sendLimiter.tryAcquire();
  if (!verdict.ok) {
    toast.warn(
      t.value.conversations.rateLimited,
      fmt(t.value.conversations.rateLimitedRetry, { n: verdict.retryInSec }),
    );
  }
  return verdict.ok;
}

// Reply choreography (ms after send): agent reads → types → answers.
const AI_TYPING_ON_MS = 300;
const AI_REPLY_MS = 1100;

async function onSend(text: string, restore?: () => void) {
  if (!acquireSendSlot()) {
    restore?.(); // rejected send must not swallow the typed message
    return;
  }
  if (isAi.value) {
    if (remoteApiEnabled) {
      if (novaProviderHold.value || novaStatusLoading.value || novaAiRequestInFlight.value) {
        restore?.();
        toast.info(t.value.nova.localUnavailable, t.value.nova.localRetry);
        return;
      }
      const accountKey = app.accountKey;
      const history = nova.messages.slice(-10).map((message) => ({
        role: message.sender === "user" ? "user" as const : "assistant" as const,
        content: message.text,
      }));
      nova.sendUser(text);
      nova.markUserRead();
      nova.setTyping(true);
      novaAiRequestInFlight.value = true;
      try {
        const result = await novaAiApi.chat({
          message: text,
          language: locale.code === "zh" || locale.code === "vi" ? locale.code : "en",
          history,
        });
        if (accountKey !== app.accountKey) return;
        nova.push({ kind: "nova-reply", text: result.reply });
      } catch (error) {
        if (accountKey !== app.accountKey) return;
        const failure = asApiError(error);
        if (["NOVA_AI_DISABLED", "NOVA_AI_UNAVAILABLE"].includes(failure.message)) novaProviderHold.value = true;
        nova.push({ kind: "nova-reply", text: t.value.nova.localFailed });
        toast.error(t.value.nova.localFailed, t.value.nova.localRetry);
      } finally {
        if (accountKey === app.accountKey) nova.setTyping(false);
        else nova.bindRemoteAccount(app.accountKey);
        novaAiRequestInFlight.value = false;
      }
      return;
    }
    nova.sendUser(text);
    nova.markUserRead(); // Nova reads instantly
    schedule(() => nova.setTyping(true), AI_TYPING_ON_MS);
    schedule(() => {
      nova.setTyping(false);
      nova.push({ kind: "nova-reply", text: t.value.conversations.aiFreeFormReply });
    }, AI_REPLY_MS);
    return;
  }
  const id = cid.value;
  if (!id) {
    const type = startType.value;
    if (!type) {
      restore?.();
      return;
    }
    try {
      cid.value = await convStore.startConversation(type, text);
      startType.value = null;
      revealTick.value += 1;
    } catch {
      restore?.();
      toast.error(t.value.conversations.convertTicketFailed, "");
    }
    return;
  }
  try { await convStore.sendUser(id, text); } catch { restore?.(); toast.error(t.value.conversations.convertTicketFailed, ""); }
}

async function onConvertToTicket() {
  const current = conv.value;
  if (!current) return;
  try {
    const ticketId = await convStore.convertToTicket(current.id, "technical", `Conversation ${current.id}`);
    navTo(`/pages/me/support-tickets?ticket=${encodeURIComponent(ticketId)}`);
  } catch { toast.error(t.value.conversations.convertTicketFailed, ""); }
}

function onChip(key: string) {
  if (remoteApiEnabled) {
    const message = key === "search-query" ? initialPrompt.value : quickLabel(key as QuickPromptKey);
    if (key === "search-query") initialPrompt.value = "";
    void onSend(message);
    return;
  }
  if (!acquireSendSlot()) return;
  const k = key as QuickPromptKey;
  const onlineCount = app.visibleDevices.filter((d) => d.activatedAt !== null && isDeviceOnline(d, Date.now())).length;
  nova.sendUser(quickLabel(k), "user-quick");
  nova.markUserRead();
  schedule(() => nova.setTyping(true), AI_TYPING_ON_MS);
  schedule(() => {
    nova.setTyping(false);
    nova.push(replyToQuickPrompt(t.value, k, { earningsToday: app.earnings.today, devices: app.visibleDevices, onlineCount }));
  }, AI_REPLY_MS);
}

function onCta(href: string) {
  navTo(href);
}

function goBack() {
  navBack("/pages/support/messages");
}
</script>

<style scoped>
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
</style>
