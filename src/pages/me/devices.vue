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

      <view class="mx-4" :style="slotCaptionStyle">
        <text class="block" :style="subtitleStyle">{{ slotMeterLabel }}</text>
      </view>

      <view class="mx-4">
        <!-- Slot meter — de-carded: sits on the page floor. -->
        <view :style="meterBlockStyle">
          <view class="flex items-center justify-between">
            <text :style="meterLabelStyle">{{ t.myDevices.inventorySlotsLabel }}</text>
            <view class="flex items-baseline" style="gap: 4px">
              <text :style="meterCountStyle">{{ slotsUsed }}</text>
              <text :style="meterMaxStyle">/ {{ MAX_DEVICES }}</text>
            </view>
          </view>
          <view class="flex" style="gap: 6px; margin-top: 8px">
            <view v-for="i in MAX_DEVICES" :key="i" :style="segStyle(i - 1)" />
          </view>
        </view>

        <ComputeShareEntry context="devices" />

        <!-- Trial device — NexGridBox S1 on free trial (shadow, not a real device).
             Cancel-trial lives here in device management. -->
        <view v-if="trialActive" class="overflow-hidden" :style="trialCardStyle">
          <view class="flex items-center" style="gap: 12px; padding: 12px 16px">
            <view class="grid place-items-center shrink-0" :style="trialIconBoxStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center" style="gap: 6px">
                <text class="truncate" :style="trialNameStyle">NexGridBox S1</text>
                <text :style="trialBadgeStyle">{{ t.trial.ghostBadge }}</text>
              </view>
              <text class="block" :style="trialSubStyle">{{ t.trial.deviceRowSub }}</text>
            </view>
          </view>
          <!-- Spec ④: user cancel exists on the active edge only — grace has
               nothing running to cancel (production already stopped). -->
          <view v-if="trial.status === 'active'" class="w-full flex items-center justify-center active:opacity-80" :style="trialCancelStyle" @click="handleCancelTrial">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>
            <text :style="trialCancelLabelStyle">{{ t.trial.cancelCta }}</text>
          </view>
        </view>

        <!-- Active fleet -->
        <view v-if="activeDevices.length > 0" style="margin-top: 12px">
          <view class="flex items-center justify-between" style="padding: 0 4px; margin-bottom: 8px">
            <text :style="sectionTitleStyle">{{ t.myDevices.inventorySectionActive }}</text>
            <text :style="sectionCountStyle">{{ activeDevices.length }}</text>
          </view>
          <view style="display: flex; flex-direction: column; gap: 8px">
            <DeviceInventoryRow
              v-for="d in activeDevices"
              :key="d.id"
              :device="d"
              :active="true"
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
        <view v-if="inactiveDevices.length > 0" style="margin-top: 12px">
          <view class="flex items-center justify-between" style="padding: 0 4px; margin-bottom: 8px">
            <text :style="sectionTitleStyle">{{ t.myDevices.inventorySectionInventory }}</text>
            <text :style="sectionCountStyle">{{ inactiveDevices.length }}</text>
          </view>
          <view style="display: flex; flex-direction: column; gap: 8px">
            <DeviceInventoryRow
              v-for="d in inactiveDevices"
              :key="d.id"
              :device="d"
              :active="false"
              :disabled="slotsFull"
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
          <view v-if="slotsFull" class="flex items-center" :style="slotsFullWarnStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
            <text>{{ t.myDevices.inventorySlotsFullWarning }}</text>
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
        <view v-else class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" style="margin-top: 12px" @click="goStore">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          <text :style="ctaLabelStyle">{{ t.myDevices.inventoryCtaGoStore }}</text>
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
import { computed, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import DeviceInventoryRow from "@/components/me/device-inventory-row.vue";
import EmptyState from "@/components/empty-state.vue";
import DeviceDeactivateSheet from "@/components/me/device-deactivate-sheet.vue";
import TradeinLadderSheet from "@/components/me/tradein-ladder-sheet.vue";
import ComputeShareEntry from "@/components/earn/compute-share-entry.vue";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useFreeTrial } from "@/store/free-trial";
import { useTradeinSheet } from "@/store/tradein-sheet";
import { MAX_DEVICES } from "@/store/device-types";
import { PRODUCTS } from "@/mock/products";
import { computeTradeInCredit, TRADEIN_LADDER_RULES, DEFAULT_TRADEIN_CONFIG } from "@/mock/tradein-config";
import { isDeviceTaskBlocked } from "@/mock/eligibility";
import { getMonthsSince, isTradeInTargetAvailable } from "@/store/product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import type { Device } from "@/store/types";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { deviceE3Api, remoteApiEnabled } from "@/api/runtime";
import { isSettledRejection } from "@/api/errors";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { acquireDeviceCommandKey, finishDeviceCommand } from "@/lib/device-command-key";
import { isProductAvailable } from "@/store/product-availability";
import { refreshProductCatalog } from "@/store/product-catalog";

const t = useT();
const app = useApp();
const trial = useFreeTrial();
const deferredCommandInFlight = ref<Set<string>>(new Set());

function deferredCommandSlot(device: Device, accountKey: string, version: number): string {
  return `${accountKey.trim().toLowerCase()}:deactivate-after-task:${device.id}:${version}`;
}

function deferredCommandBusy(device: Device): boolean {
  if (!Number.isSafeInteger(device.rowVersion) || Number(device.rowVersion) < 0) return false;
  return deferredCommandInFlight.value.has(deferredCommandSlot(device, app.accountKey, Number(device.rowVersion)));
}

// Typed against TrialStatus so a future enum change fails tsc here instead of
// silently widening to string[] (FEAT-TRIAL02 audit trap).
const trialActive = computed(() => trial.status === "active" || trial.status === "grace");
const activeDevices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null));
const inactiveDevices = computed(() => app.visibleDevices.filter((d) => d.activatedAt === null));
const inventoryEmpty = computed(() => activeDevices.value.length === 0 && inactiveDevices.value.length === 0);

// Trial reserves a slot too (shadow device, not in devices[]).
const trialReserved = computed(() => (trialActive.value ? 1 : 0));
const slotsUsed = computed(() => app.activeSlotCount + trialReserved.value);
const slotsFull = computed(() => slotsUsed.value >= MAX_DEVICES);

const slotMeterLabel = computed(() =>
  fmt(t.value.myDevices.inventorySlotMeter, { active: slotsUsed.value, max: MAX_DEVICES }),
);

// Deactivate sheet (running-task branch) — page-driven (no chassis store).
const sheetDevice = ref<Device | null>(null);

// ── FEAT-DEV02 升级置换条 ──────────────────────────────────────────────
// 总开关关 / 免费设备(paidPriceUsdt=0)/不在 applyTo 白名单 → 返回空对象 =
// 行内零痕迹;无合规目标 → 只给禁用原因;其余给「可抵 $X」chip + 置换 CTA。
// 默认规则(promoMult=1)下抵扣额与目标无关,取最低升级价参与计算即为真值;
// promoMult>≈1.47 时 clamp 才可能绑定,届时各面按各自目标价如实显示。
const tradeinSheet = useTradeinSheet();
const ladderDevice = ref<Device | null>(null);
// 上架节奏门(FEAT-DEV02b):未正式上架且不在抢先购窗口的 SKU 不算升级目标。
const phase = useProductPhase();
const monthsSinceJoin = computed(() => getMonthsSince(app.user.joinedAt));
const remoteEligibleSourceIds = ref<Set<number>>(new Set());
const remoteEligibilityReady = ref(!remoteApiEnabled);

async function refreshRemoteTradeinEligibility(): Promise<void> {
  if (!remoteApiEnabled) return;
  const accountKey = app.accountKey;
  remoteEligibilityReady.value = false;
  remoteEligibleSourceIds.value = new Set();
  try {
    if (!(await refreshProductCatalog(true)) || accountKey !== app.accountKey) return;
    const targets = PRODUCTS.filter((product) => isProductAvailable(product, phase.value));
    const snapshots = await Promise.all(targets.map((product) => deviceE3Api.eligibility(product.id)));
    if (accountKey !== app.accountKey) return;
    remoteEligibleSourceIds.value = new Set(snapshots.flatMap((snapshot) => snapshot.sources
      .filter((source) => source.eligible)
      .map((source) => source.sourceDeviceId)));
    remoteEligibilityReady.value = true;
  } catch {
    if (accountKey === app.accountKey) remoteEligibleSourceIds.value = new Set();
  }
}

watch(() => app.accountKey, () => { void refreshRemoteTradeinEligibility(); }, { immediate: true });

function tradeinStrip(d: Device): {
  tradeinCreditText?: string;
  tradeinCtaLabel?: string;
  tradeinDisabledText?: string;
} {
  if (remoteApiEnabled) {
    if (!remoteEligibilityReady.value || !remoteEligibleSourceIds.value.has(Number(d.id))) return {};
    return {
      tradeinCreditText: t.value.tradein.remoteQuoteCreditLabel,
      tradeinCtaLabel: t.value.tradein.stripCta,
    };
  }
  if (!DEFAULT_TRADEIN_CONFIG.enabled) return {};
  const paid = d.paidPriceUsdt ?? 0;
  if (paid <= 0 || !TRADEIN_LADDER_RULES.applyTo.includes(d.kind)) return {};
  const targets = PRODUCTS.filter(
    (p) =>
      (!TRADEIN_LADDER_RULES.requireHigherPrice || p.price > paid) &&
      isTradeInTargetAvailable(p.unlocksAtPhase, phase.value, monthsSinceJoin.value),
  );
  if (targets.length === 0) return { tradeinDisabledText: t.value.tradein.stripNoTarget };
  const credit = computeTradeInCredit(
    paid,
    Math.max(0, d.cumulativeEarningsUsdt ?? 0),
    Math.min(...targets.map((p) => p.price)),
  );
  return {
    tradeinCreditText: fmt(t.value.tradein.stripCredit, { credit: credit.toFixed(2) }),
    tradeinCtaLabel: t.value.tradein.stripCta,
  };
}

function handleTradein(d: Device) {
  // 激活中且任务运行:阻断层(完成后可下架,查看任务/知道了),不硬拆(规格
  // DEV02A 异常2)。库存机的出厂任务不在跑,不阻断——判定单源 isDeviceTaskBlocked。
  if (isDeviceTaskBlocked(d)) {
    tradeinSheet.showRetireBlock(d.id, deviceName(t.value, d));
    return;
  }
  tradeinSheet.showRetire(d.id);
}

async function handleActivate(d: Device) {
  if (slotsFull.value) {
    toast.warn(fmt(t.value.myDevices.inventoryToastSlotsFull, { max: MAX_DEVICES }));
    return;
  }
  if (remoteApiEnabled) {
    await runRemoteDeviceCommand(d, "activate");
    return;
  }
  // Mock-only projection keeps the prototype slot simulation.
  const ok = app.activateDevice(d.id, trialReserved.value);
  if (ok) {
    toast.success(fmt(t.value.myDevices.inventoryToastActivated, { deviceName: deviceName(t.value, d) }));
  } else {
    toast.warn(fmt(t.value.myDevices.inventoryToastSlotsFull, { max: MAX_DEVICES }));
  }
}

async function handleDeactivate(d: Device) {
  if (remoteApiEnabled && deferredCommandBusy(d)) return;
  if (remoteApiEnabled && d.pendingDeactivate) {
    toast.info(fmt(t.value.deactivateSheet.toastScheduled, { name: deviceName(t.value, d) }));
    return;
  }
  // Running task → dedicated sheet offering wait / force / cancel.
  if (d.currentTask) {
    sheetDevice.value = d;
    return;
  }
  const ok = await uiConfirm({
    title: fmt(t.value.myDevices.inventoryConfirmDeactivateTitle, { deviceName: deviceName(t.value, d) }),
    message: t.value.myDevices.inventoryConfirmDeactivateMsg,
    confirmLabel: t.value.myDevices.inventoryConfirmDeactivateOk,
    cancelLabel: t.value.myDevices.inventoryConfirmDeactivateCancel,
  });
  if (ok && remoteApiEnabled) await runRemoteDeviceCommand(d, "deactivate");
  else if (ok) {
    if (app.deactivateDevice(d.id)) toast.success(fmt(t.value.myDevices.inventoryToastDeactivated, { deviceName: deviceName(t.value, d) }));
    else toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg); // 没落盘 = 没停用,设备还在跑,别宣布已停用
  }
}

function onSheetWait() {
  const d = sheetDevice.value;
  if (!d) return;
  if (remoteApiEnabled) {
    void runRemoteDeferredCommand(d);
    return;
  }
  app.scheduleDeactivation(d.id);
  toast.success(fmt(t.value.deactivateSheet.toastScheduled, { name: deviceName(t.value, d) }));
  sheetDevice.value = null;
}

async function runRemoteDeferredCommand(d: Device): Promise<boolean> {
  if (!Number.isSafeInteger(d.rowVersion) || Number(d.rowVersion) < 0) {
    toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
    return false;
  }
  const accountKey = app.accountKey;
  const scope = captureAccountScope();
  const version = Number(d.rowVersion);
  const slot = deferredCommandSlot(d, accountKey, version);
  if (deferredCommandInFlight.value.has(slot)) return false;
  deferredCommandInFlight.value.add(slot);
  sheetDevice.value = null;
  const key = acquireDeviceCommandKey(accountKey, "deactivate-after-task", d.id, version);
  const current = () => isCurrentAccountScope(scope) && accountKey === app.accountKey;
  const confirmed = (status: "PENDING_DEACTIVATE" | "DEACTIVATED") => {
    if (!current()) return false;
    const row = app.devices.find((entry) => entry.id === d.id);
    if (!row) return status === "DEACTIVATED";
    return status === "DEACTIVATED" ? row.activatedAt === null : row.activatedAt !== null;
  };
  const finish = (status: "PENDING_DEACTIVATE" | "DEACTIVATED") => {
    finishDeviceCommand(accountKey, "deactivate-after-task", d.id, version);
    toast.success(status === "PENDING_DEACTIVATE"
      ? fmt(t.value.deactivateSheet.toastScheduled, { name: deviceName(t.value, d) })
      : fmt(t.value.myDevices.inventoryToastDeactivated, { deviceName: deviceName(t.value, d) }));
  };
  try {
    toast.info(t.value.deactivateSheet.toastSubmitting);
    const result = await deviceE3Api.deactivateAfterTask(Number(d.id), version, key);
    if (result.status === "ACTIVE") throw new Error("DEVICE_DEFERRED_RESPONSE_INVALID");
    if (!current()) return false;
    if (!await app.refreshRemoteFleet() || !confirmed(result.status)) {
      throw new Error("DEVICE_DEFERRED_DEACTIVATION_NOT_CONFIRMED");
    }
    finish(result.status);
    return true;
  } catch (cause) {
    // A lost response or 409 is retried with the same durable key first. A
    // successful replay proves the command was accepted without a duplicate.
    try {
      const replay = await deviceE3Api.deactivateAfterTask(Number(d.id), version, key);
      if (replay.status === "ACTIVE") throw new Error("DEVICE_DEFERRED_RESPONSE_INVALID");
      if (current() && await app.refreshRemoteFleet() && confirmed(replay.status)) {
        finish(replay.status);
        return true;
      }
    } catch {
      // Continue to the authoritative fleet readback below.
    }
    try {
      if (current() && await app.refreshRemoteFleet()) {
        const row = app.devices.find((entry) => entry.id === d.id);
        if (current() && row?.activatedAt === null) {
          finish("DEACTIVATED");
          return true;
        }
      }
    } catch {
      // Keep the stable key while command and readback remain uncertain.
    }
    if (isSettledRejection(cause)) finishDeviceCommand(accountKey, "deactivate-after-task", d.id, version);
    if (current()) toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
    return false;
  } finally {
    deferredCommandInFlight.value.delete(slot);
  }
}

async function onSheetForce() {
  const d = sheetDevice.value;
  if (!d) return;
  if (remoteApiEnabled) await runRemoteDeviceCommand(d, "deactivate");
  else if (app.deactivateDevice(d.id)) {
    toast.warn(fmt(t.value.deactivateSheet.toastForced, { name: deviceName(t.value, d) }));
  } else {
    toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
  }
  sheetDevice.value = null;
}

async function handleCancelTrial() {
  const ok = await uiConfirm({
    title: t.value.trial.cancelConfirmTitle,
    message: t.value.trial.cancelConfirmMsg,
    confirmLabel: t.value.trial.cancelConfirmOk,
    cancelLabel: t.value.trial.cancelConfirmKeep,
  });
  if (ok) {
    const result = await trial.cancel();
    if (result?.ok) toast.info(t.value.trial.toastCancelled);
    else toast.warn(t.value.trial.cancelError);
  }
}

async function runRemoteDeviceCommand(d: Device, operation: "activate" | "deactivate"): Promise<boolean> {
  if (!Number.isSafeInteger(d.rowVersion) || Number(d.rowVersion) < 0) {
    toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
    return false;
  }
  const accountKey = app.accountKey;
  const version = Number(d.rowVersion);
  const key = acquireDeviceCommandKey(accountKey, operation, d.id, version);
  const expectedActive = operation === "activate";
  const confirmed = () => {
    if (accountKey !== app.accountKey) return false;
    const current = app.devices.find((entry) => entry.id === d.id);
    return Boolean(current) && (current!.activatedAt !== null) === expectedActive;
  };
  try {
    if (operation === "activate") {
      await deviceE3Api.activate(Number(d.id), version, MAX_DEVICES, key);
    } else {
      await deviceE3Api.deactivate(Number(d.id), version, key);
    }
    await app.refreshRemoteFleet();
    if (!confirmed()) throw new Error(operation === "activate"
      ? "DEVICE_ACTIVATION_NOT_CONFIRMED"
      : "DEVICE_DEACTIVATION_NOT_CONFIRMED");
    finishDeviceCommand(accountKey, operation, d.id, version);
    const message = operation === "activate"
      ? fmt(t.value.myDevices.inventoryToastActivated, { deviceName: deviceName(t.value, d) })
      : fmt(t.value.myDevices.inventoryToastDeactivated, { deviceName: deviceName(t.value, d) });
    toast.success(message);
    return true;
  } catch (cause) {
    try {
      await app.refreshRemoteFleet();
      if (confirmed()) {
        finishDeviceCommand(accountKey, operation, d.id, version);
        const message = operation === "activate"
          ? fmt(t.value.myDevices.inventoryToastActivated, { deviceName: deviceName(t.value, d) })
          : fmt(t.value.myDevices.inventoryToastDeactivated, { deviceName: deviceName(t.value, d) });
        toast.success(message);
        return true;
      }
    } catch {
      // Preserve the original command key while both command and readback remain uncertain.
    }
    if (isSettledRejection(cause)) finishDeviceCommand(accountKey, operation, d.id, version);
    toast.error(t.value.myDevices.inventoryRemoteMutationFailed);
    return false;
  }
}

function goStore() {
  uni.reLaunch({ url: "/pages/store/store", fail: () => {} });
}

// ── styles ──
function segStyle(i: number): CSSProperties {
  return {
    flex: 1,
    height: "6px",
    borderRadius: "999px",
    background: i < slotsUsed.value ? "var(--v5-brand)" : "var(--v5-surface-3)",
  };
}

// Lead caption sits at the content edge (2px inset); no top margin (global gap).
const slotCaptionStyle: CSSProperties = {
  padding: "0 2px",
  marginBottom: "10px",
};
const subtitleStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
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
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
// De-carded device card (form b): filled surface, no border.
const trialCardStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const trialIconBoxStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
};
const trialNameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const trialBadgeStyle: CSSProperties = {
  padding: "1px 6px",
  borderRadius: "4px",
  background: "color-mix(in oklab, var(--v5-brand-2) 16%, transparent)",
  color: "var(--v5-brand-2)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};
const trialSubStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const trialCancelStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  borderTop: "1px solid var(--v5-border)",
};
const trialCancelLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
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
  fontSize: "15px",
  fontWeight: 600,
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
</script>
