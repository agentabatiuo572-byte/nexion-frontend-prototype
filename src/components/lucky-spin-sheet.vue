<!--
  LuckySpinSheet — chassis-level full-cover spin-wheel sheet. Ported from
  Nexion-prototype/app/components/lucky-spin-sheet.tsx.
    · framer slide-up / fade  → shared tokens.css keyframes (nx-sheet-*)
    · framer wheel spring     → inline `transition: transform 3.6s` on the <g>
                                (animates between two wheelAngle values; no
                                 keyframe needed) + @transitionend settle
    · lucide X/Sparkles/Gift/ChevronRight/Ticket/History → inline <svg>
    · zustand store           → useLuckySpin (Pinia); payout 走 lib/money-receipt
                                收口点(资金与账单同生共死),不在这里各调各的
                                (stores never import each other).
  Entry points (orchestrator wires triggers):
    ① /events evt-spring-spin "Spin now" (kind === "wheel") → openSheet()
    ② /daily Day-30 milestone → grantBonusTicket(1) + openSheet()
  Neutral, conversational copy; zero mock exposure. All i18n via t.luckySpin.*.
-->
<template>
  <view v-if="spin.open" class="lss-root" role="dialog" aria-modal="true">
    <view class="lss-backdrop nx-sheet-fade-in" @click="onBackdrop" />

    <view class="lss-panel nx-sheet-slide-up" @click.stop>
      <!-- header -->
      <view class="lss-head">
        <view class="lss-head-l">
          <view class="lss-gift-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" /></svg>
          </view>
          <view class="lss-head-meta">
            <text class="lss-cap">{{ t.luckySpin.capLabel }}</text>
            <text class="lss-title">{{ t.luckySpin.title }}</text>
          </view>
        </view>
        <view class="lss-close" :aria-label="t.luckySpin.closeAria" @click="handleClose">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- 护栏降级 banner(售罄 / 红线降级)-->
      <view v-if="!realActive" class="lss-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
        <text class="lss-banner-t">{{ realPrizeSoldOut ? t.luckySpin.soldoutBanner : t.luckySpin.degradedBanner }}</text>
      </view>

      <!-- 票况 + 社会证明 -->
      <view class="lss-tickets">
        <view class="lss-chips">
          <view v-if="hasFreeToday" class="lss-chip lss-chip-free">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
            <text class="lss-chip-t lss-chip-t-free">{{ t.luckySpin.freeSpinChip }}</text>
          </view>
          <view v-if="spin.bonusTickets > 0" class="lss-chip lss-chip-bonus">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
            <text class="lss-chip-t lss-chip-t-bonus">{{ bonusChip }}</text>
          </view>
        </view>
        <text v-if="!remoteApiEnabled" class="lss-social">{{ socialProofText }}</text>
      </view>

      <!-- ───────── 转盘 ───────── -->
      <view class="lss-wheel-wrap">
        <!-- pointer(顶部固定指针)-->
        <view class="lss-pointer" />
        <svg viewBox="0 0 200 200" width="248" height="248" class="lss-wheel-svg">
          <!-- rim -->
          <circle :cx="CX" :cy="CY" :r="R + 4" fill="none" stroke="var(--v5-border-strong)" stroke-width="3" />
          <!-- Slices + their SVG <text> labels are injected via v-html so uni's H5
               compiler doesn't rewrite the in-SVG <text> into <uni-text> (which the
               browser won't render as SVG text → invisible prize labels, P-007 family). -->
          <g :style="wheelStyle" @transitionend="onWheelTransitionEnd" v-html="slicesSvg" />
          <!-- hub -->
          <circle :cx="CX" :cy="CY" r="20" fill="var(--v5-surface-3)" stroke="var(--v5-border-strong)" stroke-width="2" />
        </svg>
      </view>

      <!-- ───────── CTA 区(phase 驱动)───────── -->
      <view class="lss-cta-zone">
        <!-- 中奖庆祝 -->
        <view v-if="spin.phase === 'won' && wonPrize" class="lss-won" :style="wonCardStyle">
          <text class="lss-won-label">{{ isJackpot ? t.luckySpin.jackpotTitle : t.luckySpin.wonTitle }}</text>
          <text class="lss-won-prize" :style="wonPrizeStyle">{{ ls(wonPrize) }}</text>
          <text class="lss-won-hint">{{ wonPrize.kind === "coupon" ? t.luckySpin.couponHint : t.luckySpin.creditedHint }}</text>
          <view class="lss-won-actions">
            <template v-if="available > 0">
              <view class="lss-btn-collect-sm" @click="collect">
                <text class="lss-btn-collect-sm-t">{{ t.luckySpin.collect }}</text>
              </view>
              <view class="lss-btn-again" @click="onSpinAgain">
                <text class="lss-btn-again-t">{{ t.luckySpin.spinAgain }}</text>
              </view>
            </template>
            <view v-else class="lss-btn-collect" @click="collect">
              <text class="lss-btn-collect-t">{{ t.luckySpin.collect }}</text>
            </view>
          </view>
        </view>

        <!-- idle / spinning(有次数)-->
        <view v-else-if="available > 0" class="lss-spin-btn" :class="{ 'lss-spin-btn-busy': spin.phase === 'spinning' }" :style="spinBtnStyle" @click="onSpinClick">
          <text v-if="spin.phase === 'spinning'" class="lss-spin-btn-t">{{ t.luckySpin.spinningLabel }}</text>
          <template v-else>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
            <text class="lss-spin-btn-t">{{ t.luckySpin.spinCta }}</text>
          </template>
        </view>

        <!-- 无次数:今日已抽完 → 倒计时 + 去签到攒券引导 -->
        <view v-else class="lss-nospin">
          <text class="lss-nospin-title">{{ t.luckySpin.noSpinTitle }}</text>
          <text class="lss-nospin-hint">{{ noSpinHintText }}</text>
          <view class="lss-earn-cta" @click="goEarnTicket">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
            <text class="lss-earn-cta-t">{{ t.luckySpin.earnTicketCta }}</text>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </view>
        </view>
      </view>

      <!-- 奖池一览(透明度)-->
      <view class="lss-pool-toggle" @click="poolOpen = !poolOpen">
        <text class="lss-pool-toggle-t">{{ t.luckySpin.poolTitle }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lss-pool-chev" :class="{ 'lss-pool-chev-open': poolOpen }"><path d="m9 18 6-6-6-6" /></svg>
      </view>
      <view v-if="poolOpen" class="lss-pool-grid">
        <view v-for="sp in prizes" :key="sp.id" class="lss-pool-item" :style="{ opacity: sp.isReal && !realActive ? 0.45 : 1 }">
          <view class="lss-pool-dot" :style="{ background: sp.tint }" />
          <text class="lss-pool-name">{{ ls(sp) }}</text>
        </view>
      </view>

      <!-- 我的中奖 -->
      <view v-if="historyRows.length > 0" class="lss-hist">
        <view class="lss-hist-head">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
          <text class="lss-hist-head-t">{{ t.luckySpin.historyTitle }}</text>
        </view>
        <view class="lss-hist-rows">
          <view v-for="(row, idx) in historyRows" :key="`${row.ts}-${idx}`" class="lss-hist-row">
            <text class="lss-hist-name">{{ row.label }}</text>
            <text class="lss-hist-time">{{ row.time }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from "vue";
import type { CSSProperties } from "vue";
import {
  useLuckySpin,
  SPIN_PRIZES,
  type SpinPrize,
} from "@/store/lucky-spin";
import { postMoneyBill } from "@/lib/money-receipt";
import { mockServerNow } from "@/store/server-time";
import { toast, confirm, netError } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { remoteApiEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";

const R = 94; // wheel radius (viewBox 200)
const CX = 100;
const CY = 100;
const MOCK_NET_FAIL_RATE = 0.08; // mock: 区块链拥堵演示(server 侧真实裁决)

const spin = useLuckySpin();
const app = useApp();
const t = useT();

const poolOpen = ref(false);
let accountGeneration = 0;

// social proof — mock 实时数(不必准确,营造真平台氛围)
const winnersToday = 247;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round((CX + radius * Math.cos(rad)) * 100) / 100,
    y: Math.round((CY + radius * Math.sin(rad)) * 100) / 100,
  };
}

/** mock UTC 次日 0 点倒计时文案 hh:mm */
function untilUtcResetLabel(): string {
  const now = remoteApiEnabled ? Date.now() : mockServerNow();
  const serverReset = remoteApiEnabled ? spin.nextResetAtUtc() : null;
  if (remoteApiEnabled && !serverReset) return "—";
  const d = new Date(now);
  const next = serverReset ? Date.parse(serverReset)
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
  if (!Number.isFinite(next)) return "—";
  const ms = next - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// re-derive each render (depends on time + persisted flags)
const hasFreeToday = computed(() => spin.hasFreeSpinToday());
const available = computed(() => spin.availableSpins());
const realActive = computed(() => spin.realPrizeActive());
const realPrizeSoldOut = computed(() => spin.realPrizeSoldOut);

const ls = (sp: SpinPrize) => t.value.luckySpin.prizes[sp.labelKey as keyof typeof t.value.luckySpin.prizes]
  || sp.rewardName || sp.id;
const lsShort = (sp: SpinPrize) => t.value.luckySpin.prizesShort[sp.labelKey as keyof typeof t.value.luckySpin.prizesShort]
  || sp.rewardName || sp.id;

const bonusChip = computed(() => fmt(t.value.luckySpin.bonusTicketChip, { n: spin.bonusTickets }));
const socialProofText = computed(() => fmt(t.value.luckySpin.socialProof, { n: winnersToday }));
const noSpinHintText = computed(() => fmt(t.value.luckySpin.noSpinHint, { time: untilUtcResetLabel() }));

const prizes = computed(() => remoteApiEnabled ? spin.remoteSegments : SPIN_PRIZES);

// wheel slices (drawn clockwise from 12 o'clock; segment i = server segment i in remote mode)
const slices = computed(() =>
  prizes.value.map((sp, i) => {
    const segmentDeg = 360 / prizes.value.length;
    const a0 = -90 + i * segmentDeg;
    const a1 = -90 + (i + 1) * segmentDeg;
    const p0 = polar(a0, R);
    const p1 = polar(a1, R);
    const mid = polar(a0 + segmentDeg / 2, 60);
    const dim = sp.isReal && !realActive.value; // 降级/售罄 → 真实奖档置灰
    const fill = `color-mix(in srgb, ${sp.tint} ${i % 2 === 0 ? 46 : 30}%, var(--v5-surface-2))`;
    return { sp, i, path: `M${CX},${CY} L${p0.x},${p0.y} A${R},${R} 0 0 1 ${p1.x},${p1.y} Z`, mid, dim, fill };
  }),
);

// Wheel slices rendered as a raw SVG string (path + label <text> per slice).
// v-html'd into the rotating <g> so the in-SVG <text> survives uni's H5 tag
// rewriting (a template <text> inside <svg> becomes <uni-text> → not real SVG
// text → invisible labels). Label style is inlined (9px/600, ink, font-v5).
const slicesSvg = computed(() =>
  slices.value
    .map(
      (s) =>
        `<g opacity="${s.dim ? 0.32 : 1}">` +
        `<path d="${s.path}" fill="${s.fill}" stroke="var(--v5-bg)" stroke-width="1.5" />` +
        `<text x="${s.mid.x}" y="${s.mid.y}" text-anchor="middle" dominant-baseline="middle" ` +
        `style="font-size:12px;font-weight:600;fill:var(--v5-ink);font-family:var(--font-v5);">${lsShort(s.sp)}</text>` +
        `</g>`,
    )
    .join(""),
);

const wonPrize = computed(() =>
  spin.lastWonPrizeId ? prizes.value.find((p) => p.id === spin.lastWonPrizeId) ?? null : null,
);
const isJackpot = computed(() =>
  wonPrize.value
    ? wonPrize.value.amount >= 150 && (wonPrize.value.kind === "usdt" || wonPrize.value.kind === "nex")
    : false,
);

const historyRows = computed(() => {
  if (remoteApiEnabled) {
    return spin.remoteHistory.slice(0, 5).map((h) => ({
      ts: Date.parse(h.awardedAt),
      label: h.rewardName,
      time: h.awardedAt.slice(5, 16).replace("T", " "),
    }));
  }
  return spin.history.slice(0, 5).flatMap((h) => {
    const sp = SPIN_PRIZES.find((p) => p.id === h.prizeId);
    if (!sp) return [];
    return [{ ts: h.ts, label: ls(sp), time: new Date(h.ts).toISOString().slice(5, 16).replace("T", " ") }];
  });
});

// ── inline styles (token-driven; CSSProperties) ──
const wheelStyle = computed<CSSProperties>(() => ({
  transform: `rotate(${spin.wheelAngle}deg)`,
  transformOrigin: "100px 100px",
  transition: spin.phase === "spinning" ? "transform 3.6s cubic-bezier(0.16,1,0.3,1)" : "none",
}));
const wonCardStyle = computed<CSSProperties>(() => ({
  background: isJackpot.value
    ? "color-mix(in srgb, var(--v5-brand-2) 14%, var(--v5-surface-2))"
    : "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
}));
const wonPrizeStyle = computed<CSSProperties>(() => ({
  fontSize: isJackpot.value ? "30px" : "26px",
  color: isJackpot.value ? "var(--v5-brand-2)" : "var(--v5-brand)",
}));
const spinBtnStyle = computed<CSSProperties>(() => ({
  boxShadow: spin.phase === "spinning" ? "none" : "0 0 24px color-mix(in srgb, var(--v5-brand) 32%, transparent)",
}));

// ── payout (compose stores; lucky-spin store stays import-free of them) ──
/** 派奖。返回 true = 奖真的到账了(或本就是不入余额的券),调用方才可以写历史 / 弹「你赢了」。
 *  🔴 返回值必须被消费:原实现丢弃它,于是落盘失败时收口点弹「交易未保存」、
 *  页面紧接着弹「你赢了 X」并把中奖记录**持久化**进历史 —— 假成功 + 假凭证,
 *  是本族里唯一同时污染 UI 与持久数据的一条(2026-08-04 对抗审计 B-P1-5)。 */
function creditPrize(sp: SpinPrize): boolean {
  const ref = `LSPIN-${sp.id}-${mockServerNow().toString(36)}`;
  const memo = fmt(t.value.luckySpin.billMemo, { prize: ls(sp) });
  if (sp.kind === "nex" || sp.kind === "usdt") {
    // 收据即指令:symbol 决定入哪种币,派奖与账单同生共死。
    return postMoneyBill({ type: "bonus", symbol: sp.kind === "nex" ? "NEX" : "USDT", amount: sp.amount, status: "posted", memo, ref }) === "ok";
  }
  // coupon: 购机抵扣券 — 记入转盘中奖历史(store.history,持久化),不入钱包余额
  // (对齐"仅抵购机款不可提现")。原型未建券兑换流;真后台落 coupon 账本 + 结账抵扣。
  return true;
}

// ── settle (idempotent: only fires once per spin) ──
let settleTimer: ReturnType<typeof setTimeout> | null = null;
function clearSettleTimer() {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

// 结算一次抽奖(派奖 + 历史 + toast)。幂等:phase!=="spinning" 直接早退 —
// 由 transitionend / 兜底 timer / 关闭中途 三处任一触发,只生效一次,
// 杜绝"消费了票但奖没派"(切后台 / 导航 / transitionend 不触发时的兜底)。
function settleSpin(expectedGeneration = accountGeneration) {
  if (expectedGeneration !== accountGeneration) return;
  if (spin.phase !== "spinning") return;
  const sp = prizes.value.find((p) => p.id === spin.lastWonPrizeId);
  if (!sp) {
    spin.backToIdle();
    return;
  }
  spin.reveal();
  if (remoteApiEnabled) {
    toast.success(fmt(t.value.luckySpin.wonToast, { prize: ls(sp) }), t.value.luckySpin.wonToastSub);
    return;
  }
  // 🔴 顺序不可换、返回值不可丢:奖没到账就不许写历史、不许弹「你赢了」。
  // 收口点在失败时已经弹过「交易未保存」,这里再补一句成功文案就是当面撒谎;
  // 而 pushHistory 是**持久化**的,写下去等于给用户留一张查无此账的中奖凭证。
  if (!creditPrize(sp)) return;
  spin.pushHistory(sp.id);
  toast.success(fmt(t.value.luckySpin.wonToast, { prize: ls(sp) }), t.value.luckySpin.wonToastSub);
}

function onWheelTransitionEnd(e: Event) {
  // 只认 <g> 自身 transform,忽略子元素冒泡
  if (e.target !== e.currentTarget) return;
  clearSettleTimer();
  settleSpin();
}

async function doSpin(skipConfirm = false) {
  if (spin.availableSpins() <= 0) return;
  const generation = accountGeneration;
  const usingBonus = !spin.hasFreeSpinToday();

  // bonus 票为稀缺资源 → 二次确认;免费次数零门槛不弹(转化优先)。
  // 网络失败重试沿用上次确认,不重复弹窗(skipConfirm)。
  if (usingBonus && !skipConfirm) {
    const ok = await confirm({
      title: t.value.luckySpin.confirmTicketTitle,
      message: t.value.luckySpin.confirmTicketMsg,
      confirmLabel: t.value.luckySpin.confirmSpin,
      cancelLabel: t.value.luckySpin.confirmCancel,
      icon: "info",
    });
    if (!ok) return;
    if (generation !== accountGeneration) return;
  }

  // mock 网络:区块链拥堵演示(抽奖券不扣除)。remote 失败由 API 错误路径处理。
  if (!remoteApiEnabled && Math.random() < MOCK_NET_FAIL_RATE) {
    netError.show({
      title: t.value.luckySpin.netErrorTitle,
      message: t.value.luckySpin.netErrorMsg,
      retryAfterMs: null,
      onRetry: () => {
        netError.hide();
        void doSpin(true); // 沿用已确认,跳过二次弹窗
      },
    });
    return;
  }

  if (remoteApiEnabled) {
    const key = pendingSpinKey ?? createSpinIdempotencyKey();
    pendingSpinKey = key;
    const result = await spin.spinRemote("evt-spring-spin", key);
    if (generation !== accountGeneration) return;
    if (result.stale) return;
    if (!result.ok) {
      netError.show({
        title: t.value.luckySpin.netErrorTitle,
        message: t.value.luckySpin.netErrorMsg,
        retryAfterMs: null,
        onRetry: () => {
          netError.hide();
          void doSpin(true);
        },
      });
      return;
    }
    pendingSpinKey = null;
    clearSettleTimer();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      settleSpin(generation);
    }, 3650);
    return;
  }

  // mock:本地消费票 + 本地演示 RNG + 置 spinning + 目标角。
  // 🔴 票没扣成就不能转轮子:上面的 availableSpins() 预判读的是本页内存态,而票是
  // 每日配额 + 稀缺资源;别的标签页刚花掉时 store 按磁盘最新态拒掉,此时还往下走
  // 就是两个标签页花同一张票各中一次奖。
  const r = spin.spin();
  if (!r.ok) {
    if (r.conflict) toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
    return;
  }
  // 兜底结算:即便 transitionend 不触发(切后台 / 节流)也按动画时长强制结算,
  // 保证已消费的票一定兑现。idempotent settle 防与 transitionend 双触发重复派奖。
  clearSettleTimer();
  settleTimer = setTimeout(() => {
    settleTimer = null;
    settleSpin();
  }, 3650);
}

let pendingSpinKey: string | null = null;
watch(() => app.accountKey, () => {
  accountGeneration += 1;
  pendingSpinKey = null;
  clearSettleTimer();
});
let spinKeySequence = 0;
function createSpinIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") return `lucky-spin-${randomUuid()}`;
  spinKeySequence += 1;
  return `lucky-spin-${Date.now().toString(36)}-${spinKeySequence}`;
}

function onSpinClick() {
  if (spin.phase === "spinning") return;
  void doSpin();
}
function onSpinAgain() {
  collect();
  void doSpin();
}
function collect() {
  spin.backToIdle();
}

// 关闭:旋转中途关闭先结算当次中奖(已消费票必须兑现)再关
function handleClose() {
  if (spin.phase === "spinning") {
    clearSettleTimer();
    settleSpin();
  }
  spin.closeSheet();
}
function onBackdrop() {
  if (spin.phase === "spinning") return;
  spin.closeSheet();
}

function goEarnTicket() {
  spin.closeSheet();
  uni.navigateTo({ url: "/pages/daily/daily", fail: () => {} });
}

// 卸载时清兜底 timer,防 setState on unmounted(组件级 → onUnmounted,P-021)
onUnmounted(() => clearSettleTimer());

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => spin.open), ".lss-root", onBackdrop);
</script>

<style scoped>
.lss-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.lss-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(10px) saturate(150%);
  -webkit-backdrop-filter: blur(10px) saturate(150%);
}
.lss-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  max-height: calc(100% - 24px);
  overflow-y: auto;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--v5-surface);
  border-top: 1px solid var(--v5-border);
  padding: 18px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 32px);
}

/* header */
.lss-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.lss-head-l {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lss-gift-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.lss-head-meta {
  display: flex;
  flex-direction: column;
}
.lss-cap {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.lss-title {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  margin-top: 2px;
  line-height: 1.25;
}
.lss-close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.lss-close:active {
  background: var(--v5-surface-3);
  transform: scale(0.96);
}

/* guard banner */
.lss-banner {
  margin-top: 12px;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: color-mix(in srgb, var(--v5-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--v5-warning) 36%, transparent);
}
.lss-banner-t {
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink-2);
  line-height: 1.375;
}

/* tickets + social proof */
.lss-tickets {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lss-chips {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lss-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 4px 10px;
}
.lss-chip-free {
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.lss-chip-bonus {
  background: var(--v5-surface-2);
}
.lss-chip-t {
  font-size: 12px;
  font-weight: 500;
}
.lss-chip-t-free {
  color: var(--v5-brand);
}
.lss-chip-t-bonus {
  color: var(--v5-ink-2);
}
.lss-social {
  font-size: 12px;
  color: var(--v5-ink-3);
}

/* wheel */
.lss-wheel-wrap {
  margin-top: 16px;
  position: relative;
  margin-left: auto;
  margin-right: auto;
  width: 248px;
  height: 248px;
}
.lss-pointer {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  top: -2px;
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 18px solid var(--v5-ink);
}
.lss-wheel-svg {
  display: block;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--v5-brand) 22%, transparent));
}

/* cta zone */
.lss-cta-zone {
  margin-top: 20px;
}

/* won celebration */
.lss-won {
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.lss-won-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink-3);
}
.lss-won-prize {
  display: block;
  font-family: var(--font-v5);
  font-weight: 600;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.lss-won-hint {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 6px;
}
.lss-won-actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}
.lss-btn-collect-sm,
.lss-btn-again,
.lss-btn-collect {
  flex: 1;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lss-btn-collect-sm {
  background: var(--v5-surface-3);
}
.lss-btn-collect-sm:active,
.lss-btn-collect:active {
  transform: scale(0.98);
  opacity: 0.8;
}
.lss-btn-collect-sm-t {
  font-size: 13px;
  font-weight: 400;
  color: var(--v5-ink-2);
}
.lss-btn-again {
  background: var(--v5-brand);
  box-shadow: 0 0 22px color-mix(in srgb, var(--v5-brand) 30%, transparent);
}
.lss-btn-again:active {
  transform: scale(0.98);
}
.lss-btn-again-t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
.lss-btn-collect {
  background: var(--v5-brand);
}
.lss-btn-collect-t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}

/* idle / spinning spin button */
.lss-spin-btn {
  width: 100%;
  height: 52px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--v5-brand);
}
.lss-spin-btn:active {
  transform: scale(0.98);
}
.lss-spin-btn-busy {
  opacity: 0.7;
}
.lss-spin-btn-t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}

/* no-spins state */
.lss-nospin {
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  background: var(--v5-surface-2);
  border: 1px solid var(--v5-border);
}
.lss-nospin-title {
  display: block;
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.lss-nospin-hint {
  display: block;
  font-size: 13px;
  color: var(--v5-ink-3);
  margin-top: 4px;
}
.lss-earn-cta {
  margin-top: 14px;
  display: flex;
  width: 100%;
  height: 48px;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.lss-earn-cta:active {
  transform: scale(0.98);
}
.lss-earn-cta-t {
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-brand);
}

/* pool toggle */
.lss-pool-toggle {
  margin-top: 16px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}
.lss-pool-toggle:active {
  opacity: 0.7;
}
.lss-pool-toggle-t {
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-2);
}
.lss-pool-chev {
  transition: transform 0.2s ease;
}
.lss-pool-chev-open {
  transform: rotate(90deg);
}
.lss-pool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.lss-pool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--v5-surface-2);
}
.lss-pool-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.lss-pool-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink);
  white-space: nowrap;
}

/* history */
.lss-hist {
  margin-top: 16px;
}
.lss-hist-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.lss-hist-head-t {
  font-size: 12px;
  font-weight: 500;
  color: var(--v5-ink-3);
}
.lss-hist-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lss-hist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.lss-hist-name {
  font-size: 12px;
  color: var(--v5-ink-2);
}
.lss-hist-time {
  font-size: 12px;
  color: var(--v5-ink-4);
  font-family: var(--font-jet-mono), monospace;
}
</style>
