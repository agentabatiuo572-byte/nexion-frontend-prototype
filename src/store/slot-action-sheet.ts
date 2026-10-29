import { navTo } from "@/lib/route";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useApp } from "./app";
import { isActivatableInventoryDevice, requiresActivationConfirmation } from "@/lib/device-slot-policy";
import { remoteApiEnabled } from "@/api/runtime";
import { toast } from "./ui";
import { useT } from "@/i18n/use-t";

/**
 * Slot-action sheet — opened from /earn (empty slot tile / add-device CTA).
 * The inventory branch lives in openForSlot(), NOT in the sheet body: with an
 * empty warehouse the sheet would only duplicate its own "go to /store" CTA,
 * so triggers route straight to the store instead of opening it.
 *
 * Setup-style store with NO return-type annotation (P-017). Plain open/show/hide
 * toggle — no persistence (session-scoped overlay state).
 */
export const useSlotActionSheet = defineStore("slotActionSheet", () => {
  const open = ref(false);
  const t = useT();
  let checking = false;

  function show() {
    open.value = true;
  }

  function hide() {
    open.value = false;
  }

  /**
   * 所有槽位触发点(空槽图标 / 添加设备按钮)统一走这里,分支别写在调用侧:
   * 仓库有未激活设备 → 弹选择弹层;没有 → 直接进商城,不弹只剩一个购买按钮的空壳层。
   */
  async function openForSlot() {
    if (checking) return;
    const app = useApp();
    const accountKey = app.accountKey;
    if (remoteApiEnabled && app.remoteFleetStatus !== "ready") {
      checking = true;
      const ready = await app.refreshRemoteFleet();
      checking = false;
      if (accountKey !== app.accountKey) return;
      if (!ready) {
        toast.error(t.value.myDevices.inventoryStaleWarning);
        return;
      }
    }
    const hasInactive = app.visibleDevices.some(
      (d) => isActivatableInventoryDevice(d) || requiresActivationConfirmation(d),
    );
    if (hasInactive) {
      open.value = true;
    } else {
      navTo("/pages/store/store");
    }
  }

  return { open, show, hide, openForSlot };
});
