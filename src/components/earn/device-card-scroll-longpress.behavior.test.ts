import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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

async function mount(copy: Messages = zh, device = cloudDevice(), expanded = false) {
  const navTo = vi.fn();
  const setPhoneRuntime = vi.fn();
  const toggle = vi.fn();
  const app = Vue.reactive({ accountKey: "render-only", visibleDevices: [device], remotePhoneBindingInvalid: false, setPhoneRuntime });
  const blank = Vue.defineComponent({ setup: () => () => Vue.h("view") });
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@/components/home/device-slot.vue": { __esModule: true, default: blank },
    "@/store/app": { useApp: () => app },
    "@/store/session": { useSession: () => ({ isCurrentDeviceCalibrated: () => true }) },
    "@/store/config": { useConfig: () => ({ config: { onlineBonus: {} } }) },
    "@/store/earn-config": { prepareEarnConfig: () => {}, useEarnConfig: () => ({ lockedTeasers: () => [], averageEligibleReward: () => 1 }) },
    "@/lib/native-phone-runtime": { hasNativeAndroidPhoneRuntime: () => true },
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
  const instance = renderer.createApp(module.exports.default, { device, expanded, onToggle: toggle });
  instance.mount(root);
  let mounted = true;
  const unmount = () => { if (mounted) { instance.unmount(); mounted = false; } };
  unmounts.push(unmount);
  await Vue.nextTick();
  return { root, device, toggle, navTo, setPhoneRuntime, unmount };
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
