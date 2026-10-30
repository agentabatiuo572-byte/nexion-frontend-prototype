<template>
  <view class="payment-pin-input" :class="{ 'payment-pin-input--disabled': disabled, 'payment-pin-input--focused': focused }">
    <view class="payment-pin-input__cells" aria-hidden="true">
      <view v-for="n in 6" :key="n" class="payment-pin-input__cell" :class="{ 'payment-pin-input__cell--active': focused && modelValue.length === n - 1 }">
        <view v-if="modelValue.length >= n" class="payment-pin-input__dot" />
      </view>
    </view>
    <input class="payment-pin-input__control" type="text" :password="true" inputmode="numeric" pattern="[0-9]*" maxlength="6"
      :value="modelValue" :disabled="disabled" :focus="autoFocus" :aria-label="label" autocomplete="off" :adjust-position="true"
      @input="onInput" @focus="focused = true" @blur="focused = false" />
    <text class="payment-pin-input__status" aria-live="polite">{{ fmt(t.paymentPin.entered, { n: modelValue.length }) }}</text>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
const props = defineProps<{ modelValue: string; label: string; disabled?: boolean; autoFocus?: boolean }>();
const emit = defineEmits<{ (event: "update:modelValue", value: string): void; (event: "complete", value: string): void }>();
const t = useT();
const focused = ref(false);
function onInput(event: Event) {
  const input = event as unknown as { detail?: { value?: string }; target?: HTMLInputElement };
  const value = (input.detail?.value ?? input.target?.value ?? "").replace(/[^0-9]/g, "").slice(0, 6);
  // Keep the single underlying input and the six visual cells in agreement.
  if (input.target) input.target.value = value;
  emit("update:modelValue", value);
  if (value.length === 6 && props.modelValue !== value) emit("complete", value);
}
</script>
<style scoped>
.payment-pin-input { position: relative; width: 100%; min-width: 0; margin: var(--v5-space-3) 0; }
.payment-pin-input__cells { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--v5-space-2); }
.payment-pin-input__cell { height: 52px; display: flex; align-items: center; justify-content: center; background: var(--v5-surface-2); border: 1px solid var(--v5-border); border-radius: var(--v5-radius-s); }
.payment-pin-input__cell--active { border-color: var(--v5-brand); }
.payment-pin-input__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--v5-ink); }
.payment-pin-input__control { position: absolute; inset: 0; width: 100%; height: 52px; opacity: 0; caret-color: transparent; color: transparent; }
.payment-pin-input--disabled { opacity: .55; }
.payment-pin-input--focused .payment-pin-input__cells { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: var(--v5-radius-s); }
.payment-pin-input__status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
