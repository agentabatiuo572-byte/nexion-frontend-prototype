<template>
  <view class="device-inventory-row" :data-device-key="`device:${device.id}`">
    <view class="device-inventory-row__heading" role="button" tabindex="0"
      :aria-label="`${t.earn.deviceDetailTitle}: ${deviceName(t, device)}${onlineState === 'online' ? ' · ' + t.earn.online : ''} · ${t.myDevices.inventoryEarnedLabel} ${earnedText} · ${t.myDevices.inventoryTodayLabel} ${todayText}${statusText ? ' · ' + statusText : ''}`"
      :aria-expanded="expanded" :aria-controls="detailsId" @click="expanded = !expanded">
      <view class="device-inventory-row__main">
        <view class="device-inventory-row__art" :class="{ 'device-inventory-row__art--inactive': !active }">
          <image v-if="imageSrc" class="device-inventory-row__image" :src="imageSrc" mode="aspectFit" @error="imageError" />
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8m-4-5v5" /></svg>
          <text v-if="active && onlineState === 'online'" class="device-inventory-row__state device-inventory-row__state--active">{{ t.earn.online }}</text>
        </view>
        <view class="device-inventory-row__identity">
          <text class="device-inventory-row__name">{{ deviceName(t, device) }}</text>
          <view class="device-inventory-row__earnings">
            <text class="device-inventory-row__total">{{ t.myDevices.inventoryEarnedLabel }}<text class="device-inventory-row__earned font-mono-tabular">{{ earnedText }}</text></text>
            <text class="device-inventory-row__today">{{ t.myDevices.inventoryTodayLabel }} <text class="font-mono-tabular">{{ todayText }}</text></text>
          </view>
          <text v-if="statusText" class="device-inventory-row__status">{{ statusText }}</text>
        </view>
      </view>
      <view class="device-inventory-row__chevron" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: expanded ? 'rotate(180deg)' : undefined }"><path d="m6 9 6 6 6-6" /></svg>
      </view>
    </view>
    <view v-if="expanded" :id="detailsId" class="device-inventory-row__body">
      <view v-if="device.pendingDeactivate" class="device-inventory-row__pending">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        <text>{{ pendingChipLabel }}</text>
      </view>
      <view class="device-inventory-row__controls">
        <view v-if="tradeinCreditText || tradeinDisabledText" :id="`${quoteInfoId}-trigger`" class="device-inventory-row__quote device-inventory-row__info"
          :class="{ 'device-inventory-row__info--open': quoteInfoOpen }" role="button" tabindex="0"
          :aria-label="`${t.tradein.quoteInfoLabel} · ${tradeinQuoteAmount !== undefined ? t.tradein.inventoryCreditLabel + ' ' + visibility.mask(fmtMoney(tradeinQuoteAmount)) : tradeinDisabledText || t.tradein.quoteUnavailable}`"
          :aria-expanded="quoteInfoOpen" :aria-controls="quoteInfoId"
          @click.stop="emit('quote-info', !quoteInfoOpen)" @keydown.enter.stop.prevent="emit('quote-info', !quoteInfoOpen)" @keydown.space.stop.prevent="emit('quote-info', !quoteInfoOpen)" @keydown.tab="emit('quote-info', false)" @keydown.esc.stop="emit('quote-info', false)">
          <view class="device-inventory-row__quote-label">
            <text v-if="tradeinQuoteAmount !== undefined">{{ t.tradein.inventoryCreditLabel }}</text>
            <text v-if="tradeinQuoteAmount !== undefined" class="device-inventory-row__credit font-mono-tabular">{{ visibility.mask(fmtMoney(tradeinQuoteAmount).replace('$', '$ ')) }}</text>
            <text v-else class="device-inventory-row__tradein-disabled">{{ tradeinDisabledText || t.tradein.quoteUnavailable }}</text>
          </view>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-9h.01" /></svg>
        </view>
        <view v-if="showAction" class="device-inventory-row__actions" :class="{ 'device-inventory-row__actions--pair': tradeinCtaLabel }">
          <view class="device-inventory-row__action" :class="{ 'device-inventory-row__action--active': active }"
            role="button" :tabindex="actionDisabled ? -1 : 0" :aria-disabled="actionDisabled" @click="onAction">
            <text>{{ actionLabel }}</text>
          </view>
          <view v-if="tradeinCtaLabel" class="device-inventory-row__tradein-cta" role="button" tabindex="0" @click.stop="emit('quote-info', false); emit('tradein')">
            <text>{{ tradeinCtaLabel }}</text>
          </view>
        </view>
      </view>
      <view v-if="quoteInfoOpen && (tradeinCreditText || tradeinDisabledText)" :id="quoteInfoId" class="device-inventory-row__popover" role="note" @click.stop>
        <text class="device-inventory-row__popover-copy">{{ t.tradein.ladderIntro }}</text>
        <text class="device-inventory-row__popover-footnote">{{ t.tradein.ladderFootnote }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { fmtMoney } from "@/i18n/format";
import { deviceName } from "@/lib/device-copy";
import { useDataVisibility } from "@/store/data-visibility";
import { deviceOnlineState } from "@/lib/hashpower";
import { useDeviceProductImage } from "@/composables/use-device-product-image";

const t = useT();
const visibility = useDataVisibility();
const props = withDefaults(
  defineProps<{
    device: Device;
    active: boolean;
    runtimeConfirmed?: boolean;
    showAction?: boolean;
    disabled?: boolean;
    actionDisabled?: boolean;
    /** Replaces the disabled action label when the server needs reconciliation. */
    disabledLabel?: string;
    activateLabel: string;
    deactivateLabel: string;
    slotsFullLabel: string;
    pendingChipLabel: string;
    tradeinCreditText?: string;
    tradeinQuoteAmount?: number;
    quoteInfoOpen?: boolean;
    tradeinCtaLabel?: string;
    tradeinDisabledText?: string;
  }>(),
  { disabled: false, actionDisabled: false, showAction: true, runtimeConfirmed: true, quoteInfoOpen: false },
);
const emit = defineEmits<{ (e: "toggle"): void; (e: "tradein"): void; (e: "quote-info", open: boolean): void }>();
const expanded = ref(false);
const detailsId = computed(() => `device-inventory-details-${encodeURIComponent(props.device.id)}`);
const quoteInfoId = computed(() => `${detailsId.value}-quote-info`);
const earnedText = computed(() => visibility.mask(props.runtimeConfirmed ? fmtMoney(props.device.cumulativeEarningsUsdt) : "—"));
const todayText = computed(() => visibility.mask(props.runtimeConfirmed ? `+${fmtMoney(props.device.todayEarnings)}` : "—"));
const { imageSrc, imageError } = useDeviceProductImage(() => props.device);
const onlineState = computed(() => deviceOnlineState(props.device, Date.now(), props.runtimeConfirmed));
const statusText = computed(() => {
  if (props.device.activationUnconfirmed) return t.value.earn.runtimeUnknown;
  if (onlineState.value === "unknown") return t.value.earn.runtimeUnknown;
  return props.device.pendingDeactivate ? props.pendingChipLabel : "";
});
const actionDisabled = computed(() => props.disabled || props.actionDisabled);
const actionLabel = computed(() =>
  props.active ? props.deactivateLabel : props.disabled ? props.disabledLabel ?? props.slotsFullLabel : props.activateLabel,
);
function onAction() {
  if (!props.showAction || actionDisabled.value) return;
  emit("toggle");
}
</script>

<style scoped>
.device-inventory-row { min-width: 0; overflow: hidden; color: var(--v5-ink); }
.device-inventory-row__heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 64px; box-sizing: border-box; padding: 12px 16px; }
.device-inventory-row__main { display: flex; align-items: center; gap: 12px; min-width: 0; }
.device-inventory-row__art { position: relative; display: flex; justify-content: center; align-items: flex-start; flex: none; width: 88px; height: 80px; }
.device-inventory-row__art--inactive .device-inventory-row__image { opacity: .55; }
/* Activation state sits on the art's bottom edge; the outline separates it from the device render. */
.device-inventory-row__state { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); height: 20px; display: inline-flex; align-items: center; padding: 0 8px; border-radius: 999px; font: 600 11px/14px var(--font-v5); white-space: nowrap; box-shadow: 0 0 0 2px var(--v5-surface); }
.device-inventory-row__state--active { background: color-mix(in srgb, var(--v5-brand) 16%, var(--v5-surface)); color: var(--v5-brand); }
.device-inventory-row__image { display: block; width: 88px; height: 68px; }
.device-inventory-row__identity { min-width: 0; flex: 1; }
.device-inventory-row__name { display: block; font: 600 clamp(12px,3.34vw,13px)/1.4 var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__status { display: block; margin-top: 4px; color: var(--v5-ink-3); font: 400 clamp(11px,3.08vw,12px)/18px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__chevron { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: var(--v5-radius-full); background: var(--v5-surface-2); color: var(--v5-ink-3); }
.device-inventory-row__chevron svg { transition: transform .25s ease; }
.device-inventory-row__body { padding: 0 var(--ui-space-inset) var(--v5-space-4); }
.device-inventory-row__earnings { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin-top: 6px; }
.device-inventory-row__total { color: var(--v5-ink-2); font: 500 12px/18px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__earned { margin-left: var(--v5-space-1); color: var(--v5-ink); font-size: var(--ui-type-list-title); font-weight: 600; }
.device-inventory-row__today { color: var(--v5-success); font: 400 11px/16px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__pending { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; padding: 8px; border-radius: 8px; background: color-mix(in srgb, var(--v5-warning) 12%, transparent); color: var(--v5-warning-ink); font: 400 12px/18px var(--font-v5); }
.device-inventory-row__pending svg { flex: none; margin-top: 3px; }
.device-inventory-row__controls { display: flex; align-items: center; justify-content: flex-end; gap: var(--ui-space-inline); }
.device-inventory-row__quote { display: flex; align-items: center; gap: var(--v5-space-1); flex: 1.2; min-width: 0; min-height: 44px; color: var(--v5-ink-3); }
.device-inventory-row__quote-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--v5-space-1); min-width: 0; font: 400 11px/16px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__quote > svg { flex: none; }
.device-inventory-row__credit { color: var(--v5-ink); font-size: var(--v5-type-caption); font-weight: 600; line-height: 20px; overflow-wrap: anywhere; }
.device-inventory-row__actions { display: grid; grid-template-columns: 1fr; min-width: 88px; gap: var(--v5-space-2); }
.device-inventory-row__actions--pair { flex: 1.8; grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 136px; }
.device-inventory-row__info--open { color: var(--v5-brand); }
.device-inventory-row__popover { position: relative; grid-column: 1 / -1; margin-top: var(--v5-space-2); padding: var(--v5-space-3) var(--v5-space-4); border-radius: var(--v5-radius-s); background: var(--v5-surface-2); color: var(--v5-ink-2); font: 400 12px/18px var(--font-v5); }
.device-inventory-row__popover::before { content: ""; position: absolute; top: -6px; left: 24px; width: 12px; height: 12px; background: inherit; transform: rotate(45deg); }
.device-inventory-row__popover-copy, .device-inventory-row__popover-footnote { display: block; }
.device-inventory-row__popover-footnote { margin-top: var(--v5-space-2); color: var(--v5-ink-3); }
.device-inventory-row__action, .device-inventory-row__tradein-cta { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 44px; box-sizing: border-box; padding: var(--v5-space-2); border-radius: var(--v5-radius-full); font: 500 12px/18px var(--font-v5); text-align: center; overflow-wrap: anywhere; }
.device-inventory-row__action { background: var(--v5-surface-2); color: var(--v5-ink-2); }
.device-inventory-row__tradein-cta { background: var(--v5-brand); color: var(--v5-on-brand); }
.device-inventory-row__action[aria-disabled="true"] { opacity: .5; }
[role="button"] { cursor: pointer; }
[role="button"]:active { opacity: .7; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.device-inventory-row__heading:focus-visible { outline-offset: -2px; }
@media (max-width: 374px) {
  .device-inventory-row__main { gap: 10px; }
  .device-inventory-row__art { width: 72px; height: 66px; }
  .device-inventory-row__image { width: 72px; height: 56px; }
}
@media (prefers-reduced-motion: reduce) { .device-inventory-row__chevron svg { transition: none; } }
</style>
