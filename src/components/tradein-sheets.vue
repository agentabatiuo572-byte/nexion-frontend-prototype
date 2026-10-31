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
    - Path B keep+buy:  POST /api/app/trade-in/capacity-keep
                        (wallet debit + paid order + inactive inventory device,
                        one server transaction)
-->
<template>
  <view v-if="active && state.kind !== 'none' && (state.kind !== 'tradein' || tradeinView || purchaseRecovery !== 'none')" class="tis-root" role="dialog" aria-modal="true" :aria-label="t.tradein.choiceTitle">
    <view class="tis-backdrop" @click="hide" />

    <view class="nx-glass-sheet tis-panel" @click.stop>
      <view class="tis-close" role="button" tabindex="0" :aria-label="t.ui.close" @click="hide"  @keydown.enter.prevent="hide" @keydown.space.prevent="hide">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </view>

      <!-- ─────────── 1. choice — trade-in or full price ─────────── -->
      <template v-if="capacityRecovery || capacityRecoveryUnavailable || keepRecoveryError">
        <view class="tis-head"><text class="tis-title">{{ capacityRecovery?.operation === 'keep' || keepRecoveryError ? t.tradein.keepRecoveryPending : recoveryCopy.paymentPending }}</text></view>
        <text v-if="keepRecoveryError" class="tis-disclaimer" role="alert">{{ t.tradein.keepRecoveryReadError }}</text>
        <text v-if="capacityRecovery" class="tis-card-line">{{ capacityRecovery.quote ? capacityRecovery.quote.targetProductName : kindLabel(capacityRecovery.targetProductNo as DeviceKind) }} · {{ formatAmount(capacityRecovery.quote ? capacityRecovery.quote.payableUsdt : capacityRecovery.payableUsdt) }} USDT</text>
        <view class="tis-cta" :class="{ 'tis-cta-disabled': capacityRecoveryBusy }" role="button" :tabindex="capacityRecoveryBusy ? -1 : 0" :aria-disabled="capacityRecoveryBusy" @click="recoverCapacityPurchase(false)" @keydown.enter.prevent="recoverCapacityPurchase(false)" @keydown.space.prevent="recoverCapacityPurchase(false)"><text class="tis-cta-text">{{ recoveryCopy.query }}</text></view>
        <view v-if="capacityResumeAllowed" class="tis-secondary" role="button" :tabindex="capacityRecoveryBusy ? -1 : 0" :aria-disabled="capacityRecoveryBusy" @click="recoverCapacityPurchase(true)" @keydown.enter.prevent="recoverCapacityPurchase(true)" @keydown.space.prevent="recoverCapacityPurchase(true)"><text class="tis-secondary-text">{{ recoveryCopy.resume }}</text></view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide" @keydown.enter.prevent="hide" @keydown.space.prevent="hide"><text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text></view>
      </template>
      <template v-else-if="state.kind === 'choice'">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.choiceTitle }}</text>
        </view>
        <view class="tis-opt-list">
          <view
            v-for="src in choiceSources"
            :key="src.id"
            class="tis-opt"
            :class="{ 'tis-cta-disabled': quoteLoading }"
            role="button"
            :tabindex="quoteLoading ? -1 : 0"
            :aria-disabled="quoteLoading"
            :aria-busy="quoteLoading"
            @click="onChooseTradein(src.id)"

            @keydown.enter.prevent="onKeyboardActivate($event, () => onChooseTradein(src.id))" @keydown.space.prevent="onKeyboardActivate($event, () => onChooseTradein(src.id))"
          >
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></svg>
            <text class="tis-opt-text">{{ src.label }}</text>
          </view>
          <view class="tis-opt" :class="{ 'tis-cta-disabled': quoteLoading }" role="button" :tabindex="quoteLoading ? -1 : 0" :aria-disabled="quoteLoading" :aria-busy="quoteLoading" @click="onChooseFullPrice"  @keydown.enter.prevent="onKeyboardActivate($event, onChooseFullPrice)" @keydown.space.prevent="onKeyboardActivate($event, onChooseFullPrice)">
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18 8 4A2 2 0 0 1 22 8v8a2 2 0 0 1-1.17 1.82l-8 4a2 2 0 0 1-1.66 0l-8-4A2 2 0 0 1 2 16V8a2 2 0 0 1 1.17-1.82l8-4a2 2 0 0 1 1.66 0z" /><path d="m7 4.5 10 5" /></svg>
            <text class="tis-opt-text">{{ t.tradein.choiceFullPriceOption }}</text>
          </view>
        </view>
      </template>

      <!-- ─────────── 1.5 retire — FEAT-DEV02 主动下架:选升级目标 ─────────── -->
      <template v-else-if="state.kind === 'retire' && retireView">
        <view class="tis-head">
          <text class="tis-title">{{ t.tradein.retireTitle }}</text>
          <text class="tis-subtitle" role="status" :aria-busy="retireView.loading">{{ retireView.subtitle }}</text>
        </view>
        <view class="tis-opt-list">
          <view v-for="p in retireView.targets" :key="p.id" class="tis-opt" :class="{ 'tis-cta-disabled': quoteLoading }" role="button" :tabindex="quoteLoading ? -1 : 0" :aria-disabled="quoteLoading" :aria-busy="quoteLoading" @click="onPickTarget(p.id)"  @keydown.enter.prevent="onKeyboardActivate($event, () => onPickTarget(p.id))" @keydown.space.prevent="onKeyboardActivate($event, () => onPickTarget(p.id))">
            <svg class="tis-opt-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /></svg>
            <text class="tis-opt-text">{{ p.label }}</text>
          </view>
        </view>
        <text v-if="retireView.statusText" class="tis-disclaimer" role="status" :aria-busy="retireView.loading">{{ retireView.statusText }}</text>
        <view v-if="retireView.retry" class="tis-secondary" role="button" tabindex="0" @click="retryRemoteRetireTargets" @keydown.enter.prevent="retryRemoteRetireTargets" @keydown.space.prevent="retryRemoteRetireTargets"><text class="tis-secondary-text">{{ t.store.purchaseEligibilityRetry }}</text></view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
          <text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text>
        </view>
      </template>

      <!-- ─────────── 2. tradein — 置换确认(去结算) ─────────── -->
      <template v-else-if="state.kind === 'tradein' && purchaseRecovery !== 'none'">
        <view class="tis-head"><text class="tis-title">{{ t.tradein.recoveryPending }}</text></view>
        <text v-if="purchaseRecovery === 'error'" class="tis-disclaimer" role="alert">{{ t.tradein.errPleaseRetry }}</text>
        <view class="tis-cta" :style="ctaHalo" role="button" tabindex="0" @click="onConfirmTradein" @keydown.enter.prevent="onKeyboardActivate($event, onConfirmTradein)" @keydown.space.prevent="onKeyboardActivate($event, onConfirmTradein)"><text class="tis-cta-text">{{ purchaseActionText }}</text></view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide" @keydown.enter.prevent="hide" @keydown.space.prevent="hide"><text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text></view>
      </template>
      <template v-else-if="state.kind === 'tradein' && remoteApiEnabled && purchaseMessage === 'error'">
        <view class="tis-head" role="status" :aria-busy="purchaseStatus === 'loading' || purchaseStatus === 'idle'">
          <text class="tis-title">{{ purchaseStatus === 'loading' || purchaseStatus === 'idle' ? t.store.purchaseEligibilityLoading : t.store.purchaseEligibilityError }}</text>
        </view>
        <view v-if="purchaseStatus === 'error' || purchaseStatus === 'ready'" class="tis-cta" :style="ctaHalo" role="button" tabindex="0" @click="onConfirmTradein" @keydown.enter.prevent="onKeyboardActivate($event, onConfirmTradein)" @keydown.space.prevent="onKeyboardActivate($event, onConfirmTradein)"><text class="tis-cta-text">{{ t.store.purchaseEligibilityRetry }}</text></view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide" @keydown.enter.prevent="hide" @keydown.space.prevent="hide"><text class="tis-ghost-text">{{ t.tradein.sheetCancel }}</text></view>
      </template>
      <template v-else-if="state.kind === 'tradein' && tradeinView">
        <view class="tis-head tis-head-mb4">
          <text class="tis-title">{{ purchaseConfirmed ? tradeinView.title : t.tradein.purchaseBlockedTitle }}</text>
        </view>

        <!-- 旧机 / 累计产出 / 档位 / 抵扣 / 预计应付 — soft surface card, no border -->
        <view v-if="purchaseConfirmed" class="tis-card">
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

        <PurchaseEligibilityPanel v-if="remoteApiEnabled" class="tis-purchase" :status="purchaseStatus" :snapshot="purchaseSnapshot" :blocking-only="purchaseBlocked" />
        <text v-if="purchaseConfirmed && remoteApiEnabled && canonicalQuote && !canonicalQuote.sufficientFunds" class="tis-disclaimer">{{ fmt(t.tradein.purchaseFundsGap, { amount: formatAmount(canonicalQuote.walletShortfallUsdt) }) }}</text>

        <text v-if="purchaseConfirmed" class="tis-disclaimer">{{ tradeinView.placementHint }}</text>
        <text v-if="purchaseConfirmed" class="tis-disclaimer">{{ t.tradein.sheetDisclaimer }}</text>

        <view class="tis-cta" :class="{ 'tis-cta-disabled': purchaseActionDisabled }" :style="ctaHalo" role="button" :tabindex="purchaseActionDisabled ? -1 : 0" :aria-disabled="purchaseActionDisabled" :aria-busy="purchaseActionBusy" @click="onConfirmTradein"  @keydown.enter.prevent="onKeyboardActivate($event, onConfirmTradein)" @keydown.space.prevent="onKeyboardActivate($event, onConfirmTradein)">
          <text class="tis-cta-text">{{ purchaseActionText }}</text>
        </view>
        <view v-if="remoteApiEnabled && purchaseMessage === 'quotaDepleted'" class="tis-ghost" role="button" tabindex="0" @click="refreshTradeinPurchaseEligibility" @keydown.enter.prevent="onKeyboardActivate($event, refreshTradeinPurchaseEligibility)" @keydown.space.prevent="onKeyboardActivate($event, refreshTradeinPurchaseEligibility)"><text class="tis-ghost-text">{{ t.store.purchaseEligibilityRetry }}</text></view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
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
          :class="{ 'tis-cta-disabled': replaceView.insufficient || confirming }"
          role="button"
          :tabindex="replaceView.insufficient || confirming ? -1 : 0"
          :aria-disabled="replaceView.insufficient || confirming"
          :aria-busy="confirming"
          @click="onReplace"

          @keydown.enter.prevent="onReplace" @keydown.space.prevent="onReplace"
        >
          <text class="tis-cta-text">{{ replaceView.replaceCta }}</text>
        </view>
        <view
          v-if="!remoteApiEnabled || (state.kind === 'replace' && state.canonicalCapacityQuote?.decision === 'CAPACITY_AVAILABLE')"
          class="tis-secondary"
          :class="{ 'tis-cta-disabled': replaceView.insufficient || confirming }"
          role="button"
          :tabindex="replaceView.insufficient || confirming ? -1 : 0"
          :aria-disabled="replaceView.insufficient || confirming"
          :aria-busy="confirming"
          @click="onKeepBuy"

          @keydown.enter.prevent="onKeepBuy" @keydown.space.prevent="onKeepBuy"
        >
          <text class="tis-secondary-text">{{ replaceView.keepCta }}</text>
        </view>
        <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
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
        <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
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
          <view class="tis-cta" role="button" tabindex="0" @click="onGoTasks"  @keydown.enter.prevent="onKeyboardActivate($event, onGoTasks)" @keydown.space.prevent="onKeyboardActivate($event, onGoTasks)">
            <text class="tis-cta-text">{{ t.tradein.retireBlockViewTask }}</text>
          </view>
          <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
            <text class="tis-ghost-text">{{ t.tradein.retireBlockOk }}</text>
          </view>
        </template>
        <template v-else>
          <view class="tis-cta" role="button" tabindex="0" @click="onWait"  @keydown.enter.prevent="onKeyboardActivate($event, onWait)" @keydown.space.prevent="onKeyboardActivate($event, onWait)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
            <text class="tis-cta-text">{{ t.tradein.blockWaitCta }}</text>
          </view>
          <view class="tis-warn-ghost" role="button" :tabindex="confirming ? -1 : 0" :aria-disabled="confirming" :aria-busy="confirming" @click="onForce"  @keydown.enter.prevent="onKeyboardActivate($event, onForce)" @keydown.space.prevent="onKeyboardActivate($event, onForce)">
            <text class="tis-warn-ghost-text">{{ t.tradein.blockForceCta }}</text>
          </view>
          <view class="tis-ghost" role="button" tabindex="0" @click="hide"  @keydown.enter.prevent="onKeyboardActivate($event, hide)" @keydown.space.prevent="onKeyboardActivate($event, hide)">
            <text class="tis-ghost-text">{{ t.tradein.blockCancel }}</text>
          </view>
        </template>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead } from "@/lib/passive-tab-read";
import { formatAmount } from "@/lib/amount-display";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useTradeinSheet } from "@/store/tradein-sheet";
import { useApp } from "@/store/app";
import { postMoneyBill, reportStuckFunds } from "@/lib/money-receipt";
import { usePendingCheckout } from "@/store/pending-checkout";
import { trialReservesSlotNow } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { getProduct, PRODUCTS } from "@/mock/products";
import { DEVICE_SPECS, createDevice } from "@/store/device-types";
import { computeTradeInCredit, ladderBandFor, TRADEIN_LADDER_RULES } from "@/mock/tradein-config";
import { isDeviceTaskBlocked } from "@/mock/eligibility";
import { getMonthsSince, isPhaseReached, isTradeInTargetAvailable } from "@/store/product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import { navReset, navTo } from "@/lib/route";
import type { DeviceKind, Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { deviceName, deviceNameByKind } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { apiClient, apiRuntimeConfig, deviceE3Api, orderApi, purchaseEligibilityApi, remoteApiEnabled } from "@/api/runtime";
import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import PurchaseEligibilityPanel from "@/components/store/purchase-eligibility-panel.vue";
import type { CanonicalCapacityReplaceQuote, CanonicalTradeinConfig, CanonicalTradeinQuote } from "@/api/device-e3-api";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { isProductAvailable } from "@/store/product-availability";
import { useOrders } from "@/store/orders";
import { completeVerifiedMutation, handleNoActiveDeviceDecision } from "@/domain/e20-capacity-coordinator";
import { executePaymentWithPassword } from "@/lib/authorized-payment";
import { readPaymentCommand } from "@/api/payment-command-api";
import { parseCanonicalTradeinResult,parseCanonicalCapacityKeepResult,type CanonicalTradeinResult,type CanonicalCapacityKeepResult } from "@/api/device-e3-api";
import { purchaseRecoveryCopy } from "@/lib/purchase-recovery-copy";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { acquireAccountCommandKey, releaseAccountCommandKey,readAccountRow,writeAccountRow } from "@/store/account-scoped-storage";
import { readCheckoutTradein } from "@/lib/checkout-order-recovery";
import { CAPACITY_COMMAND_TABLE, readPendingKeepCommand, type PendingKeepCommand } from "@/lib/keep-command-recovery";

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const sheet = useTradeinSheet();
const app = useApp();
const pending = usePendingCheckout();
const orders = useOrders();
const t = useT();
const locale = useLocaleStore();
const recoveryCopy = computed(()=>purchaseRecoveryCopy(locale.code));
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
const canonicalQuoteOrigin = ref<{ environment: string; baseUrl: string } | null>(null);
const canonicalTradeinConfig = ref<CanonicalTradeinConfig | null>(null);
const canonicalTradeinConfigStatus = ref<"loading" | "ready" | "error">("loading");
const remoteRetireEligibleTargets = ref<Set<string>>(new Set());
// Server-quoted payable per eligible retire target (PRD §7.5.3: each row shows its post-credit price).
const remoteRetirePayables = ref<Map<string, number>>(new Map());
const remoteRetirePending = ref(false);
const remoteRetireLoadError = ref(false);
const remoteRetireOrigin = ref<{ environment: string; baseUrl: string } | null>(null);
const capacityCommandKey = ref<string | null>(null);
const keepRecovery = ref<PendingKeepCommand | null>(null);
const keepRecoveryError = ref(false);
function keepTarget(): DeviceKind | null {
  const current = state.value;
  return current.kind === "choice" || current.kind === "keep-recovery" ? current.targetKind : current.kind === "replace" ? current.newKind : null;
}
function readPendingKeep(targetProductNo?: DeviceKind): PendingKeepCommand | null {
  return readPendingKeepCommand(app.accountKey, targetProductNo);
}
function refreshKeepRecovery(target: DeviceKind | null = keepTarget()): void {
  keepRecovery.value = null; keepRecoveryError.value = false;
  if (!remoteApiEnabled || !target) return;
  try { keepRecovery.value = readPendingKeep(target); }
  catch { keepRecoveryError.value = true; }
}
watch([() => app.accountKey, () => app.accountBindingEpoch, keepTarget], () => refreshKeepRecovery(), { immediate: true, flush: "sync" });
function onRecoverKeep(): void {
  if (confirming.value) return;
  refreshKeepRecovery();
  const command = keepRecovery.value;
  if (!command) return;
  void recoverCapacityPurchase(false);
}
const CAPACITY_RECOVERY_TABLE = "nexgrid-e3-capacity-payment-accounts-v1";
type CapacityPending = {operation:"replace"|"keep";intent:string;key:string;quote:CanonicalCapacityReplaceQuote}
  | (PendingKeepCommand & {operation:"keep";quote:null});
const capacityRecovery = ref<CapacityPending|null>(null);
const capacityRecoveryBusy = ref(false);
const capacityResumeAllowed = ref(false);
const capacityRecoveryUnavailable = ref(false);
watch([()=>app.accountKey,()=>app.accountBindingEpoch,()=>props.active,()=>state.value.kind],()=>{
  capacityResumeAllowed.value=false;
  try { capacityRecovery.value=remoteApiEnabled?readCapacityPending(app.accountKey):null;capacityRecoveryUnavailable.value=false; }
  catch { capacityRecoveryUnavailable.value=true; }
},{immediate:true,flush:'sync'});
const quoteRequestGeneration = ref(0);
const quoteLoading = ref(false);
const purchaseSnapshot = ref<PurchaseEligibilitySnapshot | null>(null);
// One opening request is handed to the confirmation watcher once; retries and checkout always read again.
let purchaseOpeningRead: {
  account: ReturnType<typeof captureAccountScope>;
  oldDeviceId: string;
  sourceRowVersion: Device["rowVersion"];
  target: DeviceKind;
  origin: { environment: string; baseUrl: string };
  result: Promise<PurchaseEligibilitySnapshot | null>;
} | null = null;
const purchaseStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const purchaseRecovery = ref<"none" | "pending" | "error">("none");
let purchaseReadGeneration = 0;
let purchaseSheetEpoch = 0;
let purchaseMounted = true;
let purchaseReturn: {
  account: ReturnType<typeof captureAccountScope>;
  accountKey: string;
  accountEpoch: number;
  oldDeviceId: string;
  newKind: DeviceKind;
  newPrice: number;
  quote: CanonicalTradeinQuote;
  origin: { environment: string; baseUrl: string };
} | null = null;
const purchaseScopeKey = computed(() => {
  const current = state.value;
  if (!props.active || current.kind !== "tradein") return "";
  const source = app.devices.find(device => device.id === current.oldDeviceId);
  const quote = canonicalQuote.value;
  const origin = canonicalQuoteOrigin.value;
  if (!source || !quote || !origin || origin.environment !== apiRuntimeConfig.environment || origin.baseUrl !== apiRuntimeConfig.baseUrl
      || quote.sourceDeviceId !== Number(source.id)
      || quote.targetProductNo !== current.newKind || quote.sourceRowVersion !== source.rowVersion) return "";
  return JSON.stringify([app.accountKey, app.accountBindingEpoch, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl, source.id, source.rowVersion,
    current.newKind, quote.targetDeviceStatus, quote.payableUsdt, quote.discountUsdt]);
});
const purchaseMessage = computed(() => resolvePurchaseEligibilityMessage(purchaseStatus.value, purchaseSnapshot.value));
const purchaseBlocked = computed(() => remoteApiEnabled && (purchaseMessage.value === "ineligible" || purchaseMessage.value === "quotaDepleted"));
const purchaseConfirmed = computed(() => !remoteApiEnabled || purchaseMessage.value === "eligible");
const purchaseActionBusy = computed(() => confirming.value || remoteApiEnabled && (purchaseStatus.value === "loading" || !props.active));
const purchaseActionDisabled = computed(() => purchaseActionBusy.value || remoteApiEnabled && purchaseMessage.value === "quotaDepleted");
const purchaseActionText = computed(() => purchaseRecovery.value === "pending" ? t.value.tradein.purchaseResume
  : purchaseRecovery.value === "error" ? t.value.store.purchaseEligibilityRetry
  : !remoteApiEnabled || purchaseMessage.value === "eligible"
  ? tradeinView.value?.ctaText ?? ""
  : purchaseStatus.value === "loading" || purchaseStatus.value === "idle" ? t.value.store.purchaseEligibilityLoading
  : purchaseMessage.value === "ineligible" ? t.value.tradein.purchaseViewConditions
  : purchaseMessage.value === "quotaDepleted" ? t.value.tradein.purchaseQuotaDepleted : t.value.store.purchaseEligibilityRetry);

function readTradeinRecovery(): "none" | "pending" | "error" {
  const current = state.value;
  purchaseRecovery.value = "none";
  if (!remoteApiEnabled || current.kind !== "tradein" || !props.active) return "none";
  try {
    purchaseRecovery.value = readCheckoutTradein(app.accountKey, current.newKind) ? "pending" : "none";
  } catch {
    purchaseRecovery.value = "error";
  }
  return purchaseRecovery.value;
}

async function refreshTradeinPurchaseEligibility(): Promise<boolean> {
  if (readTradeinRecovery() !== "none") return false;
  const key = purchaseScopeKey.value;
  if (!remoteApiEnabled || !key || !purchaseMounted) return false;
  const request = ++purchaseReadGeneration;
  const account = captureAccountScope();
  const origin = { ...apiRuntimeConfig };
  const target = state.value.kind === "tradein" ? state.value.newKind : "";
  const current = () => purchaseMounted && props.active && request === purchaseReadGeneration
    && purchaseRecovery.value === "none" && key === purchaseScopeKey.value && isCurrentAccountScope(account)
    && origin.environment === apiRuntimeConfig.environment && origin.baseUrl === apiRuntimeConfig.baseUrl;
  purchaseStatus.value = "loading";
  purchaseSnapshot.value = null;
  const opening = purchaseOpeningRead;
  purchaseOpeningRead = null;
  try {
    const sheetState = state.value;
    const source = sheetState.kind === "tradein"
      ? app.devices.find(device => device.id === sheetState.oldDeviceId) : null;
    const snapshot = await (opening && opening.target === target && opening.oldDeviceId === source?.id
      && opening.sourceRowVersion === source.rowVersion && isCurrentAccountScope(opening.account)
      && opening.origin.environment === apiRuntimeConfig.environment && opening.origin.baseUrl === apiRuntimeConfig.baseUrl
      ? opening.result : purchaseEligibilityApi.get(target));
    if (!current()) return false;
    if (!snapshot) throw new Error("PURCHASE_ELIGIBILITY_UNAVAILABLE");
    purchaseSnapshot.value = snapshot;
    purchaseStatus.value = "ready";
    return resolvePurchaseEligibilityMessage("ready", snapshot) === "eligible";
  } catch {
    if (current()) purchaseStatus.value = "error";
    return false;
  } finally {
    if (purchaseMounted && request === purchaseReadGeneration
        && (origin.environment !== apiRuntimeConfig.environment || origin.baseUrl !== apiRuntimeConfig.baseUrl)) {
      purchaseSnapshot.value = null;
      purchaseStatus.value = "error";
    }
  }
}
watch([purchaseScopeKey, state, () => app.accountKey, () => app.accountBindingEpoch, () => props.active,
  () => state.value.kind === "tradein" ? `${state.value.oldDeviceId}|${state.value.newKind}` : ""], () => {
  purchaseSheetEpoch++;
  purchaseReadGeneration++;
  purchaseSnapshot.value = null;
  purchaseStatus.value = "idle";
  confirming.value = false;
  if (readTradeinRecovery() !== "none") { purchaseOpeningRead = null; return; }
  if (remoteApiEnabled && props.active && state.value.kind === "tradein") {
    if (purchaseScopeKey.value) void refreshTradeinPurchaseEligibility();
    else purchaseStatus.value = "error";
  } else purchaseOpeningRead = null;
}, { flush: "sync" });
function restoreTradeinAfterConditions(): void {
  const pendingReturn = purchaseReturn;
  purchaseReturn = null;
  if (!pendingReturn || !props.active || state.value.kind !== "none"
      || app.accountKey !== pendingReturn.accountKey || app.accountBindingEpoch !== pendingReturn.accountEpoch
      || pendingReturn.origin.environment !== apiRuntimeConfig.environment || pendingReturn.origin.baseUrl !== apiRuntimeConfig.baseUrl
      || !isCurrentAccountScope(pendingReturn.account)) return;
  const source = app.devices.find(device => device.id === pendingReturn.oldDeviceId);
  if (!source || source.rowVersion !== pendingReturn.quote.sourceRowVersion) return;
  canonicalQuoteOrigin.value = pendingReturn.origin;
  canonicalQuote.value = pendingReturn.quote;
  sheet.showTradein(pendingReturn.oldDeviceId, pendingReturn.newKind, pendingReturn.newPrice);
}
watch(() => props.active, active => { if (active) restoreTradeinAfterConditions(); }, { flush: "sync" });
onUnmounted(() => { purchaseMounted = false; purchaseReadGeneration++; purchaseSheetEpoch++; purchaseReturn = null; purchaseOpeningRead = null; });
function navigateTradeinCheckout(targetId: string): void {
  hide();
  const closedState = state.value;
  const navigationAccount = captureAccountScope();
  const cur = (getCurrentPages().slice(-1)[0] as { route?: string } | undefined)?.route ?? "";
  if (!cur.includes("store/checkout")) {
    setTimeout(() => {
      if (purchaseMounted && props.active && state.value === closedState && isCurrentAccountScope(navigationAccount)) {
        void navTo(`/pages/store/checkout?product=${encodeURIComponent(targetId)}`);
      }
    }, 260);
  }
}
let remoteRetireRequest = 0;
watch([state, () => props.active, () => apiRuntimeConfig.environment, () => apiRuntimeConfig.baseUrl, () => {
  const current = state.value;
  const ids = current.kind === "choice" ? current.tradeInSources
    : "oldDeviceId" in current ? [current.oldDeviceId] : [];
  return ids.map(id => `${id}:${app.devices.find(device => device.id === id)?.rowVersion}`).join("|");
}], () => {
  quoteRequestGeneration.value++;
  quoteLoading.value = false;
}, { flush: "sync" });
watch([() => app.accountKey, () => app.accountBindingEpoch], () => {
  quoteRequestGeneration.value += 1;
  canonicalQuote.value = null;
  canonicalQuoteOrigin.value = null;
  canonicalTradeinConfig.value = null;
  canonicalTradeinConfigStatus.value = "loading";
  remoteRetireEligibleTargets.value = new Set();
  remoteRetirePayables.value = new Map();
  remoteRetireRequest += 1;
  capacityCommandKey.value = null;
  quoteLoading.value = false;
  // app.bindAccount is followed by the global account rebind in the same stack.
  void nextTick(() => loadCanonicalTradeinConfig());
}, { flush: "sync" });
watch([() => apiRuntimeConfig.environment, () => apiRuntimeConfig.baseUrl], () => {
  canonicalQuote.value = null;
  canonicalQuoteOrigin.value = null;
  purchaseOpeningRead = null;
  purchaseReturn = null;
  canonicalTradeinConfig.value = null;
  canonicalTradeinConfigStatus.value = "loading";
  void nextTick(() => loadCanonicalTradeinConfig());
}, { flush: "sync" });
let canonicalTradeinConfigRead: { key: string; result: Promise<void> } | null = null;
function canonicalTradeinConfigScope(): string {
  return JSON.stringify([captureAccountScope(), app.accountKey, app.accountBindingEpoch,
    apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl]);
}
function loadCanonicalTradeinConfig(retry = false): Promise<void> {
  if (!remoteApiEnabled || !purchaseMounted) return Promise.resolve();
  const key = canonicalTradeinConfigScope();
  if (canonicalTradeinConfigRead?.key === key) return canonicalTradeinConfigRead.result;
  if (retry) invalidatePassiveTabRead("tradein-config");
  const requestScope = captureAccountScope();
  // Read-only POSTs can advance the passive write revision; they do not change this config's owner.
  const current = () => purchaseMounted && key === canonicalTradeinConfigScope() && isCurrentAccountScope(requestScope);
  canonicalTradeinConfigStatus.value = "loading";
  const result = runPassiveTabRead("tradein-config", () => deviceE3Api.tradeinConfig()).then((value) => {
    if (current()) { canonicalTradeinConfigStatus.value = "ready"; canonicalTradeinConfig.value = value; }
  }).catch(() => {
    if (current()) { canonicalTradeinConfig.value = null; canonicalTradeinConfigStatus.value = "error"; }
  }).finally(() => {
    if (canonicalTradeinConfigRead?.result === result) canonicalTradeinConfigRead = null;
  });
  canonicalTradeinConfigRead = { key, result };
  return result;
}
onMounted(() => {
  void loadCanonicalTradeinConfig();
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
  purchaseReturn = null;
  quoteRequestGeneration.value += 1;
  quoteLoading.value = false;
  sheet.hide();
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}

// ── deferred route past the sheet's exit so it doesn't flash on /me/devices ──
function goDevices() {
  setTimeout(() => {
    navReset({ url: "/pages/me/devices", fail: () => {} });
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
      label: remoteApiEnabled
        ? `${deviceName(t.value, d)} · ${t.value.tradein.remoteQuoteCreditLabel}`
        : fmt(t.value.tradein.choiceTradeInOption, {
        name: deviceName(t.value, d),
        credit: formatAmount(previewCredit(d, s.newPrice)),
      }),
    }));
});

async function openTradeinQuote(oldDevice: Device, targetKind: DeviceKind, newPrice: number): Promise<void> {
  if (quoteLoading.value || !props.active || !purchaseMounted) return;
  const requestGeneration = ++quoteRequestGeneration.value;
  if (!remoteApiEnabled) {
    canonicalQuote.value = null;
    sheet.showTradein(oldDevice.id, targetKind, newPrice);
    return;
  }
  quoteLoading.value = true;
  const requestScope = captureAccountScope();
  const requestOrigin = { ...apiRuntimeConfig };
  const openingState = state.value;
  const sourceRowVersion = oldDevice.rowVersion;
  const requestIsCurrent = () => purchaseMounted && props.active && state.value === openingState
    && requestGeneration === quoteRequestGeneration.value && isCurrentAccountScope(requestScope)
    && requestOrigin.environment === apiRuntimeConfig.environment && requestOrigin.baseUrl === apiRuntimeConfig.baseUrl
    && app.devices.find(device => device.id === oldDevice.id)?.rowVersion === sourceRowVersion;
  try {
    // Recover an existing command before starting a new quote or qualification read.
    if (readCheckoutTradein(app.accountKey, targetKind)) {
      sheet.showTradein(oldDevice.id, targetKind, newPrice);
      return;
    }
    // quote revalidates the source and E1; purchase eligibility also checks F4B.
    // Consume rejection here even when quote fails or the sheet closes first.
    const result = purchaseEligibilityApi.get(targetKind).catch(() => null);
    const quote = await deviceE3Api.quote(Number(oldDevice.id), targetKind);
    if (!requestIsCurrent()) return;
    if (quote.sourceDeviceId !== Number(oldDevice.id) || quote.targetProductNo !== targetKind
        || quote.sourceRowVersion !== sourceRowVersion) throw new Error("TRADEIN_QUOTE_SCOPE_MISMATCH");
    purchaseOpeningRead = { account: requestScope, oldDeviceId: oldDevice.id, sourceRowVersion, target: targetKind, origin: requestOrigin, result };
    canonicalQuoteOrigin.value = requestOrigin;
    canonicalQuote.value = quote;
    sheet.showTradein(oldDevice.id, targetKind, newPrice);
  } catch {
    if (!requestIsCurrent()) return;
    canonicalQuote.value = null;
    toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    if (purchaseMounted && requestGeneration === quoteRequestGeneration.value) quoteLoading.value = false;
  }
}

function onChooseTradein(deviceId: string) {
  const s = state.value;
  if (s.kind !== "choice" || quoteLoading.value) return;
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

async function onChooseFullPrice() {
  const s = state.value;
  if (s.kind !== "choice" || quoteLoading.value) return;
  if (remoteApiEnabled) {
    refreshKeepRecovery(s.targetKind);
    if (keepRecovery.value) { onRecoverKeep(); return; }
    if (keepRecoveryError.value) { toast.warn(t.value.tradein.errPleaseRetry); return; }
    const requestGeneration = ++quoteRequestGeneration.value;
    const requestScope = captureAccountScope();
    const requestIsCurrent = () => requestGeneration === quoteRequestGeneration.value
      && isCurrentAccountScope(requestScope);
    quoteLoading.value = true;
    try {
      const quote = await deviceE3Api.capacityQuote(s.targetKind);
      if (!requestIsCurrent()) return;
      if (quote.decision === "REPLACE_REQUIRED") {
        sheet.showCanonicalReplace(s.targetKind, quote.payableUsdt, quote);
        return;
      }
      if (quote.decision === "NO_ACTIVE_DEVICE") {
        await handleNoActiveDeviceDecision({
          notify: () => {
            if (requestIsCurrent()) toast.warn(t.value.tradein.errNoActiveDevice);
          },
          refreshFleet: async () => {
            if (!requestIsCurrent()) return;
            await app.refreshRemoteFleet();
          }, // best-effort:失败自吞
        });
      }
      if (requestIsCurrent()) hide();
    } catch {
      if (requestIsCurrent()) toast.warn(t.value.tradein.errPleaseRetry);
    } finally {
      if (requestIsCurrent()) quoteLoading.value = false;
    }
    return;
  }
  // If slot full, hand off to the replace sheet; else just dismiss (caller's
  // checkout flow proceeds normally to payment).
  if ((app.remoteSlotsUsed ?? (app.activeSlotCount + reservedSlots.value)) >= app.slotCap) {
    sheet.showReplace(s.targetKind, s.newPrice);
  } else {
    hide();
  }
}

// ───────────────────── 1.5 retire — 主动下架:选升级目标 ─────────────────────

const remoteRetireLoadKey = computed(() => {
  const current = state.value;
  if (!props.active || current.kind !== "retire") return "closed";
  const config = canonicalTradeinConfig.value;
  const source = app.devices.find(device => device.id === current.oldDeviceId);
  return [app.accountKey, app.accountBindingEpoch, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl,
    current.oldDeviceId, source?.rowVersion, source?.paidPriceUsdt, source?.activatedAt,
    source?.pendingDeactivate, Boolean(source?.currentTask), productCatalogState.status, productCatalogState.revision,
    config?.enabled, config?.requireHigherPrice, config?.earlyAccessEnabled,
    config?.earlyAccessLeadDays].join("|");
});

async function loadRemoteRetireTargets() {
  const current = state.value;
  if (!remoteApiEnabled || !props.active || !purchaseMounted || current.kind !== "retire") return;
  const config = canonicalTradeinConfig.value;
  const source = app.devices.find((device) => device.id === current.oldDeviceId);
  if (!config || !source || productCatalogState.status !== "ready") {
    remoteRetireEligibleTargets.value = new Set();
    if (!config) void loadCanonicalTradeinConfig(true);
    return;
  }
  if (!config.enabled) {
    remoteRetireEligibleTargets.value = new Set();
    return;
  }

  const request = ++remoteRetireRequest;
  const requestScope = captureAccountScope();
  const key = remoteRetireLoadKey.value;
  const requestOrigin = { ...apiRuntimeConfig };
  remoteRetireOrigin.value = requestOrigin;
  const requestIsCurrent = () => purchaseMounted && props.active && request === remoteRetireRequest
    && isCurrentAccountScope(requestScope) && key === remoteRetireLoadKey.value && state.value === current
    && requestOrigin.environment === apiRuntimeConfig.environment && requestOrigin.baseUrl === apiRuntimeConfig.baseUrl;
  const paid = source.paidPriceUsdt ?? 0;
  const candidates = PRODUCTS.filter((product) => !config.requireHigherPrice || product.price > paid);
  remoteRetirePending.value = candidates.length > 0;
  await Promise.allSettled(candidates.map(async ({ id }) => {
    try {
      const eligibility = await deviceE3Api.eligibility(id);
      if (!requestIsCurrent()) return;
      if (eligibility.targetProductNo !== id) { remoteRetireLoadError.value = true; return; }
      if (!eligibility.enabled || !eligibility.eligible || !eligibility.sources.some((candidate) => candidate.eligible
        && candidate.sourceDeviceId === Number(current.oldDeviceId))) return;
      remoteRetireEligibleTargets.value = new Set([...remoteRetireEligibleTargets.value, id]);
      // Each authorized row appears immediately. A pending/failed quote stays "—".
      const quote = await deviceE3Api.quote(Number(current.oldDeviceId), id);
      if (!requestIsCurrent()) return;
      if (quote.sourceDeviceId !== Number(current.oldDeviceId)
          || quote.targetProductNo !== id || quote.sourceRowVersion !== source.rowVersion) {
        remoteRetireLoadError.value = true; return;
      }
      remoteRetirePayables.value = new Map([...remoteRetirePayables.value, [id, quote.payableUsdt]]);
    } catch {
      if (requestIsCurrent()) remoteRetireLoadError.value = true;
    }
  }));
  if (purchaseMounted && props.active && request === remoteRetireRequest && state.value === current) {
    remoteRetirePending.value = false;
    if (requestOrigin.environment !== apiRuntimeConfig.environment || requestOrigin.baseUrl !== apiRuntimeConfig.baseUrl) {
      remoteRetireEligibleTargets.value = new Set();
      remoteRetirePayables.value = new Map();
      remoteRetireLoadError.value = true;
    }
  }
}

function retryRemoteRetireTargets() {
  if (!remoteApiEnabled || !props.active || !purchaseMounted || state.value.kind !== "retire" || remoteRetirePending.value) return;
  if (!canonicalTradeinConfig.value || productCatalogState.status !== "ready") {
    if (!canonicalTradeinConfig.value) void loadCanonicalTradeinConfig(true);
    if (productCatalogState.status !== "ready") void refreshProductCatalog();
    return;
  }
  remoteRetireEligibleTargets.value = new Set();
  remoteRetirePayables.value = new Map();
  remoteRetireLoadError.value = false;
  void loadRemoteRetireTargets();
}

watch([remoteRetireLoadKey, state], () => {
  remoteRetireRequest++;
  remoteRetireEligibleTargets.value = new Set();
  remoteRetirePayables.value = new Map();
  remoteRetireOrigin.value = null;
  remoteRetirePending.value = false;
  remoteRetireLoadError.value = false;
  void loadRemoteRetireTargets();
}, { immediate: true, flush: "sync" });

const retireView = computed(() => {
  const s = state.value;
  if (s.kind !== "retire") return null;
  if (remoteApiEnabled && (productCatalogState.status !== "ready" || !canonicalTradeinConfig.value)) {
    const failed = productCatalogState.status === "error" || canonicalTradeinConfigStatus.value === "error";
    return {
      subtitle: failed ? t.value.store.purchaseEligibilityError : t.value.store.purchaseEligibilityLoading,
      targets: [], loading: !failed, retry: failed, statusText: "",
    };
  }
  const device = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!device) return null;
  const paid = device.paidPriceUsdt ?? 0;
  // 目标 = 目录中合规的可购 SKU(select 列表,不手输;规格 DEV02A ⑥)。
  // 「仅限更高价」与「已上架 ∨ 抢先购窗口」均为运营可配规则,消费 flag 不硬编码。
  const targets = PRODUCTS.filter(
    (p) =>
      (!remoteApiEnabled || canonicalTradeinConfig.value?.enabled) &&
      (!(remoteApiEnabled ? canonicalTradeinConfig.value?.requireHigherPrice !== false : TRADEIN_LADDER_RULES.requireHigherPrice) || p.price > paid) &&
      (remoteApiEnabled
        ? remoteRetireEligibleTargets.value.has(p.id)
        : isTradeInTargetAvailable(p.unlocksAtPhase, phase.value, monthsSinceJoin.value)),
  ).map((p) => {
    // 抢先购窗口内的未正式上架目标,行尾加「抢先升级」标(默认关闭时零渲染)。
    const early = !!p.unlocksAtPhase && !isPhaseReached(phase.value, p.unlocksAtPhase)
      && (!remoteApiEnabled || canonicalTradeinConfig.value?.earlyAccessEnabled === true);
    const remotePayable = remoteRetirePayables.value.get(p.id);
    const net = remoteApiEnabled
      ? (remotePayable == null ? "—" : formatAmount(remotePayable))
      : formatAmount(Math.max(0, p.price - previewCredit(device, p.price)));
    const base = fmt(t.value.tradein.retireTargetOption, {
      name: p.name,
      price: formatAmount(p.price),
      net,
    });
    return { id: p.id, label: early ? `${base} · ${t.value.tradein.retireEarlyTag}` : base };
  });
  return {
    subtitle: targets.length ? fmt(t.value.tradein.retireSubtitle, { name: deviceName(t.value, device) })
      : remoteApiEnabled && remoteRetirePending.value ? t.value.store.purchaseEligibilityLoading
      : remoteApiEnabled && remoteRetireLoadError.value ? t.value.store.purchaseEligibilityError : t.value.tradein.retireNoTargets,
    targets, loading: remoteApiEnabled && remoteRetirePending.value,
    retry: remoteApiEnabled && !remoteRetirePending.value && remoteRetireLoadError.value,
    statusText: !remoteApiEnabled || !targets.length ? "" : remoteRetirePending.value ? t.value.store.purchaseEligibilityLoading
      : remoteRetireLoadError.value ? t.value.store.purchaseEligibilityError : "",
  };
});

function onPickTarget(productId: string) {
  const s = state.value;
  const origin = remoteRetireOrigin.value;
  if (!props.active || s.kind !== "retire" || quoteLoading.value
      || remoteApiEnabled && (!remoteRetireEligibleTargets.value.has(productId) || !origin
        || origin.environment !== apiRuntimeConfig.environment || origin.baseUrl !== apiRuntimeConfig.baseUrl)) return;
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
    earned: formatAmount(earned),
    bandText: remoteQuote
      ? fmt(t.value.tradein.remoteQuoteBandLabel, { pct: remoteQuote.creditRatePct })
      : band
      ? fmt(t.value.tradein.sheetBandText, { band: band.band, pct: band.creditPct })
      : "—",
    credit: formatAmount(credit),
    placementHint: (remoteQuote ? remoteQuote.targetDeviceStatus === "ACTIVE" : oldDevice.activatedAt != null)
      ? t.value.tradein.inheritActiveHint : t.value.tradein.inheritInventoryHint,
    estNet: formatAmount(estNet),
    ctaText: fmt(t.value.tradein.sheetCta, { amount: formatAmount(estNet) }),
  };
});

async function onConfirmTradein() {
  const s = state.value;
  if (s.kind !== "tradein" || confirming.value || !props.active) return;
  const recovery = readTradeinRecovery();
  if (recovery === "pending") { navigateTradeinCheckout(s.newKind); return; }
  if (recovery === "error") return;
  const origin = canonicalQuoteOrigin.value;
  if (remoteApiEnabled && (!origin || origin.environment !== apiRuntimeConfig.environment || origin.baseUrl !== apiRuntimeConfig.baseUrl)) {
    canonicalQuote.value = null;
    purchaseSnapshot.value = null;
    purchaseStatus.value = "error";
    purchaseReturn = null;
    purchaseOpeningRead = null;
    return;
  }
  if (purchaseActionDisabled.value) return;
  if (remoteApiEnabled) {
    if (purchaseMessage.value === "ineligible" && purchaseScopeKey.value && canonicalQuote.value) {
      const pendingReturn = { account: captureAccountScope(), accountKey: app.accountKey,
        accountEpoch: app.accountBindingEpoch, oldDeviceId: s.oldDeviceId, newKind: s.newKind,
        newPrice: s.newPrice, quote: canonicalQuote.value, origin: origin! };
      hide();
      purchaseReturn = pendingReturn;
      if (!(await navTo(`/pages/team/quota?product=${encodeURIComponent(s.newKind)}&intent=tradein-conditions`))) restoreTradeinAfterConditions();
      return;
    }
    if (purchaseMessage.value !== "eligible") {
      await refreshTradeinPurchaseEligibility();
      return;
    }
    const epoch = purchaseSheetEpoch;
    confirming.value = true;
    const eligible = await refreshTradeinPurchaseEligibility();
    if (epoch !== purchaseSheetEpoch) return;
    confirming.value = false;
    if (!eligible) return;
    const recoveryAfterRead = readTradeinRecovery();
    if (recoveryAfterRead === "pending") { navigateTradeinCheckout(s.newKind); return; }
    if (recoveryAfterRead === "error") return;
  }
  const oldDevice = app.devices.find((d) => d.id === s.oldDeviceId) ?? null;
  if (!oldDevice) {
    hide();
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  // 入口后任务才开始的竞态:退回阻断提示(规格 DEV02A 异常2)。判定单源
  // isDeviceTaskBlocked——库存机的出厂任务不在跑,不阻断。
  if (!remoteApiEnabled && isDeviceTaskBlocked(oldDevice)) {
    sheet.showRetireBlock(oldDevice.id, oldDevice.name);
    return;
  }
  confirming.value = true;
  // FEAT-DEV02:确认 = 写入结算抵扣上下文,原子事务(净额扣款 + 移除旧机 + 新机
  // 新机继承原位置)统一发生在结算页持久块——本弹层不再直接动钱/动设备数组。
  sheet.applyTradein(oldDevice.id, s.newKind, remoteApiEnabled ? canonicalQuote.value ?? undefined : undefined);
  navigateTradeinCheckout(s.newKind);
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
      earn: formatAmount(lowest.todayEarnings),
    }),
    insufficient,
    replaceCta: fmt(t.value.tradein.replaceReplaceCta, { newKind: kindLabel(s.newKind) }),
    keepCta: fmt(t.value.tradein.replaceKeepCta, { newKind: kindLabel(s.newKind) }),
  };
});

function capacityIntent(operation: "replace" | "keep", quote: CanonicalCapacityReplaceQuote): string {
  return [operation, quote.sourceDeviceId ?? "none", quote.targetProductNo, quote.targetProductId,
    quote.targetPriceUsdt, quote.payableUsdt, quote.maxActiveDevices].join("|");
}

function canonicalCapacityKey(
  operation: "replace" | "keep",
  quote: CanonicalCapacityReplaceQuote,
  accountKey: string,
): string {
  const key = acquireAccountCommandKey(
    CAPACITY_COMMAND_TABLE,
    accountKey,
    capacityIntent(operation, quote),
    operation === "replace" ? "e3-capacity" : "e3-capacity-keep",
  );
  capacityCommandKey.value = key;
  return key;
}

function readCapacityPending(accountKey:string):CapacityPending|null {
  const row=readAccountRow<{pending?:unknown}>(CAPACITY_RECOVERY_TABLE,accountKey,true);
  if (!row?.pending) {
    const commands=readAccountRow<{commands?:Record<string,string>}>(CAPACITY_COMMAND_TABLE,accountKey,true)?.commands??{};
    if (Object.keys(commands).length>1) throw new Error('CAPACITY_ORIGINAL_UNRESOLVED');
    const legacy=readPendingKeep();
    return legacy?{...legacy,operation:'keep',quote:null}:null;
  }
  const value=row.pending as Partial<CapacityPending>,q=value.quote;
  if (q===null) {
    const legacy=readPendingKeep();
    if (value.operation!=='keep'||!legacy||legacy.intent!==value.intent||legacy.key!==value.key
        ||legacy.targetProductNo!==value.targetProductNo||legacy.payableUsdt!==value.payableUsdt) throw new Error('CAPACITY_RECOVERY_INVALID');
    return value as CapacityPending;
  }
  if (!['replace','keep'].includes(value.operation??'') || typeof value.key!=='string' || !value.key
      || typeof value.intent!=='string' || !q || !['REPLACE_REQUIRED','CAPACITY_AVAILABLE'].includes(q.decision) || q.decisionSource!=='server'
      || typeof q.targetProductNo!=='string' || !q.targetProductNo || typeof q.targetProductName!=='string'
      || !Number.isSafeInteger(q.targetProductId) || q.targetProductId<1
      || (value.operation==='replace'&&(q.decision!=='REPLACE_REQUIRED'||!Number.isSafeInteger(q.sourceDeviceId)||!q.sourceDeviceId))
      || !Number.isFinite(q.payableUsdt) || q.payableUsdt<0
      || capacityIntent(value.operation as 'replace'|'keep',q)!==value.intent) throw new Error('CAPACITY_RECOVERY_INVALID');
  return value as CapacityPending;
}

function writeCapacityPending(accountKey:string,pending:CapacityPending|null):void {
  if (!writeAccountRow(CAPACITY_RECOVERY_TABLE,accountKey,{pending})
      || readCapacityPending(accountKey)?.key!==(pending?.key)) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  capacityRecovery.value=pending;
  capacityResumeAllowed.value=false;
}

async function runCanonicalCapacityPurchase(operation:'replace'|'keep',requestedQuote:CanonicalCapacityReplaceQuote|null,
    newKind:DeviceKind,allowOriginalResume=false):Promise<void> {
  if (capacityRecoveryBusy.value) return;
  const scope=captureAccountScope(),requestedIntent=requestedQuote?capacityIntent(operation,requestedQuote):null;
  capacityRecoveryBusy.value=true;
  try {
    let original=readCapacityPending(scope.accountKey);
    if (!original) {
      const legacy=readAccountRow<{commands?:Record<string,string>}>(CAPACITY_COMMAND_TABLE,scope.accountKey,true)?.commands??{};
      const entries=Object.entries(legacy);
      if (entries.length) {
        if (!requestedQuote||entries.length!==1 || entries[0]![0]!==requestedIntent) throw new Error('CAPACITY_ORIGINAL_UNRESOLVED');
        original={operation,intent:requestedIntent!,key:entries[0]![1],quote:{...requestedQuote}};
        writeCapacityPending(scope.accountKey,original);
      }
    }
    let receipt:CanonicalTradeinResult|CanonicalCapacityKeepResult|null=null;
    if (original) {
      capacityRecovery.value=original;
      const result=await readPaymentCommand(apiClient,original.operation==='replace'?'capacity-replace':'capacity-keep',original.key);
      if (!isCurrentAccountScope(scope)) return;
      if (result.status==='SUCCEEDED') receipt=original.operation==='replace'
        ?parseCanonicalTradeinResult(result.receipt):parseCanonicalCapacityKeepResult(result.receipt);
      else if (result.status==='REJECTED') {
        if (!releaseAccountCommandKey(CAPACITY_COMMAND_TABLE,scope.accountKey,original.intent,original.key)) throw new Error('CAPACITY_COMMAND_RELEASE_FAILED');
        writeCapacityPending(scope.accountKey,null);toast.warn(recoveryCopy.value.rejected);return;
      } else {
        capacityResumeAllowed.value=result.status==='NOT_SEEN'&&result.canResumeSameKey;
        if (!capacityResumeAllowed.value || !allowOriginalResume) return;
      }
    }
    if (!original&&(!requestedQuote||requestedQuote.decision!==(operation==='keep'?'CAPACITY_AVAILABLE':'REPLACE_REQUIRED')
        ||requestedQuote.targetProductNo!==newKind||requestedQuote.decisionSource!=='server')) throw new Error('CAPACITY_PURCHASE_QUOTE_INVALID');
    const frozen=original?original.quote:{...requestedQuote!};
    const effectiveOperation=original?.operation??operation;
    const intent=original?.intent??capacityIntent(effectiveOperation,frozen!);
    const target=frozen?frozen.targetProductNo:(original as PendingKeepCommand).targetProductNo;
    const payable=frozen?frozen.payableUsdt:(original as PendingKeepCommand).payableUsdt;
    const summary=frozen?frozen.targetProductName:kindLabel(target as DeviceKind);
    if (!receipt) {
      const current=()=>isCurrentAccountScope(scope)&&props.active&&(state.value.kind==='replace'||state.value.kind==='choice'||allowOriginalResume&&state.value.kind==='keep-recovery')
        &&(allowOriginalResume?readCapacityPending(scope.accountKey)?.intent===intent
          :state.value.kind==='replace'&&state.value.newKind===newKind&&!!state.value.canonicalCapacityQuote&&capacityIntent(operation,state.value.canonicalCapacityQuote)===requestedIntent);
      receipt=await executePaymentWithPassword({amount:payable,currency:'USDT',summary},async authorization=>{
        const saved=readCapacityPending(scope.accountKey);
        if (saved&&saved.intent!==intent) throw new Error('CAPACITY_ORIGINAL_UNRESOLVED');
        const key=saved?.key??canonicalCapacityKey(effectiveOperation,frozen!,scope.accountKey);
        original=saved??{operation:effectiveOperation,intent,key,quote:frozen!};
        writeCapacityPending(scope.accountKey,original);
        return effectiveOperation==='replace'
          ?deviceE3Api.capacityReplace(frozen!.sourceDeviceId!,target,key,frozen!,authorization)
          :allowOriginalResume?deviceE3Api.replayCapacityKeep(target,key,payable,authorization)
          :deviceE3Api.capacityKeep(target,key,frozen!,authorization);
      },current);
      if (!receipt) return;
    }
    if (!isCurrentAccountScope(scope)||!original) return;
    if (Math.abs(receipt.walletDebitUsdt-payable)>0.000001
        || (effectiveOperation==='replace'&&(receipt as CanonicalTradeinResult).sourceDeviceId!==frozen!.sourceDeviceId))
      throw new Error('CAPACITY_RECEIPT_QUOTE_MISMATCH');
    if (effectiveOperation==='replace') await submitCanonicalCapacityReplacement(frozen!,target as DeviceKind,
      {key:original.key,receipt:receipt as CanonicalTradeinResult});
    else await submitCanonicalKeepBuy(target as DeviceKind,frozen,{key:original.key,intent:original.intent,receipt:receipt as CanonicalCapacityKeepResult});
  } catch {
    if (isCurrentAccountScope(scope)) toast.warn(recoveryCopy.value.paymentPending);
  } finally { capacityRecoveryBusy.value=false;confirming.value=false; }
}

async function recoverCapacityPurchase(resume=false):Promise<void> {
  try {
    const pending=readCapacityPending(app.accountKey);
    if (!pending) {capacityRecovery.value=null;capacityResumeAllowed.value=false;return;}
    capacityRecoveryUnavailable.value=false;
    await runCanonicalCapacityPurchase(pending.operation,pending.quote,(pending.quote?pending.quote.targetProductNo:pending.targetProductNo) as DeviceKind,resume);
  } catch { capacityRecoveryUnavailable.value=true; }
}

async function submitCanonicalCapacityReplacement(
  quote: CanonicalCapacityReplaceQuote,
  newKind: DeviceKind,
  recovered?:{key:string;receipt:CanonicalTradeinResult},
): Promise<void> {
  if (!recovered) return runCanonicalCapacityPurchase('replace',quote,newKind);
  const requestScope = captureAccountScope();
  const intent = capacityIntent("replace", quote);
  let commandKey = "";
  const requireCurrentAccount = () => {
    if (!isCurrentAccountScope(requestScope)) throw new Error("ACCOUNT_SCOPE_CHANGED");
  };
  try {
    if (quote.decision !== "REPLACE_REQUIRED" || quote.sourceDeviceId == null
        || quote.targetProductNo !== newKind || quote.decisionSource !== "server") {
      throw new Error("CAPACITY_REPLACEMENT_QUOTE_INVALID");
    }
    commandKey = recovered.key;
    const receipt = recovered.receipt;
    await completeVerifiedMutation({
      submit: async () => {
        requireCurrentAccount();
        return receipt;
      },
      readback: async (submitted) => {
        requireCurrentAccount();
        const persisted = (await orderApi.list()).orders
          .find((order) => order.orderNo === submitted.orderNo);
        requireCurrentAccount();
        return persisted;
      },
      verifyOrder(submitted, persisted) {
        requireCurrentAccount();
            if (!persisted || persisted.productNo!==quote.targetProductNo || persisted.sourceDeviceId !== submitted.sourceDeviceId
            || persisted.targetDeviceId !== submitted.targetDeviceId
            || persisted.tradeinNo !== submitted.tradeinNo
            || persisted.canonicalStatus !== "activated"
            || persisted.paymentStatus.toUpperCase() !== "PAID"
            || persisted.orderStatus.toUpperCase() !== "COMPLETED"
            || persisted.activationStatus.toUpperCase() !== "ACTIVATED"
            || typeof persisted.amountUsdt !== "number"
            || Math.abs(persisted.amountUsdt - submitted.walletDebitUsdt) > 0.000001
            || Math.abs(persisted.discountUsdt - submitted.discountUsdt) > 0.000001) {
          throw new Error("CAPACITY_REPLACEMENT_READBACK_MISMATCH");
        }
      },
      refreshOrders: async () => {
        requireCurrentAccount();
        await orders.refreshRemote();
        requireCurrentAccount();
      },
      // refreshRemoteFleet 自吞不 reject(resilience 门);适配层升回 throw 保住验证链语义。
      refreshFleet: async () => {
        requireCurrentAccount();
        if (!(await app.refreshRemoteFleet())) throw new Error("E3_FLEET_REFRESH_UNAVAILABLE");
        requireCurrentAccount();
      },
      verifyFleet(submitted) {
        requireCurrentAccount();
        const target = app.devices.find((device) => device.id === String(submitted.targetDeviceId));
        const source = app.devices.find((device) => device.id === String(submitted.sourceDeviceId));
        if (!target || target.activatedAt == null || (source && source.activatedAt != null)) {
          throw new Error("CAPACITY_REPLACEMENT_FLEET_READBACK_MISMATCH");
        }
      },
      commit() {
        requireCurrentAccount();
        if (!releaseAccountCommandKey(CAPACITY_COMMAND_TABLE, requestScope.accountKey, intent, commandKey)) {
          throw new Error("CAPACITY_COMMAND_RELEASE_FAILED");
        }
        capacityCommandKey.value = null;
        writeCapacityPending(requestScope.accountKey,null);
        toast.success(fmt(t.value.tradein.replaceSuccessToast, {
          newKind: kindLabel(newKind),
          oldKind: quote.sourceDeviceName ?? t.value.tradein.errReplaceUnavailable,
        }));
        hide();
        goDevices();
      },
    });
  } catch {
    if (!isCurrentAccountScope(requestScope)) return;
    toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    confirming.value = false;
  }
}

function onReplace() {
  const s = state.value;
  if (s.kind !== "replace" || confirming.value) return;
  if (remoteApiEnabled&&(capacityRecovery.value||capacityRecoveryUnavailable.value)) { void recoverCapacityPurchase(false);return; }
  if (replaceView.value?.insufficient) return;
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
  if ((app.remoteSlotsUsed ?? (app.activeSlotCount + reservedSlots.value)) - 1 >= app.slotCap) {
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
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: formatAmount(s.newPrice) }));
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

async function submitCanonicalKeepBuy(
  newKind: DeviceKind,
  quote: CanonicalCapacityReplaceQuote | null,
  recovered?:{key:string;intent:string;receipt:CanonicalCapacityKeepResult},
): Promise<void> {
  if (!recovered) return runCanonicalCapacityPurchase('keep',quote,newKind);
  const requestScope = captureAccountScope();
  let intent = "";
  let key = "";
  const requireCurrentAccount = () => {
    if (!isCurrentAccountScope(requestScope)) throw new Error("ACCOUNT_SCOPE_CHANGED");
  };
  try {
    intent = recovered.intent;
    key = recovered.key;
    const receipt = recovered.receipt;
    await completeVerifiedMutation({
      submit: async () => {
        requireCurrentAccount();
        return receipt;
      },
      readback: async (submitted) => {
        requireCurrentAccount();
        const persisted = (await orderApi.list()).orders
          .find((order) => order.orderNo === submitted.orderNo);
        requireCurrentAccount();
        return persisted;
      },
      verifyOrder(submitted, persisted) {
        requireCurrentAccount();
        if (!persisted || persisted.productNo !== newKind
            || persisted.orderType.toUpperCase() !== "CAPACITY_KEEP"
            || persisted.canonicalStatus !== "activated"
            || persisted.paymentStatus.toUpperCase() !== "PAID"
            || persisted.orderStatus.toUpperCase() !== "COMPLETED"
            || persisted.activationStatus.toUpperCase() !== "ACTIVATED"
            || persisted.targetDeviceId !== submitted.targetDeviceId
            || !persisted.targetDeviceInstanceNo
            || typeof persisted.amountUsdt !== "number"
            || Math.abs(persisted.amountUsdt - submitted.walletDebitUsdt) > 0.000001
            || Math.abs(persisted.discountUsdt) > 0.000001) {
          throw new Error("CAPACITY_KEEP_ORDER_READBACK_MISMATCH");
        }
      },
      refreshOrders: async () => {
        requireCurrentAccount();
        await orders.refreshRemote();
        requireCurrentAccount();
      },
      refreshFleet: async () => {
        requireCurrentAccount();
        if (!(await app.refreshRemoteFleet())) throw new Error("E3_FLEET_REFRESH_UNAVAILABLE");
        requireCurrentAccount();
      },
      verifyFleet(submitted) {
        requireCurrentAccount();
        const target = app.devices.find((device) => device.id === String(submitted.targetDeviceId));
        if (!target || target.activatedAt == null || target.activationUnconfirmed) {
          throw new Error("CAPACITY_KEEP_FLEET_READBACK_MISMATCH");
        }
      },
      commit() {
        requireCurrentAccount();
        if (!releaseAccountCommandKey(CAPACITY_COMMAND_TABLE, requestScope.accountKey, intent, key)) {
          throw new Error("CAPACITY_COMMAND_RELEASE_FAILED");
        }
        capacityCommandKey.value = null;
        writeCapacityPending(requestScope.accountKey,null);
        toast.success(fmt(t.value.tradein.keepBuySuccessToast, { newKind: kindLabel(newKind) }));
        hide();
        goDevices();
      },
    });
  } catch {
    if (!isCurrentAccountScope(requestScope)) return;
    refreshKeepRecovery(newKind);
    toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    confirming.value = false;
  }
}

function onKeepBuy() {
  const s = state.value;
  if (s.kind !== "replace" || confirming.value) return;
  if (remoteApiEnabled&&(capacityRecovery.value||capacityRecoveryUnavailable.value)) { void recoverCapacityPurchase(false);return; }
  if (remoteApiEnabled) {
    refreshKeepRecovery(s.newKind);
    if (keepRecovery.value) { onRecoverKeep(); return; }
    if (keepRecoveryError.value) { toast.warn(t.value.tradein.errPleaseRetry); return; }
    if (replaceView.value?.insufficient) return;
    if (!s.canonicalCapacityQuote) {
      toast.warn(t.value.tradein.errPleaseRetry);
      return;
    }
    if (s.canonicalCapacityQuote.decision !== "CAPACITY_AVAILABLE") {
      toast.warn(t.value.tradein.errReplaceSlotConflict);
      return;
    }
    confirming.value = true;
    void submitCanonicalKeepBuy(s.newKind, s.canonicalCapacityQuote);
    return;
  }
  if (replaceView.value?.insufficient) return;
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
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: formatAmount(s.newPrice) }));
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
  if ((app.remoteSlotsUsed ?? (app.activeSlotCount + reservedSlots.value)) - 1 >= app.slotCap) {
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
    if (paid === "insufficient") toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: formatAmount(s.newPrice) }));
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
useDialogA11y(computed(() => props.active && state.value.kind !== "none"
  && (state.value.kind !== "tradein" || !!tradeinView.value || purchaseRecovery.value !== "none")), ".tis-root", hide);


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
.tis-panel { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0; box-shadow: var(--nx-glass-edge);
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  box-sizing: border-box;
  max-height: calc(100% - var(--nx-overlay-top));
  overflow-y: auto;


  background: var(--nx-glass-fill);
  border: none;
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
  font-size: var(--ui-type-hero-title);
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.3;
}
.tis-subtitle {
  display: block;
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-list-subtitle);
  color: var(--v5-ink);
}
.tis-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tis-row-label {
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-button);
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
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-list-subtitle);
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
  font-size: var(--ui-type-list-subtitle);
  color: var(--v5-ink-3);
  margin-top: 4px;
  line-height: 1.625;
}
</style>
