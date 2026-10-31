<template>
  <NxSheet :open="open" :title="copy.paymentMethod" @close="requestClose">
    <view class="checkout-payment">
      <text class="checkout-payment__label">{{ copy.paymentTotal }}</text>
      <CheckoutAmount class="checkout-payment__amount" :value="amount" currency="USDT" />
      <view class="checkout-payment__wallet" :aria-label="copy.wallet + ' · ' + copy.selected">
        <svg class="checkout-payment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6.5h15a1 1 0 0 1 1 1V19H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v2.5"/><path d="M20 10h-5v5h5M16.5 12.5h.01"/></svg>
        <view class="checkout-payment__wallet-copy"><text class="checkout-payment__wallet-title">{{ copy.wallet }}</text><text class="checkout-payment__label">{{ copy.walletBalance }} · {{ balanceText }}</text></view>
        <svg class="checkout-payment__selected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>
      </view>
      <text class="checkout-payment__note">{{ copy.noFees }}</text>
    </view>
    <template #footer>
      <view class="checkout-payment__footer">
        <text v-if="feedback" class="checkout-payment__error" role="alert">{{ feedback }}</text>
        <text v-else class="checkout-payment__note">{{ copy.paymentHint }}</text>
        <NxButton v-if="amountReadable && balanceReadable && !enoughBalance" :label="copy.topup" variant="text" :disabled="busy" @click="emit('topup')" />
        <NxButton :label="busy || submitted ? copy.paying : copy.confirmPayment" variant="primary" :busy="busy || submitted" :disabled="!canConfirm" @click="confirm" />
      </view>
    </template>
  </NxSheet>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import NxSheet from '@/components/ui/nx-sheet.vue';
import NxButton from '@/components/ui/nx-button.vue';
import CheckoutAmount from './CheckoutAmount.vue';
import { useLocaleStore } from '@/store/locale';
import { formatGroupedAmount } from '@/lib/amount-display';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
const props = withDefaults(defineProps<{ open: boolean; amount: string | number; balance?: string | number; busy?: boolean; error?: string }>(), { busy: false, error: '' });
const emit = defineEmits<{ (event: 'close'): void; (event: 'confirm'): void; (event: 'topup'): void }>();
const locale = useLocaleStore();
const copy = computed(() => checkoutFlowCopy(locale.code));
const submitted = ref(false);
const amountNumber = computed(() => Number(props.amount));
const amountReadable = computed(() => Number.isFinite(amountNumber.value) && amountNumber.value >= 0 && formatGroupedAmount(props.amount) !== '-');
const balanceNumber = computed(() => Number(props.balance));
const balanceReadable = computed(() => props.balance !== undefined && Number.isFinite(balanceNumber.value) && balanceNumber.value >= 0 && formatGroupedAmount(props.balance) !== '-');
const balanceText = computed(() => balanceReadable.value ? formatGroupedAmount(props.balance) : '—');
// A fully discounted order still needs PIN authorization, but its existing
// contract does not require an available wallet snapshot to debit zero.
const enoughBalance = computed(() => amountReadable.value && (amountNumber.value === 0 || (balanceReadable.value && balanceNumber.value >= amountNumber.value)));
const canConfirm = computed(() => props.open && enoughBalance.value && !props.busy && !props.error && !submitted.value);
const feedback = computed(() => props.error || (!amountReadable.value ? copy.value.cannotPay : amountNumber.value === 0 ? '' : !balanceReadable.value ? copy.value.balanceUnavailable : !enoughBalance.value ? copy.value.insufficientBalance : ''));
watch(() => [props.open, props.busy, props.error], () => { if (!props.open || !props.busy) submitted.value = false; });
function requestClose() { if (props.open) emit('close'); }
function confirm() { if (!canConfirm.value) return; submitted.value = true; emit('confirm'); }
</script>
<style scoped>
.checkout-payment__label { display: block; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.checkout-payment__amount { display: block; margin: var(--v5-space-1) 0 var(--v5-space-6); font-size: var(--ui-type-wallet-amount); line-height: var(--ui-type-wallet-amount-lh); }
.checkout-payment__wallet { display: flex; align-items: center; gap: var(--v5-space-3); padding: var(--v5-space-4); border: 1px solid var(--v5-brand); border-radius: var(--v5-radius-m); background: var(--v5-surface-2); }
.checkout-payment__wallet-copy { flex: 1; min-width: 0; }
.checkout-payment__wallet-title { display: block; margin-bottom: var(--v5-space-1); color: var(--v5-ink); font: var(--ui-type-list-title-weight) var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); }
.checkout-payment__icon, .checkout-payment__selected { flex: none; width: 24px; height: 24px; color: var(--v5-brand); }
.checkout-payment__note { display: block; color: var(--v5-ink-2); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.checkout-payment > .checkout-payment__note { margin-top: var(--v5-space-4); }
.checkout-payment__footer { display: grid; gap: var(--v5-space-3); }
.checkout-payment__error { color: var(--v5-danger); font: var(--ui-type-body-weight) var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); }
</style>
