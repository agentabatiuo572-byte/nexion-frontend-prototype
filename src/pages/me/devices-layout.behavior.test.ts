import * as Vue from "vue";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { expect, it, vi } from "vitest";
import source from "./devices.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const messages = { en, zh, vi: vietnamese };
const render = new Function("Vue", compile(parse(source).descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: () => true,
}).code)(Vue);
function nodes(node: Vue.VNode): Vue.VNode[] {
  return [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];
}
function mount(locale: keyof typeof messages = "en") {
  const paid = { id: "paid-1" }, pending = { id: "paid-2" }, unconfirmed = { id: "paid-3" };
  const context = {
    t: messages[locale], inventoryReady: true, inventoryLoading: false, inventoryError: false, inventoryStale: false,
    app: { slotCap: 6, remoteFleetStatus: "ready" }, slotMeterLabel: "3/6", slotsUsed: 3, segStyle: () => ({}),
    activeDevices: [paid], inactiveDevices: [pending], unconfirmedDevices: [unconfirmed], inventoryEmpty: false,
    trialPresentation: { active: { value: true } }, cancelTrialBusy: false, handleCancelTrial: vi.fn(),
    remoteApiEnabled: true, canControlDevice: () => true, tradeinStrip: () => ({}), occupiesDeviceSlot: () => true,
    handleActivate: vi.fn(), handleDeactivate: vi.fn(), handleTradein: vi.fn(), ladderDevice: null,
    slotsFull: false, activationReady: true, phoneNeedsActivation: true, nativePhoneAvailable: false,
    phoneActivationGuidance: { title: "Phone", body: "Connect in the Android app" }, goPhoneActivation: vi.fn(),
    goStore: vi.fn(), sheetDevice: null, onSheetWait: vi.fn(), onSheetForce: vi.fn(),
  };
  const node = () => render(context, []) as Vue.VNode;
  return { context, paid, pending, node };
}

it.each(["zh", "en", "vi"] as const)("places trial and purchased devices together before inventory and connection entries in %s", locale => {
  const screen = mount(locale), tree = nodes(screen.node());
  const sections = tree.filter(node => node.props?.["data-inventory-section"]);
  expect(sections.map(node => node.props!["data-inventory-section"])).toEqual(["devices", "pending", "unconfirmed", "connections"]);
  expect(tree.some(node => node.type === "ComputeShareEntry")).toBe(false);
  const fleet = nodes(sections[0]);
  expect(fleet.some(node => node.children === messages[locale].myDevices.inventorySectionDevices)).toBe(true);
  expect(fleet.some(node => node.type === "text" && node.children === "2")).toBe(true);
  expect(fleet.filter(node => ["TrialDeviceRow", "DeviceInventoryRow"].includes(String(node.type))).map(node => node.type)).toEqual(["TrialDeviceRow", "DeviceInventoryRow"]);
  screen.context.trialPresentation.active.value = false;
  expect(nodes(screen.node()).filter(node => node.type === "TrialDeviceRow")).toHaveLength(0);
  expect(screen.context.slotsUsed).toBe(3);
});

it("keeps original paid and trial action handlers and the native phone gate", () => {
  const screen = mount(), tree = nodes(screen.node());
  const rows = tree.filter(node => node.type === "DeviceInventoryRow");
  rows[0].props!.onToggle(); expect(screen.context.handleDeactivate).toHaveBeenCalledExactlyOnceWith(screen.paid);
  rows[1].props!.onToggle(); expect(screen.context.handleActivate).toHaveBeenCalledExactlyOnceWith(screen.pending);
  rows[0].props!.onTradein(); expect(screen.context.handleTradein).toHaveBeenCalledExactlyOnceWith(screen.paid);
  rows[0].props!.onLadder(); expect(screen.context.ladderDevice).toBe(screen.paid);
  tree.find(node => node.type === "TrialDeviceRow")!.props!.onCancel(); expect(screen.context.handleCancelTrial).toHaveBeenCalledTimes(1);
  const phoneCta = () => nodes(screen.node()).find(node => Array.isArray(node.children)
    && node.children.some(child => Vue.isVNode(child) && child.children === en.myDevices.phoneActivationCta));
  expect(phoneCta()).toBeUndefined();
  screen.context.nativePhoneAvailable = true;
  phoneCta()!.props!.onClick(); expect(screen.context.goPhoneActivation).toHaveBeenCalledTimes(1);
});
