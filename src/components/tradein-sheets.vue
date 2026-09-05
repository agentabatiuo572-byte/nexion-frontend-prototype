<!--
  Trade-in sheet flow — chassis-level bottom sheets. Ported from
  Nexion-prototype/app/components/tradein-sheets.tsx (Batch C, 2026-05-27).

  Five overlapping sheets share ONE `useTradeinSheet` discriminated-union state
  machine so only one is visible at a time (prevents double-open from rapid
  taps). Branch is gated by `state.kind`, not local props:

    1.   choice  — entry fork at checkout when the user owns ≥1 retirable
         device toward the target SKU. Trade in (→ tradein) or pay full price
         (→ replace if slot-full, else dismiss + caller proceeds).
    1.5  retire  — FEAT-DEV02 devices-page entry: pick a higher-priced upgrade
         target for the chosen device (select list, no free input) → tradein.
    2.   tradein — confirm card (lifetime output / ladder band / credit / est.
         payable). Confirm writes the checkout credit context
         (sheet.applyTradein) and routes to checkout — money + device mutation
         happen atomically in checkout's persist block, not here.
    3.   replace — Path B slot-full prompt. Demote the lowest-yield active
         device (or keep all slots + store new device in inventory).
    4.   block   — mid-task gate, split by origin: replace → wait / force
         (forfeits reward); retire → view task / dismiss (no force teardown).

  Port notes:
    · framer slide/fade           → CSS @keyframes (tradein-fade / -slide-up)
    · lucide X/ArrowRightLeft/...  → inline <svg stroke="currentColor"/var()>
    · zustand getState/setState    → Pinia store refs (useApp().devices, etc.)
    · all bare text wrapped in <text> (cross-end, P-026/030)
    · <button> → <view @click> (P-036); uni.navigateTo replaces router.replace

  ⚠️ MOCK-ONLY CROSS-STORE COMPOSERS
  ---
  Touches stores: useApp (devices), useTradeinSheet;资金变更走 lib/money-receipt 收口点。
  Path B (replace/keep-buy/force) composers mutate app.devices + postMoneyBill here with
  documented rollback ordering. The FEAT-DEV02 trade-in path deliberately does
  NOT mutate here — it defers to checkout's single persist block. Production:
  each flow maps to a single server transaction; the client mirrors the rollback.

  Endpoints(逐条出处;PRD 未定义的显式标 TBD,不许当既定契约引用):
    - Trade-in:         POST /api/orders (PRD §7.5 — 携 tradeInDeviceId,server
                        同事务复算阶梯抵扣 + 下架旧机)
    - Path B replace:   POST /api/devices/deactivate + POST /api/orders
                        (deactivate 见 PRD §9.11c.1 composer endpoints,PRD 原文
                        标 "TBD; candidates";下单仍走 POST /api/orders)
    - Path B keep+buy:  POST /api/orders (new device lands inactive)
-->
<template>
  <view v-if="state.kind !== 'none'" class="tis-root" role="dialog" aria-modal="true">
    <view class="tis-backdrop" @click="hide" />

    <view class="tis-panel" @click.stop>
      <view class="tis-close" @click="hide">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </view>

      <!-- ─────────── 1. choice — trade-in or full price ─────────── -->
      <template v-if="state.kind === 'choice'">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.choiceTitle }}</text>
        </view>
        <view class="tis-opt-list">
          <view
            v-for="src in choiceSources"
            :key="src.id"
            class="tis-opt"
            @click="onChooseTradein(src.id)"
          >
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></svg>
            <text class="tis-opt-text">{{ src.label }}</text>
          </view>
          <view class="tis-opt" @click="onChooseFullPrice">
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18 8 4A2 2 0 0 1 22 8v8a2 2 0 0 1-1.17 1.82l-8 4a2 2 0 0 1-1.66 0l-8-4A2 2 0 0 1 2 16V8a2 2 0 0 1 1.17-1.82l8-4a2 2 0 0 1 1.66 0z" /><path d="m7 4.5 10 5" /></svg>
            <text class="tis-opt-text">{{ t.tradein.choiceFullPriceOption }}</text>
          </view>
        </view>
      </template>

      <!-- ─────────── 1.5 retire — FEAT-DEV02 主动下架:选升级目标 ─────────── -->
      <template v-else-if="state.kind === 'retire' && retireView">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.retireTitle }}</text>
          <text class="tis-subtitle">{{ retireView.subtitle }}</text>
        </view>
        <view class="tis-opt-list">
          <view v-for="p in retireView.targets" :key="p.id" class="tis-opt" @click="onPickTarget(p.id)">
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /></svg>
            <text class="tis-opt-text">{{ p.label }}</text>
          </view>
        </view>
        <view class="tis-ghost" @click="hide">
          <text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text>
        </view>
      </template>

      <!-- ─────────── 2. tradein — 置换确认(去结算) ─────────── -->
      <template v-else-if="state.kind === 'tradein' && tradeinView">
        <view class="tis-head tis-head-mb4">
          <text class="tis-title">{{ tradeinView.title }}</text>
        </view>

        <!-- 旧机 / 累计产出 / 档位 / 抵扣 / 预计应付 — soft surface card, no border -->
        <view class="tis-card">
          <view class="tis-row">
            <text class="tis-row-label">{{ t.tradein.sheetOldDeviceLabel }}</text>
            <text class="tis-row-value">{{ tradeinView.oldDeviceText }}</text>
          </view>
          <view class="tis-row">
            <text class="tis-row-label">{{ t.tradein.sheetEarnedLabel }}</text>
            <text class="tis-row-value tis-num">${{ tradeinView.earned }}</text>
          </view>
          <view class="tis-row">
            <text class="tis-row-label">{{ t.tradein.sheetBandLabel }}</text>
            <text class="tis-row-value">{{ tradeinView.bandText }}</text>
          </view>
          <view class="tis-row">
            <text class="tis-row-label">{{ t.tradein.sheetCreditLabel }}</text>
            <text class="tis-row-value tis-row-brand tis-num">−${{ tradeinView.credit }}</text>
          </view>
          <view class="tis-hr" />
          <view class="tis-row">
            <text class="tis-row-label">{{ t.tradein.sheetNetCostLabel }}</text>
            <text class="tis-row-value tis-row-emph tis-num">${{ tradeinView.estNet }}</text>
          </view>
        </view>

        <text class="tis-disclaimer">{{ t.tradein.sheetDisclaimer }}</text>

        <view class="tis-cta" :style="ctaHalo" @click="onConfirmTradein">
          <text class="tis-cta-text">{{ tradeinView.ctaText }}</text>
        </view>
        <view class="tis-ghost" @click="hide">
          <text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text>
        </view>
      </template>

      <!-- ─────────── 3. replace — Path B slot-full ─────────── -->
      <template v-else-if="state.kind === 'replace' && replaceView">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.replaceTitle }}</text>
          <text class="tis-subtitle">{{ replaceView.warning }}</text>
        </view>

        <view class="tis-card tis-card-mb4">
          <text class="tis-card-cap">{{ t.tradein.replaceLowestDeviceLabel }}</text>
          <text class="tis-card-line">{{ replaceView.lowestText }}</text>
        </view>

        <view
          class="tis-cta"
          :class="{ 'tis-cta-disabled': replaceView.insufficient }"
          @click="onReplace"
        >
          <text class="tis-cta-text">{{ replaceView.replaceCta }}</text>
        </view>
        <view
          class="tis-secondary"
          :class="{ 'tis-cta-disabled': replaceView.insufficient }"
          @click="onKeepBuy"
        >
          <text class="tis-secondary-text">{{ replaceView.keepCta }}</text>
        </view>
        <view class="tis-ghost" @click="hide">
          <text class="tis-ghost-text">{{ t.tradein.replaceCancel }}</text>
        </view>
      </template>

      <!-- 空态兜底:kind 已定但对应 view 为 null(设备/目标在弹层开着时消失,
           PR-D 债 #1)。置于全部具体分支之后、block 之前,只接住 view-null 漏网。 -->
      <template v-else-if="state.kind === 'retire' || state.kind === 'tradein' || state.kind === 'replace'">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.errReplaceUnavailable }}</text>
          <text class="tis-subtitle">{{ t.tradein.errPleaseRetry }}</text>
        </view>
        <view class="tis-ghost" @click="hide">
          <text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text>
        </view>
      </template>

      <!-- ─────────── 4. block — pending-task block ─────────── -->
      <template v-else-if="state.kind === 'block'">
        <view class="tis-block-head">
          <svg class="tis-block-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
          <view class="tis-block-meta">
            <text class="tis-title">{{ blockTitle }}</text>
            <text class="tis-block-warn">{{ state.origin === 'retire' ? t.tradein.retireBlockWarning : t.tradein.blockWarning }}</text>
          </view>
        </view>

        <!-- retire 阻断:等任务完成即可下架 → 查看任务 / 知道了(无 force,规格 DEV02A 异常2) -->
        <template v-if="state.origin === 'retire'">
          <view class="tis-cta" @click="onGoTasks">
            <text class="tis-cta-text">{{ t.tradein.retireBlockViewTask }}</text>
          </view>
          <view class="tis-ghost" @click="hide">
            <text class="tis-ghost-text">{{ t.tradein.retireBlockOk }}</text>
          </view>
        </template>
        <template v-else>
          <view class="tis-cta" @click="onWait">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
            <text class="tis-cta-text">{{ t.tradein.blockWaitCta }}</text>
          </view>
          <view class="tis-warn-ghost" @click="onForce">
            <text class="tis-warn-ghost-text">{{ t.tradein.blockForceCta }}</text>
          </view>
          <view class="tis-ghost" @click="hide">
            <text class="tis-ghost-text">{{ t.tradein.blockCancel }}</text>
          </view>
        </template>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useTradeinSheet } from "@/store/tradein-sheet";
import { useApp } from "@/store/app";
import { postMoneyBill, reportStuckFunds } from "@/lib/money-receipt";
import { usePendingCheckout } from "@/store/pending-checkout";
import { trialReservesSlotNow } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { getProduct, PRODUCTS } from "@/mock/products";
import {
  MAX_DEVICES,
  DEVICE_SPECS,
  createDevice,
} from "@/store/device-types";
import { computeTradeInCredit, ladderBandFor, TRADEIN_LADDER_RULES } from "@/mock/tradein-config";
import { isDeviceTaskBlocked } from "@/mock/eligibility";
import { getMonthsSince, isPhaseReached, isTradeInTargetAvailable } from "@/store/product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import { navTo } from "@/lib/route";
import type { DeviceKind, Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName, deviceNameByKind } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { deviceE3Api, orderApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalCapacityReplaceQuote, CanonicalTradeinConfig, CanonicalTradeinQuote } from "@/api/device-e3-api";
import { productCatalogState } from "@/store/product-catalog";
import { isProductAvailable } from "@/store/product-availability";
import { useOrders } from "@/store/orders";
import { completeVerifiedMutation, handleNoActiveDeviceDecision } from "@/domain/e20-capacity-coordinator";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const sheet = useTradeinSheet();
const app = useApp();
const pending = usePendingCheckout();
const orders = useOrders();
const t = useT();
// 上架节奏门(FEAT-DEV02b):置换目标必须已正式上架,或处于抢先购窗口(开关默认关)。
const phase = useProductPhase();
const monthsSinceJoin = computed(() => getMonthsSince(app.user.joinedAt));

const state = computed(() => sheet.state);
const reservedSlots = computed(() => (trialReservesSlotNow() ? 1 : 0));

// Double-tap guard shared across composers — handlers run synchronously; flips
// at entry and resets on early returns / before navigation. Without this, two
// rapid taps on a slow device could fire a composer twice before the device
// array mutation propagates → double-bill / double-debit (Batch C R1 P0 #5).
const confirming = ref(false);
const canonicalQuote = ref<CanonicalTradeinQuote | null>(null);
const canonicalTradeinConfig = ref<CanonicalTradeinConfig | null>(null);
const capacityCommandKey = ref<string | null>(null);
watch(() => app.accountKey, () => {
  canonicalQuote.value = null;
  canonicalTradeinConfig.value = null;
  capacityCommandKey.value = null;
});
onMounted(() => {
  if (!remoteApiEnabled) return;
  const requestScope = captureAccountScope();
  void deviceE3Api.tradeinConfig().then((value) => {
    if (isCurrentAccountScope(requestScope)) canonicalTradeinConfig.value = value;
  }).catch(() => {
    if (isCurrentAccountScope(requestScope)) canonicalTradeinConfig.value = null;
  });
});

// ───────────────────────── helpers ─────────────────────────

/** Product catalog label for any DeviceKind. `phone` isn't in the store catalog
 *  (user-owned hardware), so fall back to the device spec name, then the raw
 *  kind — never a bare literal, never a missing i18n key. */
function kindLabel(kind: DeviceKind): string {
  // SKU name first (brand mark). Kinds with no store listing — phone, pc-gpu —
  // fall back to the localized device name, not the English DEVICE_SPECS one:
  // the user's own phone can be the traded-in / replaced device here.
  return getProduct(kind)?.name ?? deviceNameByKind(t.value, kind, DEVICE_SPECS[kind]?.name ?? kind);
}

/** FEAT-DEV02 预览抵扣(阶梯)。真值 server-authoritative;与结算持久块同一算法。 */
function previewCredit(oldDevice: Device, targetPriceUsdt: number): number {
  return computeTradeInCredit(
    oldDevice.paidPriceUsdt ?? 0,
    Math.max(0, oldDevice.cumulativeEarningsUsdt ?? 0),
    targetPriceUsdt,
  );
}

const ctaHalo = computed(() => ({
  boxShadow: "0 0 24px color-mix(in oklab, var(--v5-brand) 35%, transparent)",
}));

function hide() {
  sheet.hide();
}

// ── deferred route past the sheet's exit so it doesn't flash on /me/devices ──
function goDevices() {
  setTimeout(() => {
    uni.reLaunch({ url: "/pages/me/devices", fail: () => {} });
  }, 260);
}

// ───────────────────────── 1. choice ─────────────────────────

const choiceSources = computed(() => {
  const s = state.value;
  if (s.kind !== "choice") return [];
  return s.tradeInSources
    .map((id) => app.devices.find((d) => d.id === id))
    .filter((d): d is Device => !!d)
    .map((d) => ({
      id: d.id,
      label: fmt(t.value.tradein.choiceTradeInOption, {
        name: deviceName(t.value, d),
        credit: remoteApiEnabled ? t.value.tradein.remoteQuoteCreditLabel : previewCredit(d, s.newPrice).toFixed(2),
      }),
    }));
});

async function openTradeinQuote(oldDevice: Device, targetKind: DeviceKind, newPrice: number): Promise<void> {
  if (!remoteApiEnabled) {
    canonicalQuote.value = null;
    sheet.showTradein(oldDevice.id, targetKind, newPrice);
    return;
  }
  const requestScope = captureAccountScope();
  try {
    const eligibility = await deviceE3Api.eligibility(targetKind);
    if (!isCurrentAccountScope(requestScope)) return;
    const sourceAllowed = eligibility.sources.some((source) => source.eligible
      && source.sourceDeviceId === Number(oldDevice.id));
    if (!eligibility.eligible || !sourceAllowed) throw new Error("TRADEIN_SOURCE_NOT_ELIGIBLE");
    const quote = await deviceE3Api.quote(Number(oldDevice.id), targetKind);
    if (!isCurrentAccountScope(requestScope)) return;
    canonicalQuote.value = quote;
    sheet.showTradein(oldDevice.id, targetKind, newPrice);
  } catch {
    if (!isCurrentAccountScope(requestScope)) return;
    canonicalQuote.value = null;
    toast.warn(t.value.tradein.errPleaseRetry);
  }
}

function onChooseTradein(deviceId: string) {
  const s = state.value;
  if (s.kind !== "choice") return;
  const oldDevice = app.devices.find((d) => d.id === deviceId) ?? null;
  if (!oldDevice) {
    // Race: device disappeared between hint computation and click. Bail out
    // gracefully — user can retry from the product page.
    hide();
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  void openTradeinQuote(oldDevice, s.targetKind, s.newPrice);
}

function onChooseFullPrice() {
  const s = state.value;
  if (s.kind !== "choice") return;
  if (remoteApiEnabled) {
    const requestScope = captureAccountScope();
    void deviceE3Api.capacityQuote(s.targetKind).then(async (quote) => {
      if (!isCurrentAccountScope(requestScope)) return;
      if (quote.decision === "REPLACE_REQUIRED") {
        sheet.showCanonicalReplace(s.targetKind, quote.payableUsdt, quote);
        return;
      }
      hide();
      if (quote.decision === "NO_ACTIVE_DEVICE") {
        await handleNoActiveDeviceDecision({
          notify: () => {
            if (isCurrentAccountScope(requestScope)) toast.warn(t.value.tradein.errNoActiveDevice);
          },
          refreshFleet: async () => {
            if (!isCurrentAccountScope(requestScope)) return;
            await app.refreshRemoteFleet();
          }, // best-effort:失败自吞
        });
      }
    }).catch(() => {
      if (isCurrentAccountScope(requestScope)) toast.warn(t.value.tradein.errPleaseRetry);
    });
    return;
  }
  // If slot full, hand off to the replace sheet; else just dismiss (caller's
  // checkout flow proceeds normally to payment).
  if (app.activeSlotCount + reservedSlots.value >= MAX_DEVICES) {
    sheet.showReplace(s.targetKind, s.newPrice);
  } else {
    hide();
  }
}

// ───────────────────── 1.5 retire — 主动下架:选升级目标 ─────────────────────

const retireView = computed(() => {
  const s = state.value;
  if (s.kind !== "retire") return null;
  if (remoteApiEnabled && (productCatalogState.status !== "ready"
      || !canonicalTradeinConfig.value || !canonicalTradeinConfig.value.enabled)) {
    return {
      title: t.value.tradein.retireTitle,
      subtitle: t.value.tradein.errPleaseRetry,
      targets: [],
    };
  }
  const device = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!device) return null;
  const paid = device.paidPriceUsdt ?? 0;
  // 目标 = 目录中合规的可购 SKU(select 列表,不手输;规格 DEV02A ⑥)。
  // 「仅限更高价」与「已上架 ∨ 抢先购窗口」均为运营可配规则,消费 flag 不硬编码。
  const targets = PRODUCTS.filter(
    (p) =>
      (!(remoteApiEnabled ? canonicalTradeinConfig.value?.requireHigherPrice !== false : TRADEIN_LADDER_RULES.requireHigherPrice) || p.price > paid) &&
      (remoteApiEnabled
        ? isProductAvailable(p, phase.value)
        : isTradeInTargetAvailable(p.unlocksAtPhase, phase.value, monthsSinceJoin.value)),
  ).map((p) => {
    // 抢先购窗口内的未正式上架目标,行尾加「抢先升级」标(默认关闭时零渲染)。
    const early = !!p.unlocksAtPhase && !isPhaseReached(phase.value, p.unlocksAtPhase);
    const net = remoteApiEnabled ? "—" : Math.max(0, +(p.price - previewCredit(device, p.price)).toFixed(2)).toLocaleString();
    const base = fmt(t.value.tradein.retireTargetOption, {
      name: p.name,
      price: p.price.toLocaleString(),
      net,
    });
    return { id: p.id, label: early ? `${base} · ${t.value.tradein.retireEarlyTag}` : base };
  });
  return {
    subtitle: fmt(t.value.tradein.retireSubtitle, { name: deviceName(t.value, device) }),
    targets,
  };
});

function onPickTarget(productId: string) {
  const s = state.value;
  if (s.kind !== "retire") return;
  const device = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  const p = getProduct(productId);
  if (!device || !p) {
    hide();
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  void openTradeinQuote(device, productId as DeviceKind, p.price);
}

// ───────────────────────── 2. tradein — 置换确认(去结算) ─────────────────────

const tradeinView = computed(() => {
  const s = state.value;
  if (s.kind !== "tradein") return null;
  const oldDevice = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!oldDevice) return null; // device vanished (already traded) — render nothing
  const remoteQuote = remoteApiEnabled ? canonicalQuote.value : null;
  if (remoteApiEnabled && (!remoteQuote || remoteQuote.sourceDeviceId !== Number(oldDevice.id)
      || remoteQuote.targetProductNo !== s.newKind)) return null;
  const paid = remoteQuote?.sourceActualPaidUsdt ?? oldDevice.paidPriceUsdt ?? 0;
  const earned = remoteQuote?.cumulativeOutputUsdt ?? Math.max(0, oldDevice.cumulativeEarningsUsdt ?? 0);
  const credit = remoteQuote?.discountUsdt ?? previewCredit(oldDevice, s.newPrice);
  const band = remoteQuote ? null : ladderBandFor(paid, earned);
  const estNet = remoteQuote?.payableUsdt ?? Math.max(0, +(s.newPrice - credit).toFixed(2));
  return {
    title: fmt(t.value.tradein.sheetTitle, {
      from: kindLabel(oldDevice.kind),
      to: kindLabel(s.newKind),
    }),
    // 只给设备名——内部 id 是工程标识,禁止渲染(页面文案禁字段名/枚举值)。
    oldDeviceText: oldDevice.name,
    earned: earned.toFixed(2),
    bandText: remoteQuote
      ? fmt(t.value.tradein.sheetBandText, { band: t.value.tradein.remoteQuoteBandLabel, pct: remoteQuote.creditRatePct })
      : band
      ? fmt(t.value.tradein.sheetBandText, { band: band.band, pct: band.creditPct })
      : "—",
    credit: credit.toFixed(2),
    estNet: estNet.toFixed(2),
    ctaText: fmt(t.value.tradein.sheetCta, { amount: estNet.toFixed(2) }),
  };
});

function onConfirmTradein() {
  const s = state.value;
  if (s.kind !== "tradein" || confirming.value) return;
  const oldDevice = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!oldDevice) {
    hide();
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  // 入口后任务才开始的竞态:退回阻断提示(规格 DEV02A 异常2)。判定单源
  // isDeviceTaskBlocked——库存机的出厂任务不在跑,不阻断。
  if (isDeviceTaskBlocked(oldDevice)) {
    sheet.showRetireBlock(oldDevice.id, oldDevice.name);
    return;
  }
  confirming.value = true;
  // FEAT-DEV02:确认 = 写入结算抵扣上下文,原子事务(净额扣款 + 移除旧机 + 新机
  // 未激活入库)统一发生在结算页持久块——本弹层不再直接动钱/动设备数组。
  sheet.applyTradein(oldDevice.id, s.newKind, remoteApiEnabled ? canonicalQuote.value ?? undefined : undefined);
  const targetId = s.newKind;
  hide();
  const cur = (getCurrentPages().slice(-1)[0] as { route?: string } | undefined)?.route ?? "";
  if (!cur.includes("store/checkout")) {
    // 弹层退场后再路由(与 goDevices 同节奏),choice 路径本就在结算页则原地接管。
    setTimeout(() => {
      navTo(`/pages/store/checkout?product=${targetId}`);
    }, 260);
  }
  confirming.value = false;
}

// ───────────────────────── 3. replace (Path B) ─────────────────────────

const replaceView = computed(() => {
  const s = state.value;
  if (s.kind !== "replace") return null;
  if (remoteApiEnabled && s.canonicalCapacityQuote) {
    return {
      warning: fmt(t.value.tradein.replaceWarning, { newKind: kindLabel(s.newKind) }),
      lowestText: fmt(t.value.tradein.replaceLowestText, {
        name: s.canonicalCapacityQuote.sourceDeviceName ?? t.value.tradein.errReplaceUnavailable,
        earn: "—",
      }),
      insufficient: !s.canonicalCapacityQuote.sufficientFunds,
      replaceCta: fmt(t.value.tradein.replaceReplaceCta, { newKind: kindLabel(s.newKind) }),
      keepCta: fmt(t.value.tradein.replaceKeepCta, { newKind: kindLabel(s.newKind) }),
    };
  }
  const lowest = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!lowest) return null; // snapshot device vanished — render nothing
  const insufficient = s.newPrice > app.user.usdtBalance;
  return {
    warning: fmt(t.value.tradein.replaceWarning, { newKind: kindLabel(s.newKind) }),
    lowestText: fmt(t.value.tradein.replaceLowestText, {
      name: lowest.name,
      earn: lowest.todayEarnings.toFixed(2),
    }),
    insufficient,
    replaceCta: fmt(t.value.tradein.replaceReplaceCta, { newKind: kindLabel(s.newKind) }),
    keepCta: fmt(t.value.tradein.replaceKeepCta, { newKind: kindLabel(s.newKind) }),
  };
});

function canonicalCapacityKey(quote: CanonicalCapacityReplaceQuote): string {
  if (capacityCommandKey.value) return capacityCommandKey.value;
  capacityCommandKey.value = `e3-capacity:${quote.sourceDeviceId}:${quote.targetProductNo}:${Date.now()}`;
  return capacityCommandKey.value;
}

async function submitCanonicalCapacityReplacement(
  quote: CanonicalCapacityReplaceQuote,
  newKind: DeviceKind,
): Promise<void> {
  try {
    if (quote.decision !== "REPLACE_REQUIRED" || quote.sourceDeviceId == null
        || quote.targetProductNo !== newKind || quote.decisionSource !== "server") {
      throw new Error("CAPACITY_REPLACEMENT_QUOTE_INVALID");
    }
    await completeVerifiedMutation({
      submit: () => deviceE3Api.capacityReplace(
        quote.sourceDeviceId!, quote.targetProductNo, canonicalCapacityKey(quote), quote,
      ),
      readback: async (submitted) => (await orderApi.list()).orders
        .find((order) => order.orderNo === submitted.orderNo),
      verifyOrder(submitted, persisted) {
        if (!persisted || persisted.sourceDeviceId !== submitted.sourceDeviceId
            || persisted.targetDeviceId !== submitted.targetDeviceId
            || persisted.tradeinNo !== submitted.tradeinNo
            || persisted.canonicalStatus !== "activated"
            || persisted.paymentStatus.toUpperCase() !== "PAID"
            || persisted.orderStatus.toUpperCase() !== "COMPLETED"
            || persisted.activationStatus.toUpperCase() !== "ACTIVATED"
            || Math.abs(persisted.amountUsdt - submitted.walletDebitUsdt) > 0.000001
            || Math.abs(persisted.discountUsdt - submitted.discountUsdt) > 0.000001) {
          throw new Error("CAPACITY_REPLACEMENT_READBACK_MISMATCH");
        }
      },
      refreshOrders: () => orders.refreshRemote(),
      // refreshRemoteFleet 自吞不 reject(resilience 门);适配层升回 throw 保住验证链语义。
      refreshFleet: async () => {
        if (!(await app.refreshRemoteFleet())) throw new Error("E3_FLEET_REFRESH_UNAVAILABLE");
      },
      verifyFleet(submitted) {
        const target = app.devices.find((device) => device.id === String(submitted.targetDeviceId));
        const source = app.devices.find((device) => device.id === String(submitted.sourceDeviceId));
        if (!target || target.activatedAt == null || (source && source.activatedAt != null)) {
          throw new Error("CAPACITY_REPLACEMENT_FLEET_READBACK_MISMATCH");
        }
      },
      commit() {
        capacityCommandKey.value = null;
        toast.success(fmt(t.value.tradein.replaceSuccessToast, {
          newKind: kindLabel(newKind),
          oldKind: quote.sourceDeviceName ?? t.value.tradein.errReplaceUnavailable,
        }));
        hide();
        goDevices();
      },
    });
  } catch {
    toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    confirming.value = false;
  }
}

function onReplace() {
  const s = state.value;
  if (s.kind !== "replace" || confirming.value) return;
  if (remoteApiEnabled) {
    if (!s.canonicalCapacityQuote) {
      toast.warn(t.value.tradein.errPleaseRetry);
      return;
    }
    confirming.value = true;
    void submitCanonicalCapacityReplacement(s.canonicalCapacityQuote, s.newKind);
    return;
  }
  const lowest = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!lowest) return;
  confirming.value = true;
  // ⚠️ MOCK-ONLY CROSS-STORE COMPOSER — Path B "Replace" branch.
  // Order: pending-task gate → moveToInventory(lowest) → addDevice(new) →
  //        activateDevice(new) → debit(newPrice) → bill / rollback.
  // Pending-task gate: refuse if a task is in-flight; user must choose
  // Force/Wait in the block sheet before reaching this path.
  if (lowest.currentTask !== null) {
    sheet.showBlock(lowest.id, lowest.name, s.newKind, s.newPrice);
    confirming.value = false;
    return;
  }
  if (lowest.activatedAt === null) {
    toast.warn(t.value.tradein.errDeviceAlreadyInactive);
    confirming.value = false;
    return;
  }
  // 先算再动:停掉旧机后新机能不能占到槽,用同一个谓词事先判(审计 R9 P1:事后失败再回滚,回滚里的再激活撞的是
  // 同一个槽位谓词,必然连环失败,把一台已付费旧机甩进库存)。
  if (app.activeSlotCount - 1 + reservedSlots.value >= MAX_DEVICES) {
    toast.warn(t.value.tradein.errReplaceSlotConflict);
    confirming.value = false;
    return;
  }
  if (!app.deactivateDevice(lowest.id)) { // move old → inventory (frees slot);没落盘 = 没停,别继续
    toast.warn(t.value.tradein.errPleaseRetry);
    confirming.value = false;
    return;
  }
  const newId = app.addDevice(s.newKind);
  const activated = !!newId && app.activateDevice(newId, reservedSlots.value);
  if (!activated) {
    if (newId && !app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");
    // persist-verdict-ok: 上面已按同一谓词预检过,这里的再激活只在落盘抖动时会失败;失败 = 旧机留在库存,设备页可手动激活
    app.activateDevice(lowest.id, reservedSlots.value);
    toast.warn(t.value.tradein.errReplaceSlotConflict);
    confirming.value = false;
    return;
  }
  // 收据即指令:amount 为负 = 扣款,扣款与这条 purchase 分录同生共死。
  const paid = postMoneyBill({
    type: "purchase",
    symbol: "USDT",
    amount: -s.newPrice,
    status: "posted",
    memo: fmt(t.value.tradein.replaceBillMemo, {
      newKind: kindLabel(s.newKind),
      oldKind: kindLabel(lowest.kind),
    }),
  });
  if (paid !== "ok") {
    // 钱没扣成(余额不足)或没记上账(收口点已还原资金 + 弹错)——设备侧的改动必须一起退回,
    // 否则用户白得一台新机、老机还停着。
    // 新机已落盘(addDevice 只在落盘成功时给 id),撤销也必须落盘;撤不掉登记待对账(审计 R8 P1:直写内存不落盘 → 白得一台)

    if (!app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");
    // persist-verdict-ok: 回滚里的再激活失败 = 旧机留在库存,设备页可手动激活;不再追补偿
    app.activateDevice(lowest.id, reservedSlots.value);
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: s.newPrice.toFixed(2) }));
    confirming.value = false;
    return;
  }
  // 成交即兑现意图:同账号该商品仍在窗内的链上发票一并作废(否则浮动条继续催第二笔;审计 R9 P1)。
  // persist-verdict-ok: 作废不掉 = 票留在磁盘,浮动条继续露出可取消的旧票,不会二次扣款
  pending.settleProduct(s.newKind);
  toast.success(
    fmt(t.value.tradein.replaceSuccessToast, {
      newKind: kindLabel(s.newKind),
      oldKind: kindLabel(lowest.kind),
    }),
  );
  confirming.value = false;
  hide();
  goDevices();
}

async function submitCanonicalKeepBuy(newKind: DeviceKind): Promise<void> {
  try {
    const key = capacityCommandKey.value ?? `e3-capacity-keep:${newKind}:${Date.now()}`;
    capacityCommandKey.value = key;
    const created = await orderApi.create({ productNo: newKind, quantity: 1, idempotencyKey: key });
    const persisted = (await orderApi.list()).orders.find((order) => order.orderNo === created.orderNo);
    if (!persisted || persisted.productNo !== newKind) throw new Error("CAPACITY_KEEP_ORDER_READBACK_MISMATCH");
    await orders.refreshRemote();
    if (!(await app.refreshRemoteFleet())) throw new Error("E3_FLEET_REFRESH_UNAVAILABLE");
    capacityCommandKey.value = null;
    toast.success(fmt(t.value.tradein.keepBuySuccessToast, { newKind: kindLabel(newKind) }));
    hide();
    goDevices();
  } catch {
    toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    confirming.value = false;
  }
}

function onKeepBuy() {
  const s = state.value;
  if (s.kind !== "replace" || confirming.value) return;
  if (remoteApiEnabled) {
    confirming.value = true;
    void submitCanonicalKeepBuy(s.newKind);
    return;
  }
  confirming.value = true;
  // ⚠️ MOCK-ONLY CROSS-STORE COMPOSER — Path B "Keep & buy" branch.
  // Order: addDevice (default inactive) → postMoneyBill(扣款 ⊗ 记账,单次落盘)。
  // 注释曾写「debit → bill / rollback」两步 —— 那是迁到收口点之前的形态,已过期。No demotion.
  const newId = app.addDevice(s.newKind);
  if (!newId) {
    // 新机没落盘 → 不扣钱(否则钱扣了机器没了)
    toast.warn(t.value.tradein.errPleaseRetry);
    confirming.value = false;
    return;
  }
  const paid = postMoneyBill({
    type: "purchase",
    symbol: "USDT",
    amount: -s.newPrice,
    status: "posted",
    memo: fmt(t.value.tradein.keepBuyBillMemo, { newKind: kindLabel(s.newKind) }),
  });
  if (paid !== "ok") {
    // 新机已落盘(addDevice 只在落盘成功时给 id),撤销也必须落盘;撤不掉登记待对账(审计 R8 P1:直写内存不落盘 → 白得一台)

    if (!app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: s.newPrice.toFixed(2) }));
    confirming.value = false;
    return;
  }
  // 成交即兑现意图:同账号该商品仍在窗内的链上发票一并作废(否则浮动条继续催第二笔;审计 R9 P1)。
  // persist-verdict-ok: 作废不掉 = 票留在磁盘,浮动条继续露出可取消的旧票,不会二次扣款
  pending.settleProduct(s.newKind);
  toast.success(fmt(t.value.tradein.keepBuySuccessToast, { newKind: kindLabel(s.newKind) }));
  confirming.value = false;
  hide();
  goDevices();
}

// ───────────────────────── 4. block (pending task) ─────────────────────────

const blockTitle = computed(() => {
  const s = state.value;
  if (s.kind !== "block") return "";
  return fmt(t.value.tradein.blockTitle, { deviceName: s.oldDeviceName });
});

function onWait() {
  // Cancel the replace flow — user retries once the task is done.
  hide();
}

// retire 阻断:查看任务 → earn 页(该设备任务区)。
function onGoTasks() {
  hide();
  setTimeout(() => {
    navTo("/earn");
  }, 260);
}

function onForce() {
  const s = state.value;
  if (s.kind !== "block" || s.origin !== "replace" || confirming.value) return;
  const lowest = app.devices.find((d) => d.id === s.oldDeviceId);
  if (!lowest) {
    hide();
    return;
  }
  confirming.value = true;
  if (remoteApiEnabled) {
    // Remote replacement is only admitted from a fresh server capacity quote;
    // never execute the legacy local force composer against canonical state.
    toast.warn(t.value.tradein.errPleaseRetry);
    confirming.value = false;
    return;
  }
  // ⚠️ MOCK-ONLY CROSS-STORE COMPOSER — Path B "Force replace" branch.
  //
  // Task-forfeit safety (Batch C R2 P0): deactivateDevice wipes `currentTask`
  // as a side effect, so we snapshot the task BEFORE moving to inventory, then
  // restore both activatedAt AND currentTask via direct device-array writes on
  // any rollback. Success path skips the restore (task stays forfeit — the
  // whole point).
  //
  // Order: snapshot task → addDevice(new) → deactivate(old, clears task) →
  //   activate(new) → postMoneyBill(扣款 ⊗ 记账,单次落盘)。Each failure restores the old device's task.
  const taskSnapshot = lowest.currentTask;
  // 先算再动:停掉旧机后新机能不能占到槽,用同一个谓词事先判(与 onReplace 同一条;审计 R9 P1)。
  if (app.activeSlotCount - 1 + reservedSlots.value >= MAX_DEVICES) {
    toast.warn(t.value.tradein.errReplaceSlotConflict);
    confirming.value = false;
    return;
  }
  const newId = app.addDevice(s.newKind);
  if (!newId) {
    toast.warn(t.value.tradein.errPleaseRetry); // 新机没落盘 → 旧机与任务原封不动
    confirming.value = false;
    return;
  }
  if (!app.deactivateDevice(lowest.id)) { // frees slot + wipes currentTask;没落盘 = 没停,撤掉新机别继续
    if (!app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");
    toast.warn(t.value.tradein.errPleaseRetry);
    confirming.value = false;
    return;
  }
  const activated = app.activateDevice(newId, reservedSlots.value);
  if (!activated) {
    // Rollback: remove new, restore the snapshotted task, re-activate old.
    if (!app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");

    // persist-verdict-ok: 任务快照恢复不成 = 旧机任务已丢(deactivate 抹的),与其余回滚同一残余,已在 toast 里告知重试
    app.patchDevice(lowest.id, { currentTask: taskSnapshot });
    // persist-verdict-ok: 回滚里的再激活失败 = 旧机留在库存,设备页可手动激活;不再追补偿
    app.activateDevice(lowest.id, reservedSlots.value);
    toast.warn(t.value.tradein.errReplaceSlotConflict);
    confirming.value = false;
    return;
  }
  // 成功即任务作废(deactivate 已抹掉);失败则连同任务一起还原。PRODUCTION:
  // server atomically refunds/keeps the partial task reward + recycles slot +
  // writes ledger in one tx with idempotency key {userId}-{oldId}-{newKind}-{nonce}.
  const paid = postMoneyBill({
    type: "purchase",
    symbol: "USDT",
    amount: -s.newPrice,
    status: "posted",
    memo: fmt(t.value.tradein.forceReplaceBillMemo, {
      newKind: kindLabel(s.newKind),
      oldKind: kindLabel(lowest.kind),
    }),
  });
  if (paid !== "ok") {
    if (!app.discardSpawnedDevice(newId)) reportStuckFunds(app.captureMoney(), newId, "device");

    // persist-verdict-ok: 任务快照恢复不成 = 旧机任务已丢(deactivate 抹的),与其余回滚同一残余,已在 toast 里告知重试
    app.patchDevice(lowest.id, { currentTask: taskSnapshot });
    // persist-verdict-ok: 回滚里的再激活失败 = 旧机留在库存,设备页可手动激活;不再追补偿
    app.activateDevice(lowest.id, reservedSlots.value);
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: s.newPrice.toFixed(2) }));
    confirming.value = false;
    return;
  }
  // 成交即兑现意图:同账号该商品仍在窗内的链上发票一并作废(否则浮动条继续催第二笔;审计 R9 P1)。
  // persist-verdict-ok: 作废不掉 = 票留在磁盘,浮动条继续露出可取消的旧票,不会二次扣款
  pending.settleProduct(s.newKind);
  toast.success(
    fmt(t.value.tradein.replaceSuccessToast, {
      newKind: kindLabel(s.newKind),
      oldKind: kindLabel(lowest.kind),
    }),
  );
  confirming.value = false;
  hide();
  goDevices();
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => state.value.kind !== "none"), ".tis-root", hide);
</script>

<style scoped>
.tis-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.tis-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  animation: tradein-fade 0.24s ease-out;
}
.tis-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--v5-surface);
  border-top: 1px solid var(--v5-border);
  padding: 18px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  animation: tradein-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes tradein-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tradein-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.tis-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 44px; /* 44×44 点按区(移动端最小触控标准;PR-D 债 #4) */
  height: 44px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  z-index: 2;
  transition: opacity 0.15s;
}
/* 《08》§2:尺寸早就补到 44 了,但按下反馈一直缺 */
.tis-close:active {
  opacity: 0.7;
}
.tis-head {
  margin-bottom: 12px;
  padding-right: 40px;
}
.tis-head-mb4 {
  margin-bottom: 16px;
}
.tis-title {
  display: block;
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.3;
}
.tis-subtitle {
  display: block;
  font-size: 13px;
  color: var(--v5-ink-3);
  margin-top: 4px;
  line-height: 1.5;
}
/* option list (choice sheet) */
.tis-opt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tis-opt {
  width: 100%;
  min-height: 56px;
  border-radius: 12px;
  background: var(--v5-surface-2);
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.tis-opt:active {
  background: var(--v5-surface-3);
}
.tis-opt-ico {
  flex-shrink: 0;
}
.tis-opt-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--v5-ink);
  line-height: 1.4;
}
/* detail card (tradein / replace sheets) */
.tis-card {
  border-radius: 12px;
  background: var(--v5-surface-2);
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tis-card-mb4 {
  margin-bottom: 16px;
  gap: 4px;
}
.tis-card-cap {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
}
.tis-card-line {
  display: block;
  font-size: 13px;
  color: var(--v5-ink);
}
.tis-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tis-row-label {
  font-size: 13px;
  color: var(--v5-ink-3);
}
.tis-row-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-2);
}
.tis-num {
  font-variant-numeric: tabular-nums;
}
.tis-row-brand {
  color: var(--v5-brand);
}
.tis-row-emph {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.tis-hr {
  height: 1px;
  background: var(--v5-border);
}
.tis-disclaimer {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  line-height: 1.625;
  margin-bottom: 16px;
}
/* CTAs */
.tis-cta {
  width: 100%;
  min-height: 48px;
  border-radius: 999px;
  background: var(--v5-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.tis-cta:active {
  transform: scale(0.98);
}
.tis-cta-disabled {
  opacity: 0.5;
}
.tis-cta-text {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
.tis-secondary {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tis-secondary:active {
  opacity: 0.7;
}
.tis-secondary-text {
  font-size: 13px;
  color: var(--v5-ink-2);
}
.tis-ghost {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tis-ghost:active {
  opacity: 0.7;
}
.tis-ghost-text {
  font-size: 13px;
  font-weight: 400;
  color: var(--v5-ink-3);
}
.tis-warn-ghost {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tis-warn-ghost:active {
  opacity: 0.7;
}
.tis-warn-ghost-text {
  font-size: 13px;
  font-weight: 400;
  color: var(--v5-warning-ink);
}
/* block sheet header */
.tis-block-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  padding-right: 40px;
}
.tis-block-ico {
  flex-shrink: 0;
  margin-top: 2px;
}
.tis-block-meta {
  min-width: 0;
}
.tis-block-warn {
  display: block;
  font-size: 13px;
  color: var(--v5-ink-3);
  margin-top: 4px;
  line-height: 1.625;
}
</style>
