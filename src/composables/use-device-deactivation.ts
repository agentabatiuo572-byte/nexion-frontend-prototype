import { ref } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { deviceName } from "@/lib/device-copy";
import { canControlDevice } from "@/lib/device-control-platform";
import { useApp } from "@/store/app";
import type { Device } from "@/store/types";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { deviceE3Api, remoteApiEnabled } from "@/api/runtime";
import { isSettledRejection } from "@/api/errors";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { acquireDeviceCommandKey, finishDeviceCommand } from "@/lib/device-command-key";

/**
 * 取消激活(及仓库激活)的单一实现:设备仓库行与赚取页设备操作面板共用。
 * 无任务 → 二次确认;有任务 → `sheetDevice` 驱动 DeviceDeactivateSheet
 * (等任务完成 / 强制停用 / 返回),由调用方就地挂载该弹层。
 */
export function useDeviceDeactivation() {
  const t = useT();
  const app = useApp();
  const deferredCommandInFlight = ref<Set<string>>(new Set());
  const sheetDevice = ref<Device | null>(null);

  function deferredCommandSlot(device: Device, accountKey: string, version: number): string {
    return `${accountKey.trim().toLowerCase()}:deactivate-after-task:${device.id}:${version}`;
  }

  function deferredCommandBusy(device: Device): boolean {
    if (!Number.isSafeInteger(device.rowVersion) || Number(device.rowVersion) < 0) return false;
    return deferredCommandInFlight.value.has(deferredCommandSlot(device, app.accountKey, Number(device.rowVersion)));
  }

  async function handleDeactivate(d: Device) {
    if (!canControlDevice(d)) return;
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
    if (!d || !canControlDevice(d)) return;
    if (remoteApiEnabled) {
      void runRemoteDeferredCommand(d);
      return;
    }
    app.scheduleDeactivation(d.id);
    toast.success(fmt(t.value.deactivateSheet.toastScheduled, { name: deviceName(t.value, d) }));
    sheetDevice.value = null;
  }

  async function runRemoteDeferredCommand(d: Device): Promise<boolean> {
    if (!canControlDevice(d)) return false;
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
    if (!d || !canControlDevice(d)) return;
    if (remoteApiEnabled) await runRemoteDeviceCommand(d, "deactivate");
    else if (app.deactivateDevice(d.id)) {
      toast.warn(fmt(t.value.deactivateSheet.toastForced, { name: deviceName(t.value, d) }));
    } else {
      toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
    }
    sheetDevice.value = null;
  }

  async function runRemoteDeviceCommand(d: Device, operation: "activate" | "deactivate"): Promise<boolean> {
    if (!canControlDevice(d)) return false;
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
        await deviceE3Api.activate(Number(d.id), version, app.slotCap, key);
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

  return { sheetDevice, deferredCommandBusy, handleDeactivate, onSheetWait, onSheetForce, runRemoteDeviceCommand };
}
