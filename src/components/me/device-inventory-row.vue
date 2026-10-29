<template>
  <view class="device-inventory-row" :data-device-key="`device:${device.id}`">
    <view class="device-inventory-row__heading" role="button" tabindex="0"
      :aria-label="`${t.earn.deviceDetailTitle}: ${deviceName(t, device)} · ${statusText}`"
      :aria-expanded="expanded" :aria-controls="detailsId" @click="expanded = !expanded">
      <view class="device-inventory-row__main">
        <view class="device-inventory-row__art" :class="{ 'device-inventory-row__art--inactive': !active }">
          <image v-if="imageSource" class="device-inventory-row__image" :src="imageSource" mode="aspectFit" />
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8m-4-5v5" /></svg>
          <text class="device-inventory-row__state" :class="active ? 'device-inventory-row__state--active' : 'device-inventory-row__state--inactive'">{{ active ? t.myDevices.inventoryTagActive : t.myDevices.inventoryTagInactive }}</text>
        </view>
        <view class="device-inventory-row__identity">
          <text class="device-inventory-row__name">{{ deviceName(t, device) }}</text>
          <text class="device-inventory-row__status" :class="{ 'device-inventory-row__status--online': active && !device.activationUnconfirmed && onlineState === 'online' }">{{ statusText }}</text>
        </view>
      </view>
      <view class="device-inventory-row__chevron" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: expanded ? 'rotate(180deg)' : undefined }"><path d="m6 9 6 6 6-6" /></svg>
      </view>
    </view>
    <view v-if="expanded" :id="detailsId" class="device-inventory-row__body">
      <view class="device-inventory-row__summary">
        <text class="device-inventory-row__spec">{{ device.kind === "cloud-share" ? `${formatAmount(device.baseRateNEX)} UVT${t.store.cardPerDaySuffix}` : `$${formatAmount(device.baseRate)}${t.store.cardPerDaySuffix}` }} · {{ deviceGpuLabel(t, device) }}</text>
        <view v-if="showAction" class="device-inventory-row__action" :class="{ 'device-inventory-row__action--active': active }"
          role="button" :tabindex="actionDisabled ? -1 : 0" :aria-disabled="actionDisabled" @click="onAction">
          <text>{{ actionLabel }}</text>
        </view>
      </view>
      <view v-if="device.pendingDeactivate" class="device-inventory-row__pending">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        <text>{{ pendingChipLabel }}</text>
      </view>
      <view v-if="tradeinCreditText || tradeinDisabledText" class="device-inventory-row__tradein">
        <view v-if="tradeinCreditText" class="device-inventory-row__credit" role="button" tabindex="0" @click.stop="emit('ladder')">
          <text>{{ tradeinCreditText }} ›</text>
        </view>
        <text v-else class="device-inventory-row__tradein-disabled">{{ tradeinDisabledText }}</text>
        <view v-if="tradeinCtaLabel" class="device-inventory-row__tradein-cta" role="button" tabindex="0" @click.stop="emit('tradein')">
          <text>{{ tradeinCtaLabel }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { formatAmount } from "@/lib/amount-display";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName, deviceGpuLabel } from "@/lib/device-copy";
import { deviceOnlineState } from "@/lib/hashpower";
import { getProductMedia } from "@/lib/product-media";

const t = useT();
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
    tradeinCtaLabel?: string;
    tradeinDisabledText?: string;
  }>(),
  { disabled: false, actionDisabled: false, showAction: true, runtimeConfirmed: true },
);
const emit = defineEmits<{ (e: "toggle"): void; (e: "tradein"): void; (e: "ladder"): void }>();
const expanded = ref(false);
const detailsId = computed(() => `device-inventory-details-${encodeURIComponent(props.device.id)}`);
const imageSource = computed(() => props.device.kind === "phone"
  ? "/static/img/home-glass-20260928/phone.webp"
  : getProductMedia(props.device.kind)?.src);
const onlineState = computed(() => deviceOnlineState(props.device, Date.now(), props.runtimeConfirmed));
const statusText = computed(() => {
  if (props.device.activationUnconfirmed) return t.value.earn.runtimeUnknown;
  if (!props.active) return t.value.myDevices.inventoryInactiveStatus;
  const status = onlineState.value;
  const runtimeLabel = status === "unknown" ? t.value.earn.runtimeUnknown : status === "online" ? t.value.earn.online : t.value.earn.offline;
  return props.device.pendingDeactivate ? `${runtimeLabel} · ${props.pendingChipLabel}` : runtimeLabel;
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
.device-inventory-row__state--inactive { background: var(--v5-surface-3); color: var(--v5-ink-2); }
.device-inventory-row__image { display: block; width: 88px; height: 68px; }
.device-inventory-row__identity { min-width: 0; flex: 1; }
.device-inventory-row__name { display: block; font: 600 clamp(12px,3.34vw,13px)/1.4 var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__status { display: block; margin-top: 4px; color: var(--v5-ink-3); font: 400 clamp(11px,3.08vw,12px)/18px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__status--online::before { content:""; display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:var(--v5-success); vertical-align:1px; }
.device-inventory-row__chevron { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: var(--v5-radius-full); background: var(--v5-surface-2); color: var(--v5-ink-3); }
.device-inventory-row__chevron svg { transition: transform .25s ease; }
.device-inventory-row__body { padding: 0 16px 12px; }
.device-inventory-row__summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.device-inventory-row__spec { display: block; flex: 1; min-width: 0; color: var(--v5-ink-3); font: 400 12px/18px var(--font-v5); overflow-wrap: anywhere; }
.device-inventory-row__pending { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; padding: 8px; border-radius: 8px; background: color-mix(in srgb, var(--v5-warning) 12%, transparent); color: var(--v5-warning-ink); font: 400 12px/18px var(--font-v5); }
.device-inventory-row__pending svg { flex: none; margin-top: 3px; }
.device-inventory-row__tradein { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 12px; margin-top: 8px; font: 500 12px/18px var(--font-v5); }
.device-inventory-row__credit, .device-inventory-row__tradein-cta { display: flex; align-items: center; min-height: 44px; padding: 8px 0; box-sizing: border-box; overflow-wrap: anywhere; }
.device-inventory-row__credit { color: var(--v5-success); }
.device-inventory-row__tradein-cta { color: var(--v5-brand); }
.device-inventory-row__tradein-disabled { padding: 8px 0; color: var(--v5-ink-3); overflow-wrap: anywhere; }
.device-inventory-row__action { position: relative; display: inline-flex; flex: none; align-items: center; justify-content: center; min-height: 44px; min-width: 64px; max-width: 45%; box-sizing: border-box; padding: 8px 14px; border-radius: var(--v5-radius-full); color: var(--v5-brand); font: 500 13px/18px var(--font-v5); text-align: center; overflow-wrap: anywhere; }
.device-inventory-row__action::before { content: ""; position: absolute; inset: 6px 0; border-radius: inherit; background: var(--v5-brand-soft); pointer-events: none; }
.device-inventory-row__action > text { position: relative; }
.device-inventory-row__action--active { color: var(--v5-ink-3); }
.device-inventory-row__action--active::before { border: 1px solid var(--v5-border); background: transparent; }
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
