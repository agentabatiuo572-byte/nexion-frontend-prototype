import * as Vue from "vue";
import * as tabLifecycle from "@/composables/use-tab-page-lifecycle";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from "@/lib/usd-display";
import { deviceStatisticsCapabilityCopy } from "@/i18n/device-statistics-capability";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("@dcloudio/uni-app", () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() }));
import source from "./device-card-pc.vue?raw";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import * as deadline from "@/lib/server-deadline-clock";
import * as phoneGuidance from "@/lib/phone-activation-guidance";
import * as deviceTypes from "@/store/device-types";
import * as workload from "@/lib/workload-label";
import * as confirmation from "@/lib/task-result-confirmation";
import * as deviceCopy from "@/lib/device-copy";
import * as lifecycle from "@/store/device-lifecycle";
import * as interrupt from "@/store/interrupt";
import * as hashpower from "@/lib/hashpower";
import * as capability from "@/lib/device-capability";
import * as completions from "@/lib/today-completed-tasks";
import { fmt } from "@/i18n/format";
import { en, type Messages } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { Device } from "@/store/types";

// Compile the actual card and invoke its rendered handlers. Only unrelated
// services/artwork are inert; display helpers and the shared explainer are real.
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ""): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (target, value) => { target.text = value; },
  setElementText: (target, value) => { target.text = value; target.children = []; },
  patchProp: (target, key, _previous, next) => { target.props[key] = next; },
  parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
  insert: (target, parent, anchor) => {
    if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target);
    target.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(target); else parent.children.splice(index, 0, target);
  },
  remove: target => { if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const find = (root: Host, name: string) => all(root).find(entry => String(entry.props.class ?? "").split(/\s+/).includes(name));
const unmounts: Array<() => void> = [];
const now = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); useCapacityExplainer().close(); });
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); useCapacityExplainer().close(); vi.useRealTimers(); });

function cloudDevice(): Device {
  return { id: "render-cloud", rowVersion: 1, kind: "cloud-share", name: "Cloud Share", gpu: "RTX 4090",
    vramTotal: 96, basePower: 1200, baseRate: 100, baseRateNEX: 50, purchasedAt: now - 172_800_000,
    activatedAt: now - 172_800_000, status: "offline", runtimeStatus: "OFFLINE", gpuUsage: 0,
    gpuTemp: 0, gpuPower: 0, vramUsed: 0, currentTask: null, recentTasks: [],
    todayEarnings: 0, todayEarningsNEX: 0, cumulativeEarningsUsdt: 0, paidPriceUsdt: 0, capacitySource: "server" };
}

async function mount(copy: Messages = zh, device = cloudDevice(), expanded = false, native = true, calibrated = true) {
  const navTo = vi.fn();
  const setPhoneRuntime = vi.fn();
  const toggle = vi.fn();
  const app = Vue.reactive({ accountKey: "render-only", visibleDevices: [device], remotePhoneBindingInvalid: false, setPhoneRuntime });
  const blank = Vue.defineComponent({ setup: () => () => Vue.h("view") });
  const dependencies: Record<string, unknown> = { '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
    "@/composables/use-tab-page-lifecycle": tabLifecycle,
    "@/lib/amount-display": { formatAmount },
    "@/lib/usd-display": { formatUsd },
    "@/i18n/device-statistics-capability": { useDeviceStatisticsCapabilityCopy: () => Vue.ref(deviceStatisticsCapabilityCopy[copy === zh ? "zh" : copy === vietnamese ? "vi" : "en"]) },
    vue: Vue, "@/components/home/device-slot.vue": { __esModule: true, default: blank },
    "@/components/ui/nx-button.vue": { __esModule: true, default: blank },
    "@/store/app": { useApp: () => app },
    "@/store/session": { useSession: () => ({ isCurrentDeviceCalibrated: () => calibrated }) },
    "@/store/config": { useConfig: () => ({ config: { onlineBonus: {} } }) },
    "@/store/earn-config": { prepareEarnConfig: () => {}, useEarnConfig: () => ({ lockedTeasers: () => [], averageEligibleReward: () => 1 }) },
    "@/lib/native-phone-runtime": { hasNativeAndroidPhoneRuntime: () => native, hasNativePhoneRuntime: () => native, nativePhonePlatform: () => null },
    "@/api/runtime": { remoteApiEnabled: true }, "@/i18n/use-t": { useT: () => Vue.ref(copy) },
    "@/lib/route": { navTo }, "@/composables/use-capacity-explainer": { useCapacityExplainer },
    "@/lib/server-deadline-clock": deadline, "@/lib/phone-activation-guidance": phoneGuidance,
    "@/store/device-types": deviceTypes, "@/lib/workload-label": workload,
    "@/lib/task-result-confirmation": confirmation, "@/lib/device-copy": deviceCopy,
    "@/store/device-lifecycle": lifecycle, "@/store/interrupt": interrupt,
    "@/lib/hashpower": hashpower, "@/lib/device-capability": capability,
    "@/lib/today-completed-tasks": completions, "@/i18n/format": { fmt },
  };
  const script = compileScript(parse(source).descriptor, { id: "card-scroll-longpress", inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false } } });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as { default: Component } };
  new Function("require", "module", "exports", code)((key: string) => {
    if (!(key in dependencies)) throw new Error(`Unexpected CardPC import: ${key}`);
    return dependencies[key];
  }, module, module.exports);
  const root = node();
  const tabVisit = tabLifecycle.createTabLifecycle({}, true);
  const instance = renderer.createApp({ setup() {
    Vue.provide(tabLifecycle.TAB_LIFECYCLE, tabVisit);
    return () => Vue.h(module.exports.default, { device, expanded, onToggle: toggle });
  } });
  instance.mount(root);
  let mounted = true;
  const unmount = () => { if (mounted) { instance.unmount(); mounted = false; } };
  unmounts.push(unmount);
  await Vue.nextTick();
  return { root, device, toggle, navTo, setPhoneRuntime, unmount, hide: () => tabVisit.setVisible(false), show: () => tabVisit.setVisible(true) };
}

test.each([en, zh, vietnamese])("uses Online only for confirmed running cards", async copy => {
  for (const kind of ["stellarbox-s1", "phone"] as const) {
    const device = Vue.reactive({ ...cloudDevice(), kind, status: "online", runtimeStatus: "ONLINE" } as Device);
    const card = await mount(copy, device, true);
    const assertStatus = (label: string, online: boolean) => {
      expect(text(find(card.root, "nx-device-status-label")!)).toBe(label);
      expect(all(card.root).filter(entry => String(entry.props.class ?? "").split(/\s+/).includes("device-status-online"))).toHaveLength(online ? 1 : 0);
    };
    assertStatus("Online", true);
    // The last local status must not override the current server conclusion.
    device.runtimeStatus = "OFFLINE"; await Vue.nextTick(); assertStatus(copy.earn.offline, false);
    device.runtimeStatus = "UNKNOWN"; await Vue.nextTick(); assertStatus(copy.earn.runtimeUnknown, false);
    device.runtimeStatus = "ONLINE";
    if (kind === "phone") {
      device.interruptedAt = now; await Vue.nextTick(); assertStatus(copy.earn.reconnecting, false);
      device.interruptedAt = null;
      device.currentTask = { id: "paused-task", category: "LL", type: "LLM inference", model: "Llama", client: "UVEL", location: "Device",
        totalSec: 120, startedAt: now, reward: 0, status: "PAUSED" };
      await Vue.nextTick(); assertStatus(copy.earn.phoneTaskPaused, false);
      device.currentTask = null; device.pausedReason = "low-battery";
      await Vue.nextTick(); assertStatus(copy.earn.idle, false);
      device.pausedReason = null;
    }
    device.pendingDeactivate = true; await Vue.nextTick(); assertStatus(copy.myDevices.inventoryPendingDeactivateChip, false);
    device.pendingDeactivate = false; await Vue.nextTick(); assertStatus("Online", true);
  }
});

test("the retained device clock stops while hidden and resumes without duplicate intervals", async () => {
  const card = await mount();
  const shown = vi.getTimerCount();
  card.hide(); expect(vi.getTimerCount()).toBe(shown - 1);
  card.show(); expect(vi.getTimerCount()).toBe(shown);
  card.show(); expect(vi.getTimerCount()).toBe(shown);
  card.unmount(); expect(vi.getTimerCount()).toBe(shown - 1);
});

for (const copy of [en, zh, vietnamese]) {
  test(`${copy.earn.hashCapability}: missing server phone capacity is compact and a later valid value recovers`, async () => {
    const phone = Vue.reactive({ ...cloudDevice(), kind: "phone", capabilityTops: undefined }) as Device;
    const view = await mount(copy, phone, true);
    const label = () => all(view.root).find(entry => text(entry) === copy.earn.hashCapability)!;
    expect(text(label().parent!.children[1].children[0])).toBe("-");
    expect(text(label().parent!)).not.toContain(copy.earn.hashCapabilityUnknown);
    expect(text(label().parent!.parent!)).toContain(copy.earn.hashCapabilityUnknown);
    phone.capabilityTops = 12.25; await Vue.nextTick();
    expect(text(label().parent!.children[1].children[0])).toBe(`12.25 ${copy.onboarding.phoneComputeUnit}`);
    expect(text(label().parent!.parent!)).not.toContain(copy.earn.hashCapabilityUnknown);
    phone.capabilityTops = undefined; await Vue.nextTick();
    expect(text(label().parent!.children[1].children[0])).toBe("-");
    expect(text(label().parent!.parent!)).toContain(copy.earn.hashCapabilityUnknown);
    for (const [native, calibrated] of [[true, false], [false, true]]) {
      const blocked = await mount(copy, phone, true, native, calibrated);
      expect(all(blocked.root).some(entry => text(entry) === copy.earn.hashCapability)).toBe(false);
      const guidance = phoneGuidance.resolvePhoneActivationGuidance(native, copy.myDevices);
      expect(text(blocked.root)).toContain(guidance.title);
      expect(text(blocked.root)).toContain(guidance.body);
      expect(text(blocked.root)).not.toContain(copy.earn.hashCapabilityUnknown);
      expect(all(blocked.root).some(entry => text(entry) === `${copy.myDevices.phoneActivationCta} →`)).toBe(native);
    }
  });
}

async function fire(target: Host, handler: string, extra: object = {}) {
  const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), ...extra };
  const handlers = target.props[handler];
  for (const fn of Array.isArray(handlers) ? handlers : handlers ? [handlers] : []) fn(event);
  await Vue.nextTick();
  return event;
}
const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });
const menu = (root: Host) => find(root, "nx-device-quick-menu");

test("a short touch tap toggles once without opening the menu", async () => {
  const view = await mount();
  const card = find(view.root, "nx-device-card")!;
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(100);
  await fire(card, "onTouchend");
  await fire(find(view.root, "nx-device-card__header")!, "onClick");
  await vi.advanceTimersByTimeAsync(500);
  expect(view.toggle).toHaveBeenCalledOnce();
  expect(menu(view.root)).toBeUndefined();
  expect(view.navTo).not.toHaveBeenCalled();
});

for (const [locale, copy] of [["en", en], ["zh", zh], ["vi", vietnamese]] as const) {
  test(`${locale}: stationary hold opens at 480ms, suppresses its tap and still closes`, async () => {
    const view = await mount(copy);
    const original = JSON.stringify(view.device);
    const card = find(view.root, "nx-device-card")!;
    await fire(card, "onTouchstart", touch(540, 1749));
    await vi.advanceTimersByTimeAsync(479);
    expect(menu(view.root)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const dialog = menu(view.root)!;
    expect(dialog.props.role).toBe("dialog");
    expect(text(dialog)).toContain(copy.earn.quickMenu.stats);
    expect(text(dialog)).toContain(copy.earn.quickMenu.cancel);
    await fire(card, "onTouchend");
    await fire(find(view.root, "nx-device-card__header")!, "onClick");
    expect(view.toggle).not.toHaveBeenCalled();
    await fire(all(dialog).find(entry => entry.props.role === "button" && text(entry) === copy.earn.quickMenu.cancel)!, "onClick");
    expect(menu(view.root)).toBeUndefined();
    expect(JSON.stringify(view.device)).toBe(original);
    expect(view.navTo).not.toHaveBeenCalled();
    expect(view.setPhoneRuntime).not.toHaveBeenCalled();
  });
}

test.each([[540, 650], [900, 1749]])("moving scroll to (%i,%i) cannot fire the 480ms menu", async (x, y) => {
  const view = await mount();
  const original = JSON.stringify(view.device);
  const card = find(view.root, "nx-device-card")!;
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(100);
  const event = await fire(card, "onTouchmove", touch(x, y));
  await vi.advanceTimersByTimeAsync(450); // Same 550ms continuous swipe duration as the observation.
  expect(menu(view.root)).toBeUndefined();
  expect(view.toggle).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled(); // Leave native scrolling enabled.
  await fire(card, "onTouchend");
  await fire(find(view.root, "nx-device-card__header")!, "onClick");
  expect(view.toggle).toHaveBeenCalledOnce(); // The next normal tap is not consumed.
  expect(JSON.stringify(view.device)).toBe(original);
  expect(view.navTo).not.toHaveBeenCalled();
  expect(view.setPhoneRuntime).not.toHaveBeenCalled();
});

test("touchcancel clears the pending hold and a new stationary hold still works", async () => {
  const view = await mount();
  const card = find(view.root, "nx-device-card")!;
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(479);
  await fire(card, "onTouchcancel");
  await vi.advanceTimersByTimeAsync(500);
  expect(menu(view.root)).toBeUndefined();
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(480);
  expect(menu(view.root)).toBeDefined();
});

test("unmount releases both the pending hold and the card tick", async () => {
  const view = await mount();
  await fire(find(view.root, "nx-device-card")!, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(100);
  expect(vi.getTimerCount()).toBe(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(500);
  expect(vi.getTimerCount()).toBe(0);
});

test("a second touchstart replaces rather than duplicates the pending timer", async () => {
  const view = await mount();
  const card = find(view.root, "nx-device-card")!;
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(100);
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(380);
  expect(menu(view.root)).toBeUndefined();
  await vi.advanceTimersByTimeAsync(100);
  expect(menu(view.root)).toBeDefined();
  expect(vi.getTimerCount()).toBe(1); // Only the existing card tick remains.
});

test("keyboard/context-menu access and Escape remain available", async () => {
  const view = await mount();
  const header = find(view.root, "nx-device-card__header")!;
  await fire(header, "onKeydown", { key: "F10", shiftKey: true });
  expect(menu(view.root)).toBeDefined();
  await fire(menu(view.root)!, "onKeydown", { key: "Escape" });
  expect(menu(view.root)).toBeUndefined();
  await fire(header, "onContextmenu");
  expect(menu(view.root)).toBeDefined();
});

test("statistics navigates to this device's real section and closes the menu", async () => {
  const view = await mount(zh, { ...cloudDevice(), id: 'cloud / 1' });
  await fire(find(view.root, 'nx-device-card__header')!, 'onContextmenu');
  await fire(find(view.root, 'nx-device-quick-stats')!, 'onClick');
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/earn/device-detail?id=cloud%20%2F%201&section=statistics');
  expect(menu(view.root)).toBeUndefined();
});

test("ordinary subsidy tap still opens the real shared explainer switch", async () => {
  const device = { ...cloudDevice(), kind: "stellarbox-s1" as const,
    capacityPct: 100, capacityAgeMonths: 0, capacitySubsidized: true,
    capacitySubsidyDays: 30, capacitySubsidyRemainingDays: 28,
    capacitySubsidyEndsAt: now + 28 * 86_400_000, serverNow: now, capacitySnapshotReceivedAt: 0 };
  const view = await mount(zh, device, true);
  const original = JSON.stringify(device);
  const card = find(view.root, "nx-device-card")!;
  await fire(card, "onTouchstart", touch(540, 1749));
  await vi.advanceTimersByTimeAsync(100);
  await fire(card, "onTouchend");
  await fire(find(view.root, "nx-device-explainer")!, "onClick");
  expect(useCapacityExplainer().visible.value).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  expect(menu(view.root)).toBeUndefined();
  expect(JSON.stringify(device)).toBe(original);
  expect(view.navTo).not.toHaveBeenCalled();
  expect(view.setPhoneRuntime).not.toHaveBeenCalled();
});
