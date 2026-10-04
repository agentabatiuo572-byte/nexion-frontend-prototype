<!--
  SlotActionSheet — chassis-level bottom sheet that opens when the user taps an
  empty slot in /earn. Ported from Nexion-prototype/app/components/slot-action-sheet.tsx.
  Layout (both entries always reachable — no longer mutually exclusive):
    · PRIMARY (recommended): "Buy a new device" brand CTA → /store. Always shown.
    · SECONDARY (de-emphasized): when inactive (inventory) devices exist, a
      collapsed row "Activate an existing device (N) ›"; tap to reveal the list,
      tap a device to activate (respects MAX_DEVICES cap via app.activateDevice).
    · framer slide-up / fade  → CSS @keyframes
    · lucide ShoppingBag/ChevronRight/Smartphone/Server/Power/X → inline <svg stroke=token>
    · fully i18n-routed (t.slotSheet.*; close aria reuses t.trial.sheetCloseAria).
  Triggers call useSlotActionSheet().show(); this is the missing UI that renders
  when open (mounted once at chassis level).
-->
<template>
  <view v-if="sheet.open" class="sas-root" role="dialog" aria-modal="true" :aria-label="t.slotSheet.title">
    <view class="sas-backdrop" @click="hide" />

    <view class="sas-panel" @click.stop>
      <!-- header -->
      <view class="sas-head">
        <view class="sas-head-meta">
          <text class="sas-title">{{ t.slotSheet.title }}</text>
          <text class="sas-desc">{{ t.slotSheet.desc }}</text>
        </view>
        <view class="sas-close" role="button" tabindex="0" :aria-label="closeAria" @click="hide"  @keydown.enter.prevent="hide" @keydown.space.prevent="hide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- primary (recommended): buy a new device — always present -->
      <view class="sas-store-cta" role="button" tabindex="0" @click="onGoStore"  @keydown.enter.prevent="onGoStore" @keydown.space.prevent="onGoStore">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        <text class="sas-store-cta-t">{{ t.slotSheet.goStoreCta }}</text>
      </view>

      <!-- secondary (de-emphasized): collapsed row → tap to reveal activatable inventory -->
      <view v-if="inactiveDevices.length > 0" class="sas-activate">
        <view class="sas-activate-toggle" :class="{ 'is-open': expanded }" role="button" tabindex="0" :aria-expanded="expanded" @click="expanded = !expanded"  @keydown.enter.prevent="expanded = !expanded" @keydown.space.prevent="expanded = !expanded">
          <text class="sas-activate-toggle-t">{{ activateRowText }}</text>
          <svg class="sas-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>

        <view v-if="expanded" class="sas-list">
          <view
            v-for="d in inactiveDevices"
            :key="d.id"
            class="sas-device"
            :class="{ 'is-pending': activationInFlight.has(d.id) }"
            role="button"
            :tabindex="activationInFlight.has(d.id) ? -1 : 0"
            :aria-disabled="activationInFlight.has(d.id) ? 'true' : 'false'"
            @click="onActivate(d)"

            @keydown.enter.prevent="onActivate(d)" @keydown.space.prevent="onActivate(d)"
          >
            <view class="sas-device-ico">
              <svg v-if="d.kind === 'phone'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><path d="M6 6h.01" /><path d="M6 18h.01" /></svg>
            </view>
            <view class="sas-device-meta">
              <text class="sas-device-name">{{ deviceName(t, d) }}</text>
              <text class="sas-device-rate">{{ d.kind === "cloud-share" ? `${d.baseRateNEX} NEX${t.store.cardPerDaySuffix}` : `$${d.baseRate.toFixed(2)}${t.store.cardPerDaySuffix}` }}</text>
            </view>
            <view class="sas-device-power">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>
            </view>
          </view>
        </view>
      </view>

      <view v-if="unconfirmedDevices.length > 0" class="sas-unconfirmed" role="status">
        <text>{{ t.myDevices.inventoryActivationUnconfirmed }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, ref, watch } from "vue";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { useApp } from "@/store/app";
import { trialReservesSlotNow } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import type { Device } from "@/store/types";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { isActivatableInventoryDevice, occupiesDeviceSlot, requiresActivationConfirmation } from "@/lib/device-slot-policy";
import { deviceE3Api, remoteApiEnabled } from "@/api/runtime";
import { isSettledRejection } from "@/api/errors";
import { acquireDeviceCommandKey, finishDeviceCommand } from "@/lib/device-command-key";

const sheet = useSlotActionSheet();
const app = useApp();
const t = useT();

// openForSlot 只在有未激活库存时放行本层,层的身份即「选择要激活的设备」——
// 列表打开即展开,不再折叠一层把选择藏起来;购买新设备仍是顶部主 CTA。
const expanded = ref(true);
watch(
  () => sheet.open,
  (open) => {
    if (open) expanded.value = true;
  },
);

const inactiveDevices = computed(() => app.visibleDevices.filter(isActivatableInventoryDevice));
const unconfirmedDevices = computed(() => app.visibleDevices.filter(requiresActivationConfirmation));
const activeCount = computed(() => app.activeSlotCount);
const reservedSlots = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsUsed = computed(() => activeCount.value + reservedSlots.value);

const activateRowText = computed(() =>
  fmt(t.value.slotSheet.activateRow, { n: inactiveDevices.value.length }),
);
const closeAria = computed(() => t.value.trial.sheetCloseAria);

function hide() {
  sheet.hide();
}

const activationInFlight = ref(new Set<string>());

async function onActivate(d: Device) {
  if (requiresActivationConfirmation(d)) {
    toast.warn(t.value.myDevices.inventoryActivationUnconfirmed);
    return;
  }
  if (d.kind === "phone") {
    sheet.hide();
    navTo("/pages/onboarding/connect?mode=recalibrate");
    return;
  }
  if (occupiesDeviceSlot(d.kind) && slotsUsed.value >= app.slotCap) {
    toast.warn(fmt(t.value.slotSheet.toastSlotsFull, { max: app.slotCap }));
    return;
  }
  if (remoteApiEnabled) {
    const deviceId = Number(d.id);
    const version = Number(d.rowVersion);
    if (activationInFlight.value.has(d.id)) return;
    if (
      !Number.isSafeInteger(deviceId)
      || deviceId <= 0
      || !Number.isSafeInteger(version)
      || version < 0
    ) {
      toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
      return;
    }
    const accountKey = app.accountKey;
    const key = acquireDeviceCommandKey(accountKey, "activate", d.id, version);
    const confirmed = () => {
      if (accountKey !== app.accountKey) return false;
      const current = app.devices.find((item) => item.id === d.id);
      return Boolean(current) && current!.activatedAt !== null;
    };
    activationInFlight.value.add(d.id);
    try {
      await deviceE3Api.activate(deviceId, version, app.slotCap, key);
      if (!(await app.refreshRemoteFleet()) || !confirmed()) {
        throw new Error("DEVICE_ACTIVATION_NOT_CONFIRMED");
      }
      finishDeviceCommand(accountKey, "activate", d.id, version);
      toast.success(fmt(t.value.slotSheet.toastActivated, { name: deviceName(t.value, d) }));
      sheet.hide();
      return;
    } catch (cause) {
      try {
        if (accountKey === app.accountKey && await app.refreshRemoteFleet() && confirmed()) {
          finishDeviceCommand(accountKey, "activate", d.id, version);
          toast.success(fmt(t.value.slotSheet.toastActivated, { name: deviceName(t.value, d) }));
          sheet.hide();
          return;
        }
      } catch {
        // Retain the stable key while both command and readback remain uncertain.
      }
      if (isSettledRejection(cause)) finishDeviceCommand(accountKey, "activate", d.id, version);
      if (accountKey === app.accountKey) toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
      return;
    } finally {
      activationInFlight.value.delete(d.id);
    }
  }
  const ok = app.activateDevice(d.id, reservedSlots.value);
  if (ok) {
    toast.success(fmt(t.value.slotSheet.toastActivated, { name: deviceName(t.value, d) }));
    sheet.hide();
  }
}

function onGoStore() {
  sheet.hide();
  navTo("/pages/store/store");
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => sheet.open), ".sas-root", hide);


</script>

<style scoped>
.sas-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.sas-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  animation: sas-fade 0.24s ease-out;
}
.sas-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--nx-glass-fill);
  border-top: 1px solid var(--v5-border);
  padding: 18px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  animation: sas-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes sas-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes sas-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.sas-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.sas-head-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sas-title {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.2;
}
.sas-desc {
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 4px;
  line-height: 1.4;
  text-wrap: pretty;
}
.sas-close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.sas-close:active {
  background: var(--v5-surface-3);
}
/* primary CTA — brand fill, recommended weight */
.sas-store-cta {
  margin-top: 16px;
  width: 100%;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--v5-brand);
}
.sas-store-cta:active {
  transform: scale(0.98);
}
.sas-store-cta-t {
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-on-brand);
  font-family: var(--font-v5);
}
/* secondary — de-emphasized collapse row */
.sas-activate {
  margin-top: 10px;
}
.sas-activate-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 12px;
  background: var(--v5-surface-2);
}
.sas-activate-toggle:active {
  background: var(--v5-surface-3);
  transform: scale(0.99);
}
.sas-activate-toggle-t {
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-3);
  font-family: var(--font-v5);
}
.sas-chev {
  flex-shrink: 0;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}
.sas-activate-toggle.is-open .sas-chev {
  transform: rotate(90deg);
}
.sas-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}
.sas-device {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  padding: 12px;
  background: var(--v5-surface-2);
  text-align: left;
}
.sas-device:active {
  background: var(--v5-surface-3);
}
.sas-device.is-pending {
  opacity: 0.58;
  pointer-events: none;
}
.sas-device-ico {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--nx-glass-fill);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.sas-device-meta {
  flex: 1;
  min-width: 0;
}
.sas-device-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sas-device-rate {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 2px;
  font-family: var(--font-jet-mono), monospace;
}
.sas-device-power {
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.sas-unconfirmed {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--v5-warning) 10%, transparent);
  color: var(--v5-warning-ink);
  font-family: var(--font-v5);
  font-size: 12px;
  line-height: 1.45;
}
</style>
