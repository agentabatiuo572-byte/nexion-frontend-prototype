import { defineStore } from "pinia";
import { ref } from "vue";
import { useApp } from "./app";
import { isPurchasedHardwareKind } from "./device-types";
import { remoteApiEnabled } from "@/api/runtime";
import { navTo } from "@/lib/route";

/**
 * Shared add-device choice from home, earn and account pages.
 * The inventory branch lives in openForSlot(), NOT in the sheet body: with an
 * empty warehouse the sheet would only duplicate its own "go to /store" CTA,
 * so triggers route straight to the store instead of opening it.
 *
 * Setup-style store with NO return-type annotation (P-017). Plain open/show/hide
 * toggle — no persistence (session-scoped overlay state).
 */
export const useSlotActionSheet = defineStore("slotActionSheet", () => {
  const open = ref(false);
  const checking = ref(false);
  let intent = 0;

  function currentPage() {
    try { const pages = getCurrentPages(); return pages[pages.length - 1]; }
    catch { return undefined; }
  }

  function show() {
    open.value = true;
  }

  function hide() {
    intent++;
    open.value = false;
  }

  /**
   * 所有槽位触发点(空槽图标 / 添加设备按钮)统一走这里,分支别写在调用侧:
   * 仓库有未激活设备 → 弹选择弹层;没有 → 直接进商城,不弹只剩一个购买按钮的空壳层。
   */
  async function openForSlot() {
    if (open.value || checking.value) return;
    checking.value = true;
    const app = useApp();
    const request = ++intent, page = currentPage(), account = app.accountKey;
    const isCurrent = () => request === intent && page === currentPage() && account === app.accountKey;
    try {
      const ready = !remoteApiEnabled || await app.refreshRemoteFleet();
      if (!isCurrent()) return;
      // Unknown inventory must not become a sales redirect. The warehouse owns retry and activation.
      if (!ready) {
        await navTo("/pages/me/devices");
        return;
      }
      const hasInactive = app.visibleDevices.some((d) => d.activatedAt === null && isPurchasedHardwareKind(d.kind));
      if (hasInactive) open.value = true;
      else await navTo("/store");
    } catch {
      if (isCurrent()) await navTo("/pages/me/devices");
    } finally {
      checking.value = false;
    }
  }

  return { open, checking, show, hide, openForSlot };
});
