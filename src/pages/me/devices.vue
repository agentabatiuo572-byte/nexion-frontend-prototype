<!--
  Device inventory (设备仓库) — ported from
  Nexion-prototype/app/(main)/me/devices/page.tsx.

  Full per-device list with activate/deactivate. Two sections:
    - Active: devices currently contributing to earnings (slot-capped)
    - Inventory: purchased but not yet activated (no slot impact)
  Slot cap (MAX_DEVICES) applies to ACTIVE devices only; a running free trial
  reserves a shadow slot too (composed here — stores don't import each other).
  A device with a running task routes through DeviceDeactivateSheet (wait/force).

  Wrapped in <AppChassis active="me">; SubPageHeader (back chevron) scrolls
  with content (no chassis-level back row in uni — see sub-page-header.vue).

  FEAT-DEV02: each paid eligible device row carries an upgrade trade-in strip
  (「可抵 $X」chip → ladder sheet · 「升级置换」CTA → retire flow via the
  chassis-mounted TradeinSheets). Free devices (paidPriceUsdt=0) show no trace;
  a device with no higher-priced target shows the disabled reason instead.
-->
<template>
  <AppChassis active="me">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="t.myDevices.inventoryTitle" />

      <view v-if="inventoryLoading" class="mx-4" role="status" aria-live="polite" style="padding: 24px 2px">
        <text>{{ t.earn.deviceLoading }}</text>
      </view>
      <EmptyState
        v-else-if="inventoryError"
        class="mx-4"
        kind="recoverable-error"
        :title="t.empty.errorTitle"
        :desc="t.empty.errorDesc"
        :cta-label="t.empty.errorCta"
        emphasis
        @cta="retryInventory"
      />
      <view v-if="inventoryStale" class="mx-4 nx-inline-recovery" role="status" style="padding: 12px; border-radius: 12px; background: var(--v5-danger-soft); color: var(--v5-danger)">
        <text class="block nx-inline-recovery__copy" style="font-size: var(--ui-type-list-subtitle)">{{ t.myDevices.inventoryStaleWarning }}</text>
        <view class="nx-inline-recovery__action" style="color: var(--v5-brand)" role="button" tabindex="0" @click="retryInventory"  @keydown.enter.prevent="retryInventory" @keydown.space.prevent="retryInventory">
          <text>{{ t.empty.errorCta }}</text>
        </view>
      </view>
      <view v-if="!inventoryReady" class="mx-4" :style="meterBlockStyle">
        <text :style="meterLabelStyle">{{ t.myDevices.inventorySlotsLabel }}</text>
        <text class="block" :style="meterCountStyle">—</text>
        <view class="flex items-center justify-center" :style="ctaStyle" style="margin-top: 12px" role="button" tabindex="0" @click="goStore" @keydown.enter.prevent="goStore" @keydown.space.prevent="goStore"><text :style="ctaLabelStyle">{{ t.myDevices.inventoryCtaGoStore }}</text></view>
      </view>
      <view v-if="inventoryReady" class="mx-4">
        <!-- Slot meter — de-carded: sits on the page floor. -->
        <view :style="meterBlockStyle" role="group" :aria-label="slotMeterLabel">
          <view class="flex items-center justify-between">
            <text :style="meterLabelStyle">{{ t.myDevices.inventorySlotsLabel }}</text>
            <view class="flex items-baseline" style="gap: 4px">
              <text :style="meterCountStyle">{{ slotsUsed === null ? '—' : slotsUsed }}</text>
              <text :style="meterMaxStyle">/ {{ app.slotCap }}</text>
            </view>
          </view>
          <view class="flex" style="gap: 6px; margin-top: 8px">
            <view v-for="i in app.slotCap" :key="i" :style="segStyle(i - 1)" />
          </view>
        </view>

        <!-- Trial and activated devices share one list; the count describes rows, not capacity. -->
        <view v-if="activeDevices.length > 0 || trialPresentation.active.value" class="device-inventory-section" data-inventory-section="devices">
          <view class="flex items-center justify-between" style="padding: 0 4px; margin-bottom: 8px">
            <text :style="sectionTitleStyle">{{ t.myDevices.inventorySectionDevices }}</text>
            <text :style="sectionCountStyle">{{ activeDevices.length + (trialPresentation.active.value ? 1 : 0) }}</text>
          </view>
          <view class="device-inventory-list">
            <TrialDeviceRow v-if="trialPresentation.active.value" key="trial:current" variant="inventory" :style="trialRowStyle" show-cancel :cancel-busy="cancelTrialBusy" @cancel="handleCancelTrial" />
            <DeviceInventoryRow
              v-for="d in activeDevices"
              :key="d.id"
              :device="d"
              :active="true"
              :runtime-confirmed="!remoteApiEnabled || app.remoteFleetStatus === 'ready' || app.remoteFleetStatus === 'loading'"
              :show-action="canControlDevice(d)"
              :activate-label="t.myDevices.inventoryRowActivate"
              :deactivate-label="t.myDevices.inventoryRowDeactivate"
              :slots-full-label="t.myDevices.inventoryRowSlotsFull"
              :pending-chip-label="t.myDevices.inventoryPendingDeactivateChip"
              :action-disabled="remoteApiEnabled && !!d.pendingDeactivate"
              v-bind="tradeinStrip(d)"
              @toggle="handleDeactivate(d)"
              @tradein="handleTradein(d)"
              @ladder="ladderDevice = d"
            />
          </view>
        </view>

        <!-- Inventory (purchased but not activated) -->
        <view v-if="inactiveDevices.length > 0" class="device-inventory-section" data-inventory-section="pending">
          <view class="flex items-center justify-between" style="padding: 0 4px; margin-bottom: 8px">
            <text :style="sectionTitleStyle">{{ t.myDevices.inventorySectionInventory }}</text>
            <text :style="sectionCountStyle">{{ inactiveDevices.length }}</text>
          </view>
          <view class="device-inventory-list">
            <DeviceInventoryRow
              v-for="d in inactiveDevices"
              :key="d.id"
              :device="d"
              :active="false"
              :show-action="canControlDevice(d)"
              :disabled="(slotsFull || !activationReady) && occupiesDeviceSlot(d.kind)"
              :disabled-label="slotsUsed === null || !activationReady ? slotUnavailableText : undefined"
              :activate-label="t.myDevices.inventoryRowActivate"
              :deactivate-label="t.myDevices.inventoryRowDeactivate"
              :slots-full-label="t.myDevices.inventoryRowSlotsFull"
              :pending-chip-label="t.myDevices.inventoryPendingDeactivateChip"
              v-bind="tradeinStrip(d)"
              @toggle="handleActivate(d)"
              @tradein="handleTradein(d)"
              @ladder="ladderDevice = d"
            />
          </view>
          <view v-if="slotsUsed !== null && slotsFull && inactiveDevices.some((d) => occupiesDeviceSlot(d.kind))" class="flex items-center" :style="slotsFullWarnStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
            <text>{{ t.myDevices.inventorySlotsFullWarning }}</text>
          </view>
        </view>

        <!-- Remote active lifecycle without activation time: support-visible, never activatable. -->
        <view v-if="unconfirmedDevices.length > 0" class="device-inventory-section" data-inventory-section="unconfirmed">
          <view class="flex items-center justify-between" style="padding: 0 4px; margin-bottom: 8px">
            <text :style="sectionTitleStyle">{{ t.myDevices.inventorySectionActivationUnconfirmed }}</text>
            <text :style="sectionCountStyle">{{ unconfirmedDevices.length }}</text>
          </view>
          <view class="device-inventory-list">
            <DeviceInventoryRow
              v-for="d in unconfirmedDevices"
              :key="d.id"
              :device="d"
              :active="false"
              :show-action="canControlDevice(d)"
              disabled
              :disabled-label="t.myDevices.inventoryActivationUnconfirmed"
              :activate-label="t.myDevices.inventoryRowActivate"
              :deactivate-label="t.myDevices.inventoryRowDeactivate"
              :slots-full-label="t.myDevices.inventoryRowSlotsFull"
              :pending-chip-label="t.myDevices.inventoryPendingDeactivateChip"
              v-bind="tradeinStrip(d)"
            />
          </view>
        </view>

        <!-- 空库存 —— 《06》的转化型空态 no-owned-asset:插画 + 引导 + 明确 CTA。
             空态自带 CTA,所以下面那个常驻「去商店」按钮此时收起,不重复两个同义按钮。 -->
        <EmptyState
          v-if="inventoryEmpty"
          kind="no-owned-asset"
          :title="t.empty.devicesTitle"
          :desc="t.empty.devicesDesc"
          :cta-label="t.empty.devicesCta"
          emphasis
          @cta="goStore"
        />

        <!-- Add-device CTA -->
        <view v-else class="flex items-center justify-center active:opacity-70" :style="ctaStyle" style="margin-top: 12px" role="button" tabindex="0" @click="goStore"  @keydown.enter.prevent="goStore" @keydown.space.prevent="goStore">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          <text :style="ctaLabelStyle">{{ t.myDevices.inventoryCtaGoStore }}</text>
        </view>

        <view class="device-inventory-section device-inventory-connections" data-inventory-section="connections">
          <view v-if="phoneNeedsActivation" :style="phoneActivationCardStyle">
            <view class="flex items-start" style="gap: 10px">
              <view class="grid place-items-center shrink-0" :style="phoneActivationIconStyle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="phoneActivationTitleStyle">{{ phoneActivationGuidance.title }}</text>
                <text class="block" :style="phoneActivationBodyStyle">{{ phoneActivationGuidance.body }}</text>
              </view>
            </view>
            <view v-if="nativePhoneAvailable" class="flex items-center justify-center active:opacity-70" :style="phoneActivationCtaStyle" role="button" tabindex="0" @click="goPhoneActivation"  @keydown.enter.prevent="goPhoneActivation" @keydown.space.prevent="goPhoneActivation">
              <text :style="phoneActivationCtaLabelStyle">{{ t.myDevices.phoneActivationCta }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <DeviceDeactivateSheet
      :device="sheetDevice"
      @wait="onSheetWait"
      @force="onSheetForce"
      @dismiss="sheetDevice = null"
    />
    <TradeinLadderSheet :device="ladderDevice" @close="ladderDevice = null" />
  </AppChassis>
</template>

<script setup lang="ts">
import { navReset, navTo, takeNavigationQuery } from "@/lib/route";
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { computed, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import DeviceInventoryRow from "@/components/me/device-inventory-row.vue";
import EmptyState from "@/components/empty-state.vue";
import DeviceDeactivateSheet from "@/components/me/device-deactivate-sheet.vue";
import TradeinLadderSheet from "@/components/me/tradein-ladder-sheet.vue";
import TrialDeviceRow from "@/components/trial-device-row.vue";
import { useTrialPresentation } from "@/composables/use-trial-presentation";
import { useDeviceDeactivation } from "@/composables/use-device-deactivation";
import { useTradeinStrip } from "@/composables/use-tradein-strip";
import { useTrialFleetCopy } from "@/i18n/trial-fleet";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";
import { hasNativePhoneRuntime } from "@/lib/native-phone-runtime";
import { resolvePhoneActivationGuidance } from "@/lib/phone-activation-guidance";
import { canControlDevice } from "@/lib/device-control-platform";
import { useFreeTrial } from "@/store/free-trial";
import type { Device } from "@/store/types";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { apiRuntimeConfig, remoteApiEnabled } from "@/api/runtime";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { productCatalogState } from "@/store/product-catalog";
import { refreshRemoteFleetAfterCatalog } from "@/lib/e3-fleet-bootstrap";
import { isActivatableInventoryDevice, occupiesDeviceSlot, requiresActivationConfirmation } from "@/lib/device-slot-policy";

const t = useT();
const app = useApp();
const session = useSession();
const nativePhoneAvailable = hasNativePhoneRuntime();
const phoneActivationGuidance = computed(() => resolvePhoneActivationGuidance(nativePhoneAvailable, t.value.myDevices));
const trial = useFreeTrial();
const trialPresentation = useTrialPresentation();
const trialCopy = useTrialFleetCopy();
const cancelTrialBusy = ref(false);

// A failed trial read cannot remove the account's previously confirmed devices.
// Slot counts and mutations have their own stricter readiness below.
const inventoryReady = computed(() => !remoteApiEnabled || app.remoteFleetHasSnapshot);
const inventoryError = computed(() => !inventoryReady.value && (app.remoteFleetStatus === "error"
  || trial.authorityStatus === "error"
  || (apiRuntimeConfig.environment === "dev" && productCatalogState.status === "error")));
const inventoryLoading = computed(() => !inventoryReady.value && !inventoryError.value);
const inventoryStale = computed(() => inventoryReady.value && remoteApiEnabled
  && (app.remoteFleetStatus === "error" || trial.authorityStatus === "error"));

function retryInventory() {
  void refreshRemoteFleetAfterCatalog(app.accountKey).catch(() => undefined);
  void trial.poll(Date.now());
}

const activeDevices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null));
const inactiveDevices = computed(() => app.visibleDevices.filter(isActivatableInventoryDevice));
const unconfirmedDevices = computed(() => app.visibleDevices.filter(requiresActivationConfirmation));
const inventoryEmpty = computed(() => activeDevices.value.length === 0
  && inactiveDevices.value.length === 0
  && unconfirmedDevices.value.length === 0 && !trialPresentation.active.value);
const phoneNeedsActivation = computed(() => {
  const phones = app.visibleDevices.filter((device) => device.kind === "phone");
  if (phones.some(requiresActivationConfirmation)) return true;
  return !phones.some((device) => device.activatedAt !== null)
    || app.remotePhoneBindingInvalid || !session.isCurrentDeviceCalibrated(app.accountKey);
});

// Trial reserves a slot too (shadow device, not in devices[]).
const trialReserved = trialPresentation.reservedSlots;
const slotsUsed = computed(() => trialReserved.value === null || (remoteApiEnabled && app.remoteFleetStatus !== "ready"
  && app.remoteFleetStatus !== "loading") ? null : app.activeSlotCount + trialReserved.value);
const slotsFull = computed(() => slotsUsed.value === null || slotsUsed.value >= app.slotCap);
const activationReady = computed(() => !remoteApiEnabled
  || (app.remoteFleetStatus === "ready" && trialPresentation.actionsReady.value));
const slotUnavailableText = computed(() => app.remoteFleetStatus === "error" || trial.authorityStatus === "error"
  ? trialCopy.value.slotsUnknown : trialCopy.value.slotsChecking);

const slotMeterLabel = computed(() =>
  slotsUsed.value === null ? slotUnavailableText.value
    : fmt(t.value.myDevices.inventorySlotMeter, { active: slotsUsed.value, max: app.slotCap }),
);

// Deactivate sheet (running-task branch) — page-driven (no chassis store).
const { sheetDevice, handleDeactivate, onSheetWait, onSheetForce, runRemoteDeviceCommand } = useDeviceDeactivation();
let deactivateRequest = 0;
onUnload(() => { deactivateRequest += 1; });
onLoad(async options => {
  const query = new URLSearchParams(takeNavigationQuery('/pages/me/devices'));
  const id = options?.deactivate || query.get('deactivate') || '';
  if (!id) return;
  const request = ++deactivateRequest;
  const scope = captureAccountScope();
  if (remoteApiEnabled && !await refreshRemoteFleetAfterCatalog(app.accountKey)) return;
  if (request !== deactivateRequest || !isCurrentAccountScope(scope)) return;
  const device = app.visibleDevices.find(item => item.id === id && item.activatedAt !== null);
  if (device) await handleDeactivate(device);
});

const ladderDevice = ref<Device | null>(null);
const { tradeinStrip, handleTradein } = useTradeinStrip();

async function handleActivate(d: Device) {
  if (!canControlDevice(d)) return;
  if (requiresActivationConfirmation(d)) {
    toast.warn(t.value.myDevices.inventoryActivationUnconfirmed);
    return;
  }
  if (d.kind === "phone") {
    goPhoneActivation();
    return;
  }
  if (occupiesDeviceSlot(d.kind) && (slotsUsed.value === null || !activationReady.value)) {
    toast.warn(slotUnavailableText.value);
    return;
  }
  if (occupiesDeviceSlot(d.kind) && slotsFull.value) {
    toast.warn(fmt(t.value.myDevices.inventoryToastSlotsFull, { max: app.slotCap }));
    return;
  }
  if (remoteApiEnabled) {
    await runRemoteDeviceCommand(d, "activate");
    return;
  }
  // Mock-only projection keeps the prototype slot simulation.
  const ok = app.activateDevice(d.id, trialReserved.value ?? 0);
  if (ok) {
    toast.success(fmt(t.value.myDevices.inventoryToastActivated, { deviceName: deviceName(t.value, d) }));
  } else {
    toast.warn(fmt(t.value.myDevices.inventoryToastSlotsFull, { max: app.slotCap }));
  }
}

function goPhoneActivation() {
  if (!nativePhoneAvailable) return;
  navTo("/pages/onboarding/connect?mode=recalibrate");
}

async function handleCancelTrial() {
  if (cancelTrialBusy.value || !trialPresentation.actionsReady.value || trial.status !== "active") return;
  const accountKey = app.accountKey;
  const bindingEpoch = app.accountBindingEpoch;
  cancelTrialBusy.value = true;
  try {
    const ok = await uiConfirm({
      title: t.value.trial.cancelConfirmTitle,
      message: t.value.trial.cancelConfirmMsg,
      confirmLabel: t.value.trial.cancelConfirmOk,
      cancelLabel: t.value.trial.cancelConfirmKeep,
    });
    if (!ok || accountKey !== app.accountKey || bindingEpoch !== app.accountBindingEpoch
      || !trialPresentation.actionsReady.value || trial.status !== "active") return;
    const result = await trial.cancel();
    if (accountKey !== app.accountKey || bindingEpoch !== app.accountBindingEpoch) return;
    if (result.ok) toast.info(t.value.trial.toastCancelled);
    else toast.warn(t.value.trial.cancelError);
  } finally {
    cancelTrialBusy.value = false;
  }
}

function goStore() {
  navReset({ url: "/pages/store/store", fail: () => {} });
}

// ── styles ──
function segStyle(i: number): CSSProperties {
  return {
    flex: 1,
    height: "6px",
    borderRadius: "999px",
    background: slotsUsed.value !== null && i < slotsUsed.value ? "var(--v5-brand)" : "var(--v5-surface-3)",
  };
}

// De-carded: slot meter sits on the page floor (2px optical inset).
const meterBlockStyle: CSSProperties = {
  padding: "0 2px",
};
const meterLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const meterCountStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const meterMaxStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-list-subtitle)",
  color: "var(--v5-ink-3)",
};
const trialRowStyle: CSSProperties = {
  boxShadow: "none",
  borderRadius: "0",
  background: "transparent",
};
const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  lineHeight: "18px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const sectionCountStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const slotsFullWarnStyle: CSSProperties = {
  gap: "6px",
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-warning)",
};
// Empty state (de-card whitelist): dashed outline, no fill.
const emptyCardStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "16px",
  border: "1px dashed var(--v5-border-strong)",
  padding: "32px 20px",
  textAlign: "center",
};
const emptyIconStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  margin: "0 auto",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
const emptyTitleStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-card-title)",
  fontWeight: "var(--ui-type-card-title-weight)",
  color: "var(--v5-ink)",
};
const emptyBodyStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.375,
};
const ctaStyle: CSSProperties = {
  gap: "6px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const ctaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-on-brand)",
};
const phoneActivationCardStyle: CSSProperties = {
  marginTop: "8px",
  borderRadius: "var(--ui-radius-surface)",
  border: "1px solid var(--v5-border)",
  background: "var(--v5-surface)",
  padding: "12px",
};
const phoneActivationIconStyle: CSSProperties = {
  width: "28px",
  height: "28px",
};
const phoneActivationTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  lineHeight: "18px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const phoneActivationBodyStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "var(--v5-ink-3)",
};
const phoneActivationCtaStyle: CSSProperties = {
  marginTop: "8px",
  minHeight: "44px",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
};
const phoneActivationCtaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  lineHeight: "18px",
  fontWeight: 500,
  color: "var(--v5-brand)",
};


</script>

<style scoped>
.device-inventory-section { margin-top: 18px; min-width: 0; }
.device-inventory-list { overflow: hidden; border: 1px solid var(--v5-border); border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.device-inventory-list > :deep(.device-inventory-row + .device-inventory-row),
.device-inventory-list > :deep(.trial-device-row + .device-inventory-row) { border-top: 1px solid var(--v5-border); }
.device-inventory-connections:empty { display: none; }
</style>
