<template>
  <!-- Earnings milestone celebration overlay. Driven by useMilestones().active.
       Ported from Nexion-prototype/app/components/milestone-watcher.tsx — React
       Confetti + framer-motion replaced with CSS @keyframes (App webview has no
       react-dom portal / framer). App.vue's 4s poll calls store.show() (enqueue);
       this host pumps store.advance(route) on a short interval so celebrations
       stay suspended on money-flow routes (checkout / withdraw / trial) and
       replay one-by-one afterwards; each shown one auto-dismisses after
       OVERLAY_DURATION_MS. -->
  <view v-if="m.active" class="ms-overlay" role="dialog" aria-modal="true">
    <!-- Backdrop dim + blur — lowers chassis noise so the medal is the focus.
         Tap-to-dismiss lives HERE (the full-screen scrim), not on the overlay root:
         the medal card then needs no @click.stop swallow handler — a no-op click
         listener made the card a "tap target without :active feedback" for the
         tap-feedback probe (tester-F R2 / 包 ax). Halo + confetti are pointer-events:none,
         so taps there fall through to this scrim exactly as before. -->
    <view class="ms-backdrop" @click="m.dismiss()" />

    <!-- Glow halo behind the medal card. -->
    <view class="ms-halo" />

    <!-- CSS confetti burst — fixed particle set, varied via per-particle style. -->
    <view class="ms-confetti">
      <view
        v-for="p in particles"
        :key="p.i"
        class="ms-particle"
        :style="p.style"
      />
    </view>

    <!-- Medal card -->
    <view class="ms-card">
      <view class="ms-card__inner">
        <view class="ms-medal">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v5-brand)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </view>

        <text class="ms-amount">${{ thresholdLabel }}+</text>
        <text class="ms-title">{{ titleText }}</text>
        <text class="ms-body">{{ bodyText }}</text>

        <view class="ms-chip">
          <text class="ms-chip__label">{{ chipText }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from "vue";
import { useMilestones } from "@/store/milestones";
import { usePopupArbiter } from "@/store/popup-arbiter";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const OVERLAY_DURATION_MS = 5_200;
const PARTICLE_COUNT = 36;
const ADVANCE_TICK_MS = 300;

const m = useMilestones();
const arbiter = usePopupArbiter();
const voucherClaimSheet = useVoucherClaimSheet();
const trialClaimSheet = useTrialClaimSheet();
const t = useT();

// ── Queue pump — same route source as global-ui.vue readRoute / App.vue
//    readCurrentRoute (getCurrentPages, no leading slash; H5 hash fallback). ──
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

// 令牌同步 —— 庆祝浮层与领取弹层共用一个「此刻谁占屏」的裁决点(store/popup-arbiter)。
// 每一拍都把令牌对齐到真实状态,而不是在 promote / dismiss / park 三条出口上分别挂钩:
// 出口漏接一个就会把令牌永久扣住,之后谁都再弹不出来;而对齐写法天然幂等,
// 页面栈里 N 份宿主副本同时跑也收敛到同一结果(uni 不卸载被压住的页面)。
function pumpCelebrationQueue() {
  const route = readRoute();
  // 🔴 「屏上有没有别人」不能只问令牌:领取弹层可以被用户从 banner 手动打开,那条路径
  // 不经仲裁(申请失败也照开),令牌因此会与屏幕真实状态背离。独立审计实测的后果是
  // 庆祝在弹层背后播完 5.2s 被 dismiss 消耗掉,而 markFired 早已落盘 —— 用户永远
  // 看不到这一级奖励通知。所以直接问弹层开没开。
  const sheetOpen = voucherClaimSheet.open || trialClaimSheet.open;
  // B1「一次进首页只弹一个」:名额用掉后,本次进首页不再放新的庆祝上屏。
  // 只拦首页、且只拦**新上屏**;已在放的那条不受影响(C1 永不顶替)。
  const homeSlotUsed = route === "pages/index/index" && arbiter.visitClaimed;
  m.advance(route, arbiter.busyForOthers("milestone") || sheetOpen || homeSlotUsed);
  if (m.active) arbiter.acquire("milestone");
  else arbiter.release("milestone"); // persist-verdict-ok: 弹层令牌释放(popup-arbiter),void 无判决,非资金 / 落盘原语
}

let advTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  advTimer = setInterval(pumpCelebrationQueue, ADVANCE_TICK_MS);
});

// ── Derived copy (i18n) ──
const thresholdLabel = computed(() =>
  m.active ? m.active.threshold.toLocaleString() : "",
);

const titleText = computed(() =>
  m.active ? fmt(t.value.milestones.title, { amount: m.active.threshold.toLocaleString() }) : "",
);

const bodyText = computed(() => {
  if (!m.active) return "";
  const ns = t.value.milestones as Record<string, string>;
  return ns[m.active.label] ?? ns.genericBody;
});

const chipText = computed(() =>
  m.active
    ? fmt(t.value.milestones.nexChip, { amount: m.active.nexReward.toLocaleString() })
    : "",
);

// ── CSS confetti — deterministic per-particle styles (no runtime randomness in
//    template; computed once). Each particle gets an angle, distance, color,
//    delay, size, and rotation baked into inline style consumed by @keyframes. ──
const CONFETTI_COLORS = [
  "var(--v5-brand)",
  "var(--v5-tech-cyan)",
  "var(--v5-warning)",
  "var(--v5-brand-2)",
  "var(--v5-ink)",
];

interface Particle {
  i: number;
  style: Record<string, string>;
}

const particles = computed<Particle[]>(() => {
  // Re-seeded per fire via active.id so each celebration looks fresh.
  const seedStr = m.active?.id ?? "";
  let seed = 0;
  for (let k = 0; k < seedStr.length; k++) seed = (seed * 31 + seedStr.charCodeAt(k)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = rand() * Math.PI * 2;
    const dist = 90 + rand() * 200;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const color = CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)];
    const size = 6 + rand() * 7;
    const delay = rand() * 0.45;
    const dur = 3.4 + rand() * 1.6;
    const rot = (rand() - 0.5) * 1200;
    return {
      i,
      style: {
        "--dx": `${dx.toFixed(1)}px`,
        "--dy": `${dy.toFixed(1)}px`,
        "--rot": `${rot.toFixed(0)}deg`,
        "--cdelay": `${delay.toFixed(2)}s`,
        "--cdur": `${dur.toFixed(2)}s`,
        width: `${size.toFixed(1)}px`,
        height: `${(size * 0.42).toFixed(1)}px`,
        background: color,
      },
    };
  });
});

// ── Auto-dismiss timer — restarts on each new fire ──
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

watch(
  () => m.active?.id,
  (id) => {
    clearTimer();
    if (id != null) {
      timer = setTimeout(() => m.dismiss(), OVERLAY_DURATION_MS);
    }
  },
  // 🔴 immediate 必须留着:切底部 tab 走的是 reLaunch,会**真卸载**整个页面栈
  // (不是 deactivate),新页面挂载出一份新宿主。而 active 是 Pinia 态、跨卸载存活 ——
  // 不加 immediate,新宿主对这条**继承来的**庆祝不会安排关闭定时器,于是它永远不关,
  // 泵每拍都重新 acquire 令牌,代金券/试用弹层此后整个会话再也拿不到令牌(死锁)。
  { immediate: true },
);

onUnmounted(() => {
  clearTimer();
  if (advTimer !== null) {
    clearInterval(advTimer);
    advTimer = null;
  }
  // 宿主被摘掉时(如切到静态走查路由)必须还令牌,否则占屏状态会一直扣着,
  // 领取弹层此后永远拿不到令牌 —— 死锁比多弹一次严重得多。
  arbiter.release("milestone"); // persist-verdict-ok: 弹层令牌释放(popup-arbiter),void 无判决,非资金 / 落盘原语
});

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
// m.active 是「当前正在庆祝的那一档」对象而不是布尔,判空才是"开着没开着"。
useDialogA11y(computed(() => m.active !== null), ".ms-overlay", () => m.dismiss());
</script>

<style scoped>
/* 层级契约(2026-08-03 三路走查同族修复;2026-08-16 补齐业务半屏那一面):
   庆祝弹层必须压在**业务 UI 之下** —
   .ms-overlay(780) < 业务半屏(790/800) < .nx-toast-host(9000) < .nx-mask(9100)。

   🔴 8900 是这句话没被兑现的那些年:契约原文一直写着「必须在业务 UI 之下」,
   数值却压在全部业务半屏(790/800)之上 —— 实测表现为庆祝浮层叠在代金券领取弹层
   正上方,并用自带的 backdrop blur 把它糊掉数十秒。两道门当时都是绿的:
   zindex-order.mjs 的阶梯只排了登录/注册页共挂的 6 层,业务半屏一条都不在表里;
   selfcheck-milestone-queue 也只比了庆祝对 toast / 对 .nx-mask。
   现在两道门都补了业务半屏这一面,改回 ≥790 会红。

   时间维度的互斥另有一层(store/popup-arbiter):有别的自动弹层占屏时庆祝根本不上屏。
   本层级是它的兜底 —— 万一时间维度失效,庆祝也只会垫在业务 UI 底下,不会盖住它。 */
.ms-overlay {
  position: fixed;
  inset: 0;
  z-index: 780;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Backdrop — dark dim + blur over the chassis behind. */
.ms-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
}

/* Radial glow halo centered behind the card. */
.ms-halo {
  position: absolute;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(
    45% 45% at 50% 50%,
    color-mix(in oklab, var(--v5-brand) 55%, transparent),
    color-mix(in oklab, var(--v5-brand-2) 18%, transparent) 45%,
    transparent 78%
  );
  animation: ms-halo-pulse 3.2s ease-out forwards;
  pointer-events: none;
}

@keyframes ms-halo-pulse {
  0% { opacity: 0; transform: scale(0.6); }
  12% { opacity: 0.9; transform: scale(1); }
  45% { opacity: 0.5; }
  100% { opacity: 0; transform: scale(1.15); }
}

/* ── Confetti ── */
.ms-confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ms-particle {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 2px;
  opacity: 0;
  animation: ms-particle-fly var(--cdur, 4s) cubic-bezier(0.18, 0.9, 0.32, 1) var(--cdelay, 0s) forwards;
}
@keyframes ms-particle-fly {
  0% {
    transform: translate(-50%, -50%) scale(1.3) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 520px)) scale(0.5) rotate(var(--rot));
    opacity: 0;
  }
}

/* ── Medal card ── */
.ms-card {
  position: relative;
  width: 88%;
  max-width: 300px;
  border-radius: 18px;
  padding: 20px;
  overflow: hidden;
  background:
    radial-gradient(70% 60% at 50% 0%, color-mix(in oklab, var(--v5-brand) 22%, transparent) 0%, transparent 70%),
    radial-gradient(60% 50% at 50% 100%, color-mix(in oklab, var(--v5-tech-cyan) 14%, transparent) 0%, transparent 70%),
    var(--v5-surface);
  box-shadow: var(--v5-card-shadow-lift-strong);
  animation: ms-card-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes ms-card-pop {
  0% { transform: scale(0.6) translateY(24px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
.ms-card__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ms-medal {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--v5-brand-soft);
  animation: ms-medal-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}
@keyframes ms-medal-pop {
  0% { transform: scale(0.3) rotate(-25deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.ms-amount {
  margin-top: 12px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  color: var(--v5-brand);
  font-variant-numeric: tabular-nums;
}
.ms-title {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-ink);
}
.ms-body {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--v5-ink-3);
}
.ms-chip {
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--v5-tech-cyan-soft);
}
.ms-chip__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-tech-cyan-ink);
  font-variant-numeric: tabular-nums;
}
</style>
