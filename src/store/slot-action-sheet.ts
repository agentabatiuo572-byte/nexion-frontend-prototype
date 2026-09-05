import { defineStore } from "pinia";
import { ref } from "vue";
import { useApp } from "./app";

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
  function openForSlot() {
    const hasInactive = useApp().visibleDevices.some((d) => d.activatedAt === null);
    if (hasInactive) {
      open.value = true;
    } else {
      uni.navigateTo({ url: "/pages/store/store", fail: () => {} });
    }
  }

  return { open, show, hide, openForSlot };
});
