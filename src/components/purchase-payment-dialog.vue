<template>
  <view v-if="showResume && active && !s.open && (pending.length || showHistory && records.length)" class="purchase-payment-resume" role="status">
    <view v-for="row in showHistory ? records : pending" :key="row.commandKey" class="purchase-payment__row"><text>{{ row.summary }} · {{ row.lastStatus === 'MANUAL_REVIEW' ? copy.review : row.lastStatus === 'EXPIRED' ? copy.ended : row.businessDelivered ? copy.delivered : copy.resume }}</text><NxButton :label="copy.view" variant="text" @click="payment.resume(row)" /></view>
  </view>

  <!-- Step sheet: method → network / bank confirmation. -->
  <view v-if="active && s.open && !s.pending" class="pp-mask nx-sheet-fade-in" @click.self="payment.close">
    <view id="pp-sheet" class="pp-sheet nx-sheet-slide-up" role="dialog" aria-modal="true" :aria-label="sheetTitle">
      <view class="pp-head">
        <view v-if="s.step !== 'methods'" class="pp-circ nx-frosted-button" role="button" tabindex="0" :aria-label="copy.backToMethods" @click="payment.back" @keydown.enter.prevent="payment.back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </view>
        <view class="pp-head__text">
          <text class="pp-title" role="heading">{{ sheetTitle }}</text>
          <view v-if="s.step === 'methods' && deadlineLeft !== null" class="pp-cd" :class="{ 'is-urgent': deadlineLeft < URGENT_MS }">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <text>{{ fill(copy.closesIn, { t: clock(deadlineLeft) }) }}</text>
          </view>
        </view>
        <view class="pp-circ nx-frosted-button" role="button" tabindex="0" :aria-label="copy.close" @click="payment.close" @keydown.enter.prevent="payment.close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <text v-if="s.step !== 'methods'" class="pp-steps">{{ fill(s.step === 'bank' ? copy.bankSteps : copy.networkSteps, { name: s.summary }) }}</text>
      <view class="pp-body">
        <template v-if="s.step === 'methods'">
          <view class="pp-prod">
            <image v-if="s.image" class="pp-prod__img" :src="s.image" mode="aspectFit" aria-hidden="true" />
            <view class="pp-prod__text"><text class="pp-prod__name">{{ s.summary }}</text><text v-if="s.orderNo" class="pp-prod__meta">{{ copy.orderNo }} <text class="pp-mono">{{ s.orderNo }}</text></text></view>
            <CheckoutAmount class="pp-prod__amt" :value="s.amount" currency="USD" />
          </view>
          <text class="pp-label">{{ copy.methodLabel }}</text>
          <view class="pp-opts" role="radiogroup" :aria-label="copy.methodLabel" @keydown.down.prevent="moveFocus($event, 1)" @keydown.right.prevent="moveFocus($event, 1)" @keydown.up.prevent="moveFocus($event, -1)" @keydown.left.prevent="moveFocus($event, -1)">
            <view class="pp-opt" :class="{ on: s.method === 'WALLET' }" role="radio" :tabindex="s.method === 'WALLET' ? 0 : -1" :aria-checked="s.method === 'WALLET'" @click="payment.choose('WALLET')" @keydown.enter.prevent="payment.choose('WALLET')">
              <view class="pp-opt__row">
                <view class="pp-opt__ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg></view>
                <view class="pp-opt__tx"><text class="pp-opt__t">{{ copy.wallet }}</text><text class="pp-opt__h">{{ balanceKnown ? fill(copy.walletAvailable, { amt: amount(app.user.usdtBalance) }) : copy.walletUnavailable }}</text></view>
                <view class="pp-radio" aria-hidden="true" />
              </view>
              <view v-if="shortfall > 0" class="pp-short" @click.stop>
                <text class="pp-short__t">{{ fill(copy.short, { amt: amount(shortfall) }) }}</text>
                <NxButton :label="copy.topup" variant="brand" size="small" @click="payment.topup" />
              </view>
            </view>
            <view class="pp-opt" :class="{ off: !payment.available('HDPAY_BANK') }" role="radio" :tabindex="s.method === 'HDPAY_BANK' ? 0 : -1" aria-checked="false" :aria-disabled="!payment.available('HDPAY_BANK')" @click="chooseExternal('HDPAY_BANK')" @keydown.enter.prevent="chooseExternal('HDPAY_BANK')">
              <view class="pp-opt__row">
                <view class="pp-opt__ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg></view>
                <view class="pp-opt__tx"><text class="pp-opt__t">{{ copy.bank }}</text><text class="pp-opt__h">{{ payment.available('HDPAY_BANK') ? copy.bankHint : copy.unavailable }}</text></view>
                <view class="pp-radio" aria-hidden="true" />
              </view>
            </view>
            <view class="pp-opt" :class="{ off: !usdtAvailable }" role="radio" :tabindex="s.method !== 'WALLET' && s.method !== 'HDPAY_BANK' ? 0 : -1" aria-checked="false" :aria-disabled="!usdtAvailable" @click="chooseExternal('USDT')" @keydown.enter.prevent="chooseExternal('USDT')">
              <view class="pp-opt__row">
                <view class="pp-opt__ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 8h8" /><path d="M12 8v9" /><path d="M7.5 12c0 1 2 1.6 4.5 1.6s4.5-.6 4.5-1.6" /></svg></view>
                <view class="pp-opt__tx"><text class="pp-opt__t">{{ copy.usdt }}</text><text class="pp-opt__h">{{ usdtAvailable ? copy.usdtHint : copy.unavailable }}</text></view>
                <view class="pp-radio" aria-hidden="true" />
              </view>
            </view>
          </view>
        </template>

        <template v-else-if="s.step === 'network'">
          <text class="pp-label">{{ copy.networkLabel }}</text>
          <view class="pp-tabs" role="radiogroup" :aria-label="copy.networkLabel" @keydown.right.prevent="moveFocus($event, 1, true)" @keydown.down.prevent="moveFocus($event, 1, true)" @keydown.left.prevent="moveFocus($event, -1, true)" @keydown.up.prevent="moveFocus($event, -1, true)">
            <view v-for="tab in networks" :key="tab.id" class="pp-tab" :class="{ on: s.method === tab.id, off: !payment.available(tab.id) }" role="radio" :tabindex="s.method === tab.id ? 0 : -1"
              :aria-checked="s.method === tab.id" :aria-disabled="!payment.available(tab.id)" @click="pickNetwork(tab.id)" @keydown.enter.prevent="pickNetwork(tab.id)">
              <text class="pp-tab__a">{{ tab.title }}</text><text class="pp-tab__b">{{ tab.chain }}</text>
              <text v-if="!payment.available(tab.id)" class="pp-soon">{{ copy.soon }}</text>
            </view>
          </view>
          <view class="pp-fees">
            <template v-if="rounded">
              <view class="pp-kv"><text class="pp-kv__k">{{ copy.businessAmount }}</text><text class="pp-kv__v">{{ s.quote?.businessAmountUsdt }}</text></view>
              <view class="pp-kv"><text class="pp-kv__k">{{ copy.roundingAdjustment }}</text><text class="pp-kv__v">{{ s.quote?.roundingAdjustmentUsdt }}</text></view>
            </template>
            <view v-else class="pp-kv"><text class="pp-kv__k">{{ copy.subtotal }}</text><text class="pp-kv__v">{{ s.quote ? amount(s.quote.subtotalUsdt) : '—' }}</text></view>
            <view class="pp-kv"><text class="pp-kv__k">{{ copy.channelFee }}</text><text class="pp-kv__v">{{ s.quote ? amount(s.quote.channelFeeUsdt) : '—' }}</text></view>
            <view class="pp-kv"><text class="pp-kv__k">{{ copy.networkFee }}</text><text class="pp-kv__v">{{ s.quote ? amount(s.quote.networkConfirmFeeUsdt) : '—' }}</text></view>
          </view>
        </template>

        <template v-else>
          <text class="pp-label">{{ copy.payable }}</text>
          <text class="pp-vnd">{{ vnd(s.quote?.amountVnd ?? null) }}<text class="pp-vnd__u">₫</text></text>
          <text v-if="s.quote?.fxRateVndPerUsdt" class="pp-fx">{{ copy.fx }} 1 USDT = {{ rate(s.quote.fxRateVndPerUsdt) }} ₫</text>
          <view class="pp-fees">
            <view class="pp-kv"><text class="pp-kv__k">{{ copy.subtotal }}</text><text class="pp-kv__v">{{ s.quote ? amount(s.quote.subtotalUsdt) : '—' }}</text></view>
            <view class="pp-kv"><text class="pp-kv__k">{{ copy.channelFee }}</text><text class="pp-kv__v">{{ s.quote ? amount(s.quote.channelFeeUsdt) : '—' }}</text></view>
          </view>
        </template>
      </view>

      <view class="pp-foot">
        <view class="pp-total" :class="{ 'is-ruled': s.step === 'methods' }">
          <text class="pp-total__k">{{ s.step === 'bank' ? copy.equivalent : copy.total }}</text>
          <CheckoutAmount class="pp-total__v" :value="s.step === 'methods' ? s.amount : s.quote?.totalUsdt ?? null" currency="USDT" />
        </view>
        <template v-if="s.step !== 'methods'">
          <text class="pp-note">{{ s.step === 'bank' ? copy.bankNote : s.method === 'CREGIS_USDT_ERC20' ? copy.gasErc20 : copy.gasBep20 }}</text>
          <view class="pp-auto" role="status"><view class="pp-auto__dot" :class="{ 'is-retry': s.retrying }" aria-hidden="true" /><text>{{ s.retrying ? copy.retrying : s.quote && quoteLeft !== null ? fill(copy.quoteValid, { t: clock(quoteLeft) }) : copy.loadingFees }}</text></view>
        </template>
        <NxButton class="pp-cta" :label="s.step === 'methods' ? copy.confirm : copy.go" variant="primary" :busy="s.busy" :disabled="s.step === 'methods' ? !walletEnough : !s.quote || s.loading" @click="s.step === 'methods' ? payment.confirm() : payment.proceed()" />
      </view>
    </view>
  </view>

  <!-- Payment page: USDT address, bank in progress, or funds received. -->
  <view v-if="active && s.open && s.pending" id="pp-page" class="pp-page" role="dialog" aria-modal="true" :aria-label="pageTitle" :style="{ paddingTop: statusBar + 'px' }">
    <DeviceStatusBar />
    <view class="pp-nav">
      <view class="pp-circ nx-frosted-button" role="button" tabindex="0" :aria-label="copy.back" @click="leavePage" @keydown.enter.prevent="leavePage">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <text class="pp-nav__t" role="heading">{{ pageTitle }}</text>
      <view class="pp-nav__gap" aria-hidden="true" />
    </view>

    <view v-if="received" class="pp-scroll pp-done">
      <view class="pp-done__hero" role="status">
        <view class="pp-done__badge" aria-hidden="true"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg></view>
        <text class="pp-done__title">{{ copy.received }}</text>
        <text class="pp-done__desc">{{ copy.provisioning }}</text>
      </view>
      <view class="pp-track" role="list" :aria-label="copy.provisionTrack">
        <view class="pp-step" role="listitem"><view class="pp-seg is-done" /><view class="pp-dot is-done"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></view><text class="pp-step__l">{{ copy.trackPaid }}</text></view>
        <view class="pp-step" role="listitem"><view class="pp-seg" /><view class="pp-dot is-current" /><text class="pp-step__l">{{ copy.trackProvision }}</text></view>
        <!-- Not reached yet: dot only (DS-30). -->
        <view class="pp-step" role="listitem" aria-hidden="true"><view class="pp-dot" /></view>
      </view>
      <view class="pp-receipt">
        <view class="pp-kv"><text class="pp-kv__k">{{ copy.paidAmount }}</text><CheckoutAmount class="pp-receipt__amt" :value="s.intent?.totalUsdt ?? null" currency="USDT" /></view>
        <view class="pp-kv"><text class="pp-kv__k">{{ copy.paidMethod }}</text><text class="pp-kv__v">{{ methodName }}</text></view>
        <view class="pp-kv"><text class="pp-kv__k">{{ copy.product }}</text><text class="pp-kv__v">{{ s.summary }}</text></view>
        <view v-if="s.orderNo" class="pp-kv"><text class="pp-kv__k">{{ copy.orderNo }}</text><text class="pp-kv__v pp-mono">{{ s.orderNo }}</text></view>
      </view>
      <view class="pp-done__foot">
        <text class="pp-note">{{ copy.leaveOk }}</text>
        <NxButton :label="copy.viewOrder" variant="secondary" @click="payment.openOrder" />
      </view>
    </view>

    <view v-else class="pp-scroll pp-pay" :class="{ 'has-bar': isBank }">
      <view class="pp-card pp-hero">
        <text class="pp-hero__lab">{{ copy.payable }}</text>
        <view class="pp-hero__row">
          <text v-if="isBank" class="pp-hero__amt">{{ vnd(fees?.amountVnd ?? null) }}<text class="pp-hero__u">₫</text></text>
          <CheckoutAmount v-else class="pp-hero__amt" :value="fees?.totalUsdt ?? null" currency="USDT" />
          <view class="pp-copy nx-frosted-button" role="button" tabindex="0" :aria-label="copy.copyAmount" @click="copyAmount" @keydown.enter.prevent="copyAmount">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          </view>
        </view>
        <view v-if="payLeft !== null" class="pp-cd" :class="{ 'is-urgent': urgent }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <text>{{ fill(urgent ? (isBank ? copy.urgentBank : copy.urgent) : (isBank ? copy.payWithinBank : copy.payWithin), { t: clock(payLeft) }) }}</text>
        </view>
        <text class="pp-hero__meta">{{ s.summary }}<template v-if="s.orderNo"> · {{ copy.orderNo }} <text class="pp-mono">{{ s.orderNo }}</text></template></text>
      </view>

      <view class="pp-card">
        <view class="pp-wait" :class="{ 'is-alone': isBank }" role="status" :style="{ '--pp-st': waitTone }">
          <view class="pp-wait__spin" aria-hidden="true" />
          <text class="pp-wait__t">{{ waitTitle }}<template v-if="urgent && ready"> · <text class="pp-wait__em">{{ copy.urgentTag }}</text></template></text>
          <text v-if="ready && !s.error" class="pp-wait__s">{{ urgent ? copy.urgentHint : isBank ? copy.waitingBank : copy.waitingUsdt }}</text>
        </view>
        <template v-if="!isBank">
          <view class="pp-card__top"><text class="pp-card__t">{{ copy.address }}</text><text class="pp-tag">{{ networkName }}</text></view>
          <view v-if="qrImage" class="pp-qr"><image class="pp-qr__img" :src="qrImage" mode="aspectFit" :aria-label="copy.addressQr" /></view>
          <text v-if="ready" class="pp-cap">{{ copy.scan }}</text>
          <view v-if="s.intent?.address" class="pp-addr">
            <text class="pp-addr__t" selectable>{{ s.intent.address }}</text>
            <view class="pp-copy nx-frosted-button" role="button" tabindex="0" :aria-label="copy.copyAddress" @click="copyAddress" @keydown.enter.prevent="copyAddress">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
            </view>
          </view>
        </template>
      </view>

      <view v-if="fees" class="pp-card">
        <view class="pp-kv"><text class="pp-kv__k">{{ copy.subtotal }}</text><text class="pp-kv__v">{{ amount(fees.subtotalUsdt) }}</text></view>
        <view class="pp-kv"><text class="pp-kv__k">{{ copy.channelFee }}</text><text class="pp-kv__v">{{ amount(fees.channelFeeUsdt) }}</text></view>
        <view v-if="isBank && fees.fxRateVndPerUsdt" class="pp-kv"><text class="pp-kv__k">{{ copy.fx }}</text><text class="pp-kv__v">1 USDT = {{ rate(fees.fxRateVndPerUsdt) }} ₫</text></view>
        <view v-else-if="!isBank" class="pp-kv"><text class="pp-kv__k">{{ copy.networkFee }}</text><text class="pp-kv__v">{{ amount(fees.networkConfirmFeeUsdt) }}</text></view>
        <view class="pp-div" />
        <view class="pp-kv"><text class="pp-kv__k">{{ isBank ? copy.equivalent : copy.total }}</text><text class="pp-kv__v">{{ amount(fees.totalUsdt) }} USDT</text></view>
      </view>

      <view class="pp-warn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        <text>{{ isBank ? copy.warnBank : s.intent?.paymentMethod === 'CREGIS_USDT_ERC20' ? copy.warnErc20 : copy.warnBep20 }}</text>
      </view>
    </view>
    <!-- The page's main action sits in the thumb zone (DS-30). -->
    <view v-if="!received && isBank" class="pp-bar">
      <NxButton class="pp-reopen" :label="copy.reopen" variant="primary" :disabled="!ready" @click="payment.openCashier" />
    </view>
  </view>

  <!-- Bank payment page opened inside the App under a UVEL bar. -->
  <view v-if="active && s.open && s.cashier && cashierUrl" class="pp-cashier">
    <DeviceStatusBar />
    <view class="pp-cashier__bar" :style="{ paddingTop: statusBar + 'px' }">
      <view class="pp-cashier__row">
        <view class="pp-circ nx-frosted-button" role="button" tabindex="0" :aria-label="copy.closeCashier" @click="payment.closeCashier" @keydown.enter.prevent="payment.closeCashier">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
        <view class="pp-cashier__mid">
          <text class="pp-cashier__t">{{ copy.cashierTitle }}</text>
          <view v-if="payLeft !== null" class="pp-cashier__cd" :class="{ 'is-urgent': urgent }">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <text>{{ fill(copy.cashierCloses, { t: clock(payLeft) }) }}</text>
          </view>
        </view>
        <view class="pp-nav__gap" aria-hidden="true" />
      </view>
      <view class="pp-cashier__lock">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ copy.secure }}</text>
      </view>
    </view>
    <view class="pp-cashier__frame">
      <!-- #ifdef H5 -->
      <iframe :src="cashierUrl" :title="copy.bankPage" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
      <!-- #endif -->
    </view>
    <view class="pp-cashier__foot" :style="{ paddingBottom: cashierFootPad + 'px' }"><view class="pp-pulse" aria-hidden="true" /><text>{{ copy.autoReturn }}</text></view>
  </view>

  <NxNoticeDialog v-if="active && s.open && notice" :open="true" :title="notice.title" :body="notice.body" :primary="notice.primary" :secondary="notice.secondary"
    :icon="notice.icon" :tone="notice.tone" :busy="s.busy" @primary="notice.onPrimary" @secondary="notice.onSecondary" />
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onShow, onHide, useVisibleInterval } from '@/composables/use-tab-page-lifecycle';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import NxButton from '@/components/ui/nx-button.vue';
import NxNoticeDialog from '@/components/ui/nx-notice-dialog.vue';
import CheckoutAmount from '@/components/checkout/CheckoutAmount.vue';
import DeviceStatusBar from '@/components/device/device-status-bar.vue';
import { usePurchasePayment } from '@/store/purchase-payment';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { purchasePaymentCopy, fillCopy as fill } from '@/lib/purchase-payment-copy';
import { formatGroupedAmount } from '@/lib/amount-display';
import { hostedPaymentUrlPattern, validateHostedPaymentUrl } from '@/lib/hosted-payment';
import { h5DevicePreviewStatusBarHeight } from '@/lib/device-preview';
import { toast } from '@/store/ui';
import type { ExternalPaymentMethod } from '@/api/purchase-payment-api';
import qrcode from 'qrcode-generator';
const payment = usePurchasePayment(), s = payment.state, app = useApp(), locale = useLocaleStore();
// The order detail shows its own payment state in the hero, so it hides the floating bar.
withDefaults(defineProps<{ showHistory?: boolean; showResume?: boolean }>(), { showHistory: false, showResume: true });
const URGENT_MS = 5 * 60000;
const active = ref(true);
const copy = computed(() => purchasePaymentCopy(locale.code));
const pending = computed(() => { app.accountKey; s.revision; return payment.pending(); });
// A delivered purchase the caller already confirmed needs no follow-up, so it leaves the bar.
const records = computed(() => { app.accountKey; s.revision; return payment.records().filter(row => !row.validated); });
const statusBar = (() => { try { return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight(); } catch { return h5DevicePreviewStatusBarHeight(); } })();
const cashierFootPad = (() => { try { return Math.max(uni.getSystemInfoSync().safeAreaInsets?.bottom ?? 0, 30); } catch { return 30; } })();

const balanceKnown = computed(() => Number.isFinite(app.user.usdtBalance) && app.user.usdtBalance >= 0 && app.remoteFleetHasSnapshot);
const walletEnough = computed(() => Number(s.amount) === 0 || balanceKnown.value && app.user.usdtBalance >= Number(s.amount));
const shortfall = computed(() => balanceKnown.value ? Math.max(0, Number(s.amount) - app.user.usdtBalance) : 0);
const usdtAvailable = computed(() => payment.available('CREGIS_USDT_BSC') || payment.available('CREGIS_USDT_ERC20'));
const networks = computed(() => [
  { id: 'CREGIS_USDT_BSC' as const, title: copy.value.bep20, chain: copy.value.bep20Chain },
  { id: 'CREGIS_USDT_ERC20' as const, title: copy.value.erc20, chain: copy.value.erc20Chain },
]);
const sheetTitle = computed(() => s.step === 'network' ? copy.value.networkTitle : s.step === 'bank' ? copy.value.bankTitle : copy.value.title);
const rounded = computed(() => !!s.quote?.roundingAdjustmentUsdt && Number(s.quote.roundingAdjustmentUsdt) !== 0);
const fees = computed(() => s.intent ?? s.quote);
const isBank = computed(() => (s.intent?.paymentMethod ?? s.pending?.paymentMethod) === 'HDPAY_BANK');
const received = computed(() => s.intent?.status === 'FUNDS_CONFIRMED');
const ready = computed(() => s.intent?.status === 'AWAITING_PAYMENT' && (isBank.value ? !!s.intent.paymentUrl : !!s.intent.address));
const networkName = computed(() => s.intent?.paymentMethod === 'CREGIS_USDT_ERC20' ? copy.value.erc20 : copy.value.bep20);
const methodName = computed(() => isBank.value ? copy.value.bank : networkName.value);
const pageTitle = computed(() => received.value ? copy.value.resultTitle : isBank.value ? copy.value.bankTitle : copy.value.usdtPage);
const cashierUrl = computed(() => s.intent?.paymentUrl ? validateHostedPaymentUrl(s.intent.paymentUrl) ?? '' : '');
const qrImage = computed(() => { if (!s.intent?.address || !ready.value) return ''; const qr = qrcode(0, 'M'); qr.addData(s.intent.address); qr.make(); return qr.createDataURL(6, 1); });

const now = ref(Date.now());
useVisibleInterval(() => { if (active.value && s.open) now.value = Date.now(); }, 1000);
const deadlineLeft = computed(() => s.deadlineAt === null ? null : Math.max(0, s.deadlineAt - now.value));
const quoteLeft = computed(() => s.quote ? Math.max(0, Date.parse(s.quote.expiresAt) - now.value) : null);
// The payment page counts to whichever closes first: the intent or the order.
const payLeft = computed(() => {
  const ends = [s.intent ? Date.parse(s.intent.expiresAt) : NaN, s.deadlineAt ?? NaN].filter(Number.isFinite);
  return ends.length ? Math.max(0, Math.min(...ends) - now.value) : null;
});
const urgent = computed(() => payLeft.value !== null && payLeft.value < URGENT_MS);
const waitTone = computed(() => s.error ? 'var(--v5-warning)' : urgent.value && ready.value ? 'var(--v5-danger)' : 'var(--v5-brand)');
const waitTitle = computed(() => s.error ? copy.value.offline : ready.value ? copy.value.waiting : copy.value.creating);

type Notice = { title: string; body: string; primary: string; secondary?: string; icon: 'alert' | 'clock' | 'shield' | 'failed' | 'info'; tone: 'warning' | 'danger' | 'brand' | 'neutral'; onPrimary: () => void; onSecondary: () => void };
const dismiss = () => payment.notify('');
const notice = computed<Notice | null>(() => {
  const c = copy.value, order = s.kind === 'ORDER_PAY' && !!s.orderNo;
  const toOrder = { secondary: order ? c.viewOrder : c.close, onSecondary: order ? payment.openOrder : payment.close };
  switch (s.notice) {
    case 'reminder': return s.method === 'HDPAY_BANK'
      ? { icon: 'shield', tone: 'brand', title: c.remindBankTitle, body: fill(c.remindBank, { amt: vnd(s.quote?.amountVnd ?? null) }), primary: c.remindOk, secondary: c.back, onPrimary: payment.confirm, onSecondary: dismiss }
      : { icon: 'shield', tone: 'brand', title: c.remindUsdtTitle, body: fill(s.method === 'CREGIS_USDT_ERC20' ? c.remindErc20 : c.remindBep20, { amt: s.quote ? amount(s.quote.totalUsdt) : '—' }), primary: c.remindOk, secondary: c.back, onPrimary: payment.confirm, onSecondary: dismiss };
    case 'timeShort': return { icon: 'clock', tone: 'warning', title: c.timeShortTitle, body: fill(c.timeShort, { n: Math.max(1, Math.ceil((deadlineLeft.value ?? 0) / 60000)) }), primary: c.useWallet, secondary: c.continueAnyway, onPrimary: () => { dismiss(); payment.back(); }, onSecondary: () => payment.notify('reminder') };
    case 'timeout': return order
      ? { icon: 'clock', tone: 'neutral', title: c.timeoutTitle, body: c.timeout, primary: c.reorder, secondary: c.viewOrder, onPrimary: payment.reorder, onSecondary: payment.openOrder }
      : { icon: 'clock', tone: 'neutral', title: c.timeoutOtherTitle, body: c.timeoutOther, primary: c.ok, onPrimary: payment.close, onSecondary: payment.close };
    case 'bankFailed': return { icon: 'failed', tone: 'danger', title: c.bankFailedTitle, body: c.bankFailed, primary: c.retryPay, secondary: c.switchMethod, onPrimary: () => payment.restart('bank'), onSecondary: () => payment.restart('methods') };
    case 'review': return { icon: 'info', tone: 'warning', title: c.reviewTitle, body: s.intent?.reason === 'PAYMENT_AMOUNT_MISMATCH' ? c.reviewMismatch : c.reviewOther, primary: c.support, onPrimary: payment.support, ...toOrder };
    case 'late': return { icon: 'info', tone: 'warning', title: c.lateTitle, body: c.late, primary: c.support, onPrimary: payment.support, ...toOrder };
    case 'delivery': return { icon: 'alert', tone: 'warning', title: c.deliveryTitle, body: c.delivery, primary: c.support, onPrimary: payment.support, ...toOrder };
    case 'leave': return { icon: 'alert', tone: 'warning', title: c.leaveTitle, body: c.leaveBody, primary: c.continuePay, secondary: c.leave, onPrimary: dismiss, onSecondary: payment.close };
    case 'changed': return { icon: 'info', tone: 'warning', title: c.changedTitle, body: c.changed, primary: order ? c.viewOrder : c.ok, onPrimary: order ? payment.openOrder : payment.close, ...(order ? { secondary: c.close, onSecondary: payment.close } : { onSecondary: payment.close }) };
    default: return null;
  }
});

function amount(value: string | number) { return formatGroupedAmount(value); }
function vnd(value: string | null) { return value ? BigInt(value).toLocaleString(locale.code === 'vi' ? 'vi-VN' : 'en-US') : '—'; }
function rate(value: string) { return Number(value).toLocaleString(locale.code === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }); }
function clock(ms: number) { const total = Math.ceil(ms / 1000); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function chooseExternal(option: 'HDPAY_BANK' | 'USDT') { if (option === 'HDPAY_BANK' ? payment.available('HDPAY_BANK') : usdtAvailable.value) payment.choose(option); }
function pickNetwork(method: ExternalPaymentMethod) { if (payment.available(method) && s.method !== method) void payment.select(method); }
function copyText(data: string, message: string) { uni.setClipboardData({ data, showToast: false, success: () => toast.success(message) }); }
function copyAddress() { if (s.intent?.address) copyText(s.intent.address, copy.value.copied); }
function copyAmount() { const value = isBank.value ? fees.value?.amountVnd : fees.value?.totalUsdt; if (value) copyText(value, copy.value.amountCopied); }
/** Arrow keys move through a radio group; in the network tabs they also choose the network. */
function moveFocus(event: KeyboardEvent, delta: number, choose = false) {
  const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])'));
  const next = items[(items.indexOf(document.activeElement as HTMLElement) + delta + items.length) % items.length];
  next?.focus();
  if (choose && next) next.click();
}
function leavePage() { if (received.value) payment.openOrder(); else payment.notify('leave'); }

useDialogA11y(computed(() => active.value && s.open && !s.pending), '#pp-sheet', payment.close, true, 3);
useDialogA11y(computed(() => active.value && s.open && !!s.pending && !s.cashier && !s.notice), '#pp-page', leavePage, true, 3);
useDialogA11y(computed(() => active.value && s.open && s.cashier), '.pp-cashier', payment.closeCashier, true, 4);

// #ifdef APP-PLUS
// The bank page is a native child webview under the UVEL bar; links it does not own (bank apps) open outside.
type PlusWebview = { close(): void; overrideUrlLoading(options: { mode: string; match: string }, callback: (event: { url: string }) => void): void };
type PlusRuntime = { webview: { create(url: string, id: string, styles: Record<string, string>): PlusWebview; currentWebview(): { append(view: PlusWebview): void } }; runtime: { openURL(url: string): void } };
let cashierView: PlusWebview | null = null;
watch(() => active.value && s.open && s.cashier ? cashierUrl.value : '', url => {
  cashierView?.close(); cashierView = null;
  if (!url) return;
  const plus = (globalThis as unknown as { plus: PlusRuntime }).plus;
  cashierView = plus.webview.create(url, `uvel-purchase-cashier-${Date.now()}`, { top: `${statusBar + 82}px`, bottom: `${cashierFootPad + 32}px` });
  cashierView.overrideUrlLoading({ mode: 'allow', match: hostedPaymentUrlPattern }, event => plus.runtime.openURL(event.url));
  plus.webview.currentWebview().append(cashierView);
});
onUnmounted(() => { cashierView?.close(); cashierView = null; });
// #endif

// Leaving for a wallet or bank app keeps the payment open and only pauses reads; navigating away closes it.
let appHidden = false;
const appHide = () => { appHidden = true; payment.pause(); };
const appShow = () => { appHidden = false; if (active.value && s.open) payment.wake(); };
function visibility() { if (typeof document === 'undefined' || !s.open) return; if (document.hidden) payment.pause(); else if (active.value) payment.wake(); }
watch(() => app.accountKey, () => payment.close());
// Channel availability is read when the method sheet opens.
watch(() => active.value && s.open && !s.pending && s.policy === null, load => { if (load) void payment.loadPolicy(); }, { immediate: true });
onShow(() => { active.value = true; if (s.open) payment.wake(); });
onHide(() => { setTimeout(() => { if (!appHidden && !(typeof document !== 'undefined' && document.hidden) && active.value === false && s.open) payment.close(); }, 60); active.value = false; });
onMounted(() => { uni.onAppHide(appHide); uni.onAppShow(appShow); if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility); });
onUnmounted(() => { uni.offAppHide(appHide); uni.offAppShow(appShow); if (active.value && s.open) payment.close(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.pp-mask { position: fixed; inset: 0; z-index: 900; display: flex; align-items: flex-end; justify-content: center; background: var(--v5-bg-color-mask); }
.pp-sheet { display: flex; flex-direction: column; width: 100%; max-width: 480px; max-height: calc(100% - var(--nx-overlay-top)); box-sizing: border-box; padding: var(--v5-space-5) var(--v5-space-5) calc(var(--nx-overlay-safe-bottom) + 10px); border-radius: var(--v5-radius-2xl) var(--v5-radius-2xl) 0 0; background: linear-gradient(155deg, color-mix(in srgb, var(--v5-ink) 4%, transparent), transparent 55%), var(--v5-surface); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--v5-ink) 6%, transparent); color: var(--v5-ink); }
.pp-head { flex: none; display: flex; align-items: center; gap: var(--v5-space-3); }
.pp-head__text { flex: 1; min-width: 0; }
.pp-title { display: block; font: 600 var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); }
.pp-steps { flex: none; display: block; margin-top: 6px; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-circ { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: var(--v5-ink-2); }
.pp-cd { display: flex; align-items: center; gap: 6px; margin-top: var(--v5-space-1); color: var(--v5-warning); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-cd.is-urgent { color: var(--v5-danger); font-weight: 500; }
.pp-body { min-height: 0; overflow-y: auto; }
.pp-prod { display: flex; align-items: center; gap: var(--v5-space-3); margin-top: var(--v5-space-4); padding: var(--v5-space-3); border-radius: var(--v5-radius-m); background: var(--v5-surface-2); }
.pp-prod__img { flex: none; width: 44px; height: 44px; }
.pp-prod__text { flex: 1; min-width: 0; }
.pp-prod__name { display: block; font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); overflow-wrap: anywhere; }
.pp-prod__meta { display: block; margin-top: 2px; color: var(--v5-ink-3); font: var(--ui-type-meta-weight, 400) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.pp-prod .pp-prod__amt { flex: none; font-size: 17px; line-height: 24px; font-variant-numeric: normal; }
.pp-prod__amt :deep(.checkout-amount__symbol) { margin-right: 1px; }
.pp-mono { font-family: var(--font-jet-mono); letter-spacing: 0; white-space: nowrap; }
.pp-label { display: block; margin-top: var(--v5-space-5); color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-opts { display: grid; gap: 10px; margin-top: var(--v5-space-2); }
.pp-opt { min-height: 68px; box-sizing: border-box; padding: var(--v5-space-3) 14px; border-radius: var(--v5-radius-l); background: var(--v5-surface-2); box-shadow: inset 0 0 0 1px var(--v5-border); display: flex; flex-direction: column; justify-content: center; }
.pp-opt.on { background: color-mix(in srgb, var(--v5-brand) 6%, var(--v5-surface-2)); box-shadow: inset 0 0 0 1.5px var(--v5-brand); }
.pp-opt.off { opacity: .5; }
.pp-opt__row { display: flex; align-items: center; gap: var(--v5-space-3); }
.pp-opt__ic { flex: none; width: 40px; height: 40px; border-radius: var(--v5-radius-s); display: grid; place-items: center; background: var(--v5-surface-3); color: var(--v5-ink-2); }
.pp-opt.on .pp-opt__ic { background: var(--v5-brand-soft); color: var(--v5-brand); }
.pp-opt__tx { flex: 1; min-width: 0; }
.pp-opt__t { display: block; font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); color: var(--v5-ink); }
.pp-opt__h { display: block; margin-top: 2px; font: var(--ui-type-list-subtitle-weight) var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); color: var(--v5-ink-3); }
.pp-radio { flex: none; width: 20px; height: 20px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--v5-ink-3); }
.pp-opt.on .pp-radio, .pp-tab.on .pp-radio { box-shadow: inset 0 0 0 6px var(--v5-brand); }
.pp-short { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--v5-border); }
/* The 32px pill keeps its 44px hit area without adding visible space. */
.pp-short :deep(.nx-button) { margin: -6px 0; }
.pp-short__t { min-width: 0; color: var(--v5-warning); font: var(--ui-type-list-subtitle-weight) var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); }
.pp-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: var(--v5-space-2); }
.pp-tab { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 64px; box-sizing: border-box; padding: var(--v5-space-3) 14px; border-radius: var(--v5-radius-m); background: var(--v5-surface-2); box-shadow: inset 0 0 0 1px var(--v5-border); }
.pp-tab.on { background: color-mix(in srgb, var(--v5-brand) 6%, var(--v5-surface-2)); box-shadow: inset 0 0 0 1.5px var(--v5-brand); }
.pp-tab__a { font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); color: var(--v5-ink); }
.pp-tab__b { font: var(--ui-type-meta-weight, 400) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-3); }
.pp-tab.off .pp-tab__a, .pp-tab.off .pp-tab__b { color: var(--v5-ink-3); }
.pp-soon { margin-top: var(--v5-space-1); height: 20px; padding: 0 6px; border-radius: var(--v5-radius-full); background: var(--v5-surface-3); color: var(--v5-ink-3); font: 500 11px/20px var(--font-v5); }
.pp-fees { margin-top: var(--v5-space-5); padding: var(--v5-space-1) var(--v5-space-4); border-radius: var(--v5-radius-l); background: var(--v5-surface-2); }
.pp-fees .pp-kv { min-height: 36px; }
.pp-fees .pp-kv + .pp-kv { border-top: 1px solid var(--v5-border); }
.pp-kv { display: flex; justify-content: space-between; align-items: center; gap: var(--v5-space-3); min-height: 32px; font: var(--ui-type-list-subtitle-weight) var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); }
.pp-kv__k { color: var(--v5-ink-3); }
.pp-kv__v { min-width: 0; font-weight: 500; color: var(--v5-ink); font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.pp-vnd { display: block; margin-top: var(--v5-space-1); font: 500 32px/40px var(--font-amount); letter-spacing: -.02em; color: var(--v5-ink); }
.pp-vnd__u { margin-left: 6px; font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); color: var(--v5-ink-3); letter-spacing: 0; }
.pp-fx { display: block; margin-top: var(--v5-space-1); color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-foot { flex: none; }
.pp-total { display: flex; align-items: baseline; justify-content: space-between; margin-top: var(--v5-space-4); }
.pp-total.is-ruled { margin-top: var(--v5-space-5); padding-top: var(--v5-space-4); border-top: 1px solid var(--v5-border); }
.pp-total__k { color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-total .pp-total__v { font-size: 24px; line-height: 30px; font-variant-numeric: normal; }
.pp-note { display: block; margin-top: var(--v5-space-2); color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.pp-auto { display: flex; align-items: center; gap: 6px; margin-top: var(--v5-space-1); color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.pp-auto__dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); }
.pp-auto__dot.is-retry { background: var(--v5-warning); }
.pp-cta { display: flex; width: 100%; margin-top: var(--v5-space-4); }

.pp-page { position: fixed; inset: 0; z-index: 950; display: flex; flex-direction: column; box-sizing: border-box; background: var(--v5-bg); color: var(--v5-ink); }
.pp-nav { position: relative; z-index: 120; flex: none; height: 44px; padding: 0 var(--v5-space-4); display: flex; align-items: center; justify-content: space-between; }
.pp-nav__t { flex: 1; min-width: 0; text-align: center; font: 600 var(--ui-type-nav-title)/var(--ui-type-nav-title-lh) var(--font-v5); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pp-nav__gap { flex: none; width: 36px; height: 36px; }
.pp-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.pp-pay { display: flex; flex-direction: column; gap: var(--v5-space-3); padding: var(--v5-space-6) var(--v5-space-4) var(--v5-space-8); }
.pp-card { padding: var(--v5-space-4); border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.pp-hero { padding: var(--v5-space-5); background: radial-gradient(260px 200px at 100% 0%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 72%), var(--v5-surface); }
.pp-hero__lab { display: block; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-hero__row { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); margin-top: var(--v5-space-1); }
.pp-hero__amt { min-width: 0; font: 500 32px/40px var(--font-amount); letter-spacing: -.02em; white-space: nowrap; color: var(--v5-ink); }
.pp-hero__u { margin-left: 6px; font: 500 var(--ui-type-description)/18px var(--font-v5); color: var(--v5-ink-3); letter-spacing: 0; }
.pp-hero .pp-cd { margin-top: 10px; }
.pp-hero__meta { display: block; margin-top: var(--v5-space-3); padding-top: var(--v5-space-3); border-top: 1px solid var(--v5-border); color: var(--v5-ink-3); font: var(--ui-type-meta-weight, 400) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.pp-copy { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: var(--v5-ink-2); }
.pp-wait { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; margin-bottom: 14px; padding: 0 2px 14px; border-bottom: 1px solid var(--v5-border); }
.pp-wait__spin { flex: none; width: 16px; height: 16px; box-sizing: border-box; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--pp-st) 22%, transparent); border-top-color: var(--pp-st); border-right-color: var(--pp-st); animation: pp-spin 1s linear infinite; }
@keyframes pp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pp-wait__spin { animation: none; } }
.pp-wait__t { white-space: nowrap; font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); color: var(--v5-ink); }
.pp-wait__em { color: var(--pp-st); }
.pp-wait__s { margin-left: auto; text-align: right; color: var(--v5-ink-3); font: var(--ui-type-meta-weight, 400) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.pp-card__top { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-2); }
.pp-card__t { display: block; font: 600 var(--ui-type-card-title)/var(--ui-type-card-title-lh) var(--font-v5); }
.pp-tag { height: 24px; padding: 0 var(--v5-space-2); border-radius: var(--v5-radius-full); display: inline-flex; align-items: center; background: var(--v5-brand-soft); color: var(--v5-brand); font: 500 var(--ui-type-chip)/var(--ui-type-chip-lh) var(--font-v5); }
.pp-qr { width: 200px; height: 200px; margin: var(--v5-space-4) auto 0; padding: var(--v5-space-3); box-sizing: border-box; border-radius: var(--v5-radius-m); background: #fff; box-shadow: inset 0 0 0 1px var(--v5-border); }
.pp-qr__img { display: block; width: 176px; height: 176px; }
.pp-cap { display: block; margin-top: var(--v5-space-2); text-align: center; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.pp-addr { display: flex; align-items: center; gap: var(--v5-space-2); margin-top: var(--v5-space-3); padding: 6px 6px 6px 14px; border-radius: var(--v5-radius-m); background: var(--v5-surface-2); }
.pp-addr__t { flex: 1; min-width: 0; font: 400 var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-jet-mono); color: var(--v5-ink); overflow-wrap: anywhere; }
.pp-wait.is-alone { margin: 0; padding: 0 2px; border: 0; }
.pp-pay.has-bar { padding-bottom: 120px; }
.pp-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; padding: var(--v5-space-3) var(--v5-space-4) calc(30px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, color-mix(in srgb, var(--ui-ticket-top) 70%, transparent), color-mix(in srgb, var(--ui-ticket-bottom) 94%, transparent)); border-top: 1px solid color-mix(in srgb, var(--v5-ink) 5%, transparent); backdrop-filter: blur(18px) saturate(160%); -webkit-backdrop-filter: blur(18px) saturate(160%); }
.pp-reopen { display: flex; flex: 1; }
.pp-div { height: 1px; margin: 6px 0; background: var(--v5-border); }
.pp-warn { display: flex; gap: var(--v5-space-2); padding: var(--v5-space-3) 14px; border-radius: var(--v5-radius-m); background: color-mix(in srgb, var(--v5-warning-soft) 60%, transparent); color: var(--v5-warning); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.pp-warn > :first-child { flex: none; margin-top: 2px; }

.pp-done { display: flex; flex-direction: column; padding: 48px var(--v5-space-4) var(--v5-space-8); }
.pp-done__hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 var(--v5-space-2); }
.pp-done__badge { width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; color: var(--v5-brand); background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--v5-brand) 26%, transparent), color-mix(in srgb, var(--v5-brand) 10%, transparent) 70%); box-shadow: 0 0 0 10px color-mix(in srgb, var(--v5-brand) 6%, transparent), 0 0 60px color-mix(in srgb, var(--v5-brand) 22%, transparent); }
.pp-done__title { display: block; margin-top: var(--v5-space-6); font: 600 var(--ui-type-page-title)/var(--ui-type-page-title-lh) var(--font-v5); }
.pp-done__desc { display: block; margin-top: var(--v5-space-2); color: var(--v5-ink-2); font: var(--ui-type-body-weight) var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); }
.pp-track { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 36px; }
.pp-step { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--v5-space-2); text-align: center; }
.pp-seg { position: absolute; top: 11px; left: calc(50% + 16px); width: calc(100% - 32px); height: 2px; border-radius: var(--v5-radius-full); background: var(--v5-surface-3); }
.pp-seg.is-done { background: var(--v5-brand); }
.pp-dot { width: 24px; height: 24px; box-sizing: border-box; border-radius: 50%; display: grid; place-items: center; background: var(--v5-surface-3); }
.pp-dot.is-done { background: var(--v5-brand); color: var(--v5-on-brand); }
.pp-dot.is-current { border: 2px solid var(--v5-brand); background: transparent; box-shadow: 0 0 0 4px color-mix(in srgb, var(--v5-brand) 18%, transparent); }
.pp-dot.is-current::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--v5-brand); }
.pp-step__l { font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink); }
.pp-receipt { margin-top: 36px; padding: var(--v5-space-4); border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.pp-receipt .pp-receipt__amt { font-size: 20px; line-height: 28px; font-variant-numeric: normal; }
.pp-done__foot { margin-top: auto; padding-top: var(--v5-space-6); display: flex; flex-direction: column; align-items: stretch; gap: var(--v5-space-2); text-align: center; }

.pp-cashier { position: fixed; inset: 0; z-index: 955; display: flex; flex-direction: column; background: var(--v5-bg); color: var(--v5-ink); }
.pp-cashier__bar { flex: none; background: var(--v5-surface); box-shadow: 0 1px 0 var(--v5-border); }
.pp-cashier__row { position: relative; z-index: 120; height: 56px; padding: 0 var(--v5-space-4); display: flex; align-items: center; gap: var(--v5-space-3); }
.pp-cashier__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
.pp-cashier__t { font: 600 var(--ui-type-nav-title)/var(--ui-type-nav-title-lh) var(--font-v5); }
.pp-cashier__cd { display: inline-flex; align-items: center; gap: var(--v5-space-1); color: var(--v5-warning); font: var(--ui-type-meta-weight, 400) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.pp-cashier__cd.is-urgent { color: var(--v5-danger); }
.pp-cashier__lock { position: relative; z-index: 120; height: 26px; display: flex; align-items: center; justify-content: center; gap: var(--v5-space-1); color: var(--v5-ink-3); font: 400 11px/14px var(--font-v5); }
.pp-cashier__frame { flex: 1; min-height: 0; background: #fff; }
.pp-cashier__frame iframe { display: block; width: 100%; height: 100%; border: 0; }
.pp-cashier__foot { flex: none; padding-top: var(--v5-space-3); min-height: 20px; display: flex; align-items: center; justify-content: center; gap: var(--v5-space-2); background: var(--v5-surface); box-shadow: 0 -1px 0 var(--v5-border); color: var(--v5-ink-2); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.pp-pulse { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--v5-brand); box-shadow: 0 0 0 5px color-mix(in srgb, var(--v5-brand) 20%, transparent); }

.purchase-payment__row { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); padding: var(--v5-space-3) 0; border-bottom: 1px solid color-mix(in srgb, var(--v5-ink) 5%, transparent); color: var(--v5-ink-2); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.purchase-payment-resume { position: fixed; z-index: 890; left: var(--v5-space-4); right: var(--v5-space-4); bottom: calc(var(--nx-overlay-safe-bottom, 24px) + 64px); display: grid; gap: var(--v5-space-2); max-height: 160px; overflow: auto; padding: var(--v5-space-2) var(--v5-space-3); border: 1px solid var(--v5-border); border-radius: var(--v5-radius-m); background: var(--v5-surface); color: var(--v5-ink); font-size: var(--ui-type-description); }
</style>
