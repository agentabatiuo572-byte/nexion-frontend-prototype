<!--
  ChainPaymentInstructions — USDT-TRC20 / USDT-BEP20 / USDT-ERC20 pay screen for
  one pending-checkout session (the "invoice" the checkout opened on entering
  this step): faux-QR + copyable address + countdown to `session.expiresAt`.
  Address / amount / deadline all come from the session (single source) so a
  resumed session shows the SAME address with a CONTINUOUS countdown.
  Nothing here advances on its own: only the user's "I've completed the payment"
  tap emits `complete` (the former 12s auto-detect timer that simulated a deposit
  arriving is gone — it turned "cancel" into a 12-second button and pushed users
  into a debit they never confirmed). At 00:00 the screen flips to the expired
  state: address hidden, no way to complete, single exit `restart`.
-->
<template>
  <view class="rounded-2xl overflow-hidden" :style="cardStyle">
    <!-- Header -->
    <view class="flex items-center border-b" :style="headerStyle">
      <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
      </view>
      <view class="flex-1 min-w-0">
        <text class="block" :style="headerTitleStyle">{{ expired ? network : sendLabel }}</text>
        <text v-if="!expired" class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ t.store.coNetworkConfirms }}</text>
      </view>
      <view class="flex items-center tabular-nums" style="gap: 4px; font-size: 12px; color: var(--v5-warning)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
        <text>{{ countdown }}</text>
      </view>
    </view>

    <!-- === expired: the address is dead, nothing can be completed here === -->
    <view v-if="expired" class="flex flex-col items-center text-center" style="padding: 24px 20px 16px; gap: 8px">
      <view class="grid place-items-center" :style="expiredIconStyle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      </view>
      <text class="block" :style="expiredTitleStyle">{{ t.store.pendingExpiredTitle }}</text>
      <text class="block" style="font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); text-wrap: pretty; padding: 0 8px">{{ t.store.pendingExpiredBody }}</text>
      <view class="w-full inline-flex items-center justify-center active:opacity-90 active:scale-[0.98]" :style="confirmBtnStyle" style="margin-top: 12px" role="button" tabindex="0" :aria-label="t.store.pendingStartAgain" @click.stop="emitRestart">
        <text>{{ t.store.pendingStartAgain }}</text>
      </view>
    </view>

    <template v-else>
      <!-- QR + address -->
      <view class="flex flex-col items-center" style="padding: 20px; gap: 12px">
        <view class="rounded-xl grid place-items-center" style="width: 140px; height: 140px; background: #ffffff">
          <!-- Faux-QR: deterministic dot grid (no real encoding — pure visual).
               #fff/#000 are a B/W contrast design asset, NOT theme-tokenized. -->
          <svg viewBox="0 0 120 120" style="width: 120px; height: 120px">
            <rect width="120" height="120" fill="#ffffff" />
            <rect v-for="c in qrCells" :key="c.i" :x="c.x" :y="c.y" :width="cell" :height="cell" fill="#000000" />
          </svg>
        </view>
        <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coOrPaste }}</text>
        <view class="w-full flex items-center rounded-xl active:opacity-90" :style="addressBtnStyle" role="button" tabindex="0" :aria-label="t.store.coAddressCopied" @click.stop="copyAddress">
          <text class="flex-1 font-mono" style="text-align: left; font-size: 12px; color: var(--v5-ink-2); word-break: break-all">{{ session.address }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
        </view>
      </view>

      <!-- Amount / Network grid -->
      <view class="grid" style="padding: 0 20px 12px; grid-template-columns: 1fr 1fr; gap: 12px">
        <view>
          <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coAmount }}</text>
          <text class="block tabular-nums" :style="gridValStyle">{{ amountLabel }}</text>
        </view>
        <view>
          <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coNetwork }}</text>
          <text class="block" :style="gridValStyle">{{ network }}</text>
        </view>
      </view>

      <!-- Confirm + cancel -->
      <view style="padding: 8px 16px 16px">
        <view class="w-full inline-flex items-center justify-center active:opacity-90 active:scale-[0.98]" :style="confirmBtnStyle" role="button" tabindex="0" :aria-label="t.store.coCompletedPayment" @click.stop="emitComplete">
          <text>{{ t.store.coCompletedPayment }}</text>
        </view>
        <view class="w-full grid place-items-center active:opacity-70" :style="cancelBtnStyle" role="button" tabindex="0" :aria-label="t.store.pendingCancelConfirm" @click.stop="emitCancel">
          <text>{{ t.store.pendingCancelConfirm }}</text>
        </view>
        <text class="block text-center" style="font-size: 12px; color: var(--v5-ink-4); padding-top: 4px; line-height: 1.5; text-wrap: pretty">{{ sendExactLabel }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { mockServerNow } from "@/store/server-time";
import { formatCountdown, sessionSecondsLeft, type PendingCheckoutSession } from "@/store/pending-checkout-core";
import { fnv1a, mulberry32 } from "@/store/deposits-core";

const props = defineProps<{ session: PendingCheckoutSession }>();
const emit = defineEmits<{ complete: []; cancel: []; restart: [] }>();

const t = useT();

const network = computed(() =>
  props.session.method === "usdt-trc20"
    ? "USDT-TRC20"
    : props.session.method === "usdt-bep20"
      ? "USDT-BEP20"
      : "USDT-ERC20",
);

const sendLabel = computed(() => fmt(t.value.store.coSendNetwork, { network: network.value }));
const sendExactLabel = computed(() => fmt(t.value.store.coSendExact, { network: network.value }));
const amountLabel = computed(() => `${props.session.amountUsdt.toLocaleString()} USDT`);

// ── countdown: derived from the session deadline, never from a local start
// time — a resumed session keeps counting from where it really is. ──
const nowTick = ref(mockServerNow());
const secLeft = computed(() => sessionSecondsLeft(props.session, nowTick.value));
const expired = computed(() => secLeft.value <= 0);
const countdown = computed(() => formatCountdown(secLeft.value));
let countdownTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  countdownTimer = setInterval(() => { nowTick.value = mockServerNow(); }, 1000);
});
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

function copyAddress() {
  if (expired.value) return;
  uni.setClipboardData({
    data: props.session.address,
    success: () => toast.success(t.value.store.coAddressCopied, t.value.store.coAddressCopiedSub),
    fail: () => {},
  });
}

function emitComplete() {
  // Dead address can never be "completed" — belt for the v-else, braces for a
  // tap that races the tick.
  if (expired.value) return;
  emit("complete");
}

function emitCancel() {
  emit("cancel");
}

function emitRestart() {
  emit("restart");
}

// ── Faux-QR cells (deterministic from the session address) ──
const QR_SIZE = 21;
const cell = 120 / QR_SIZE;
const qrCells = computed<{ i: number; x: number; y: number }[]>(() => {
  // Seeded PRNG shared with the deposit pane (deposits-core). The old inline LCG
  // multiplied past 2^53 and lost its low bits → every address drew an all-white
  // grid with only the finder squares (looked broken).
  const rnd = mulberry32(fnv1a(props.session.address));
  const arr: boolean[] = [];
  for (let i = 0; i < QR_SIZE * QR_SIZE; i++) arr.push(rnd() > 0.52);
  // Force the 3 finder squares (TL / TR / BL) — classic QR look
  const setSquare = (cx: number, cy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const i = (cy + y) * QR_SIZE + (cx + x);
        const onBorder = y === 0 || y === 6 || x === 0 || x === 6;
        const onInner = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        arr[i] = onBorder || onInner;
      }
  };
  setSquare(0, 0);
  setSquare(QR_SIZE - 7, 0);
  setSquare(0, QR_SIZE - 7);
  const out: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    out.push({ i, x: (i % QR_SIZE) * cell, y: Math.floor(i / QR_SIZE) * cell });
  }
  return out;
});

// ─── styles ───
// bg-filled card → zero border(带 bg 的容器不加边框,2026-07-09 终裁);层级靠 surface 微差。
const cardStyle: CSSProperties = { background: "var(--v5-surface)" };
const headerStyle: CSSProperties = { padding: "16px 20px", gap: "12px", borderColor: "color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const iconBoxStyle: CSSProperties = { width: "36px", height: "36px", borderRadius: "8px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)" };
const headerTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const addressBtnStyle: CSSProperties = {
  padding: "12px",
  gap: "8px",
  background: "var(--v5-surface-2)",
};
const gridValStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  marginTop: "2px",
};
const confirmBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
// Cancel stays visibly weaker than the pay CTA(conversion 场景 Cancel 权重必弱)。
const cancelBtnStyle: CSSProperties = {
  marginTop: "8px",
  height: "44px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-3)",
  fontSize: "13px",
};
const expiredIconStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "var(--v5-warning-soft)",
};
const expiredTitleStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
</script>
