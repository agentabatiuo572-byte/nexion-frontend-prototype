import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import source from "./device-detail.vue?raw";
import cardSource from "../../components/earn/device-card-pc.vue?raw";
import sheetSource from "../../components/earn/capacity-explainer-sheet.vue?raw";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
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
import * as detailNavigation from "@/lib/device-detail-navigation";
import { fmt } from "@/i18n/format";
import { en, type Messages } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { Device } from "@/store/types";

// Execute the real page, card, sheet, shared switch and display helpers.
// Unrelated services are inert; these tests create no account/business objects.
function component(raw: string, id: string, dependencies: Record<string, unknown>): Component {
  const script = compileScript(parse(raw).descriptor, { id, inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false } } });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as { default: Component } };
  new Function("require", "module", "exports", code)((key: string) => {
    if (!(key in dependencies)) throw new Error(`Unexpected device-detail import: ${key}`);
    return dependencies[key];
  }, module, module.exports);
  return module.exports.default;
}

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
const hasClass = (entry: Host, name: string) => String(entry.props.class ?? "").split(/\s+/).includes(name);
const find = (root: Host, name: string) => all(root).find(entry => hasClass(entry, name));
const unmounts: Array<() => void> = [];
const now = 1_800_000_000_000;
const day = 86_400_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); useCapacityExplainer().close(); });
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); useCapacityExplainer().close(); vi.useRealTimers(); });

// Existing E3 server-device contract shape; only static render inputs, no requests.
function serverDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "e3-1", rowVersion: 1, kind: "stellarbox-s1", name: "UVELBox S1", gpu: "RTX 4090",
    vramTotal: 96, basePower: 1200, baseRate: 100, baseRateNEX: 50,
    purchasedAt: now - 2 * day, activatedAt: now - 2 * day,
    status: "offline", runtimeStatus: "OFFLINE", gpuUsage: 0, gpuTemp: 0, gpuPower: 0, vramUsed: 0,
    currentTask: { id: "CTA-pending", category: "LL", type: "LLM inference", model: "Llama 70B",
      client: "UVEL App", location: "DC-Singapore-01", totalSec: 120, startedAt: now - 120_000,
      status: "RUNNING", completableAt: now - 1, reward: 0.425 },
    recentTasks: [], todayEarnings: 0, todayEarningsNEX: 0, cumulativeEarningsUsdt: 0, paidPriceUsdt: 649,
    capacitySource: "server", capacityPct: 100, capacityAgeMonths: 0,
    capacitySubsidized: true, capacitySubsidyDays: 30, capacitySubsidyRemainingDays: 28,
    capacitySubsidyEndsAt: now + 28 * day, serverNow: now,
    capacitySnapshotReceivedAt: 0, taskServerNow: now, taskServerNowReceivedAt: 0,
    ...overrides,
  };
}

async function mount(copy: Messages, device = serverDevice()) {
  const navTo = vi.fn();
  const setPhoneRuntime = vi.fn();
  const refreshRemoteFleet = vi.fn();
  const app = Vue.reactive({ accountKey: "render-only", visibleDevices: [device], remoteFleetStatus: "ready",
    remotePhoneBindingInvalid: false, setPhoneRuntime, refreshRemoteFleet, captureRemoteAccountRequest: vi.fn() });
  const passthrough = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("view", slots.default?.()) });
  const blank = Vue.defineComponent({ setup: () => () => Vue.h("view") });
  const sfc = (value: Component) => ({ __esModule: true, default: value });
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onLoad: (callback: (query: object) => void) => callback({ id: device.id }), onShow: () => {} },
    "@/components/app-chassis.vue": sfc(passthrough), "@/components/empty-state.vue": sfc(blank),
    "@/components/sub-page-header.vue": sfc(blank), "@/components/home/device-slot.vue": sfc(blank),
    "@/store/app": { useApp: () => app },
    "@/store/session": { useSession: () => ({ isCurrentDeviceCalibrated: () => true }) },
    "@/store/config": { useConfig: () => ({ config: { onlineBonus: {} } }) },
    "@/store/earn-config": { prepareEarnConfig: () => {}, useEarnConfig: () => ({ lockedTeasers: () => [], averageEligibleReward: () => 1 }) },
    "@/lib/native-phone-runtime": { hasNativeAndroidPhoneRuntime: () => true },
    "@/api/runtime": { remoteApiEnabled: true }, "@/i18n/use-t": { useT: () => Vue.ref(copy) },
    "@/lib/route": { navTo, navBack: vi.fn(), takeNavigationQuery: () => "" },
    "@/composables/use-capacity-explainer": { useCapacityExplainer },
    "@/composables/use-dialog-a11y": { useDialogA11y }, "@/lib/server-deadline-clock": deadline,
    "@/lib/phone-activation-guidance": phoneGuidance, "@/store/device-types": deviceTypes,
    "@/lib/workload-label": workload, "@/lib/task-result-confirmation": confirmation,
    "@/lib/device-copy": deviceCopy, "@/store/device-lifecycle": lifecycle, "@/store/interrupt": interrupt,
    "@/lib/hashpower": hashpower, "@/lib/device-capability": capability,
    "@/lib/today-completed-tasks": completions, "@/lib/device-detail-navigation": detailNavigation,
    "@/i18n/format": { fmt },
  };
  dependencies["@/components/earn/device-card-pc.vue"] = sfc(component(cardSource, "detail-card", dependencies));
  dependencies["@/components/earn/capacity-explainer-sheet.vue"] = sfc(component(sheetSource, "detail-explainer", dependencies));
  const root = node();
  const instance = renderer.createApp(component(source, "device-detail-explainer", dependencies));
  instance.mount(root);
  unmounts.push(() => instance.unmount());
  await Vue.nextTick();
  return { root, device, navTo, setPhoneRuntime, refreshRemoteFleet };
}

async function fire(target: Host, event: "click" | "Enter" | " ") {
  const nativeEvent = { key: event, stopPropagation: vi.fn(), preventDefault: vi.fn() };
  const handlers = event === "click" ? target.props.onClick : target.props.onKeydown;
  for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler(nativeEvent);
  await Vue.nextTick();
  return nativeEvent;
}

const languages = [["en", en], ["zh", zh], ["vi", vietnamese]] as const;
for (const [locale, copy] of languages) {
  test.each(["click", "Enter", " "] as const)(`${locale}: real subsidy entry %s opens and closes the detail sheet`, async event => {
    const view = await mount(copy);
    const original = JSON.stringify(view.device);
    const card = find(view.root, "nx-device-card")!;
    const originalCardText = text(card);
    for (const value of ["CTA-pending", "$0.425", "$0.000", "0.0 NEX"]) expect(originalCardText).toContain(value);
    const badge = find(view.root, "nx-device-explainer")!;
    expect(text(badge)).toBe(fmt(copy.earn.subsidyBadge, { n: 28 }));
    expect(find(view.root, "nx-capacity-explainer-root")).toBeUndefined();
    const fired = await fire(badge, event);
    expect(fired.stopPropagation).toHaveBeenCalledOnce();
    expect(useCapacityExplainer().visible.value).toBe(true);
    const dialog = find(view.root, "nx-capacity-explainer-root")!;
    expect(dialog).toBeDefined();
    expect(dialog.props.role).toBe("dialog");
    expect(dialog.props["aria-label"]).toBe(copy.earn.capExplainTitle);
    for (const body of [copy.earn.capExplainS1Body, copy.earn.capExplainS2Body]) expect(text(dialog)).toContain(body);
    expect(text(card)).toBe(originalCardText);
    const close = all(dialog).find(entry => entry.props["aria-label"] === copy.ui.close)!;
    await fire(close, "click");
    expect(useCapacityExplainer().visible.value).toBe(false);
    expect(find(view.root, "nx-capacity-explainer-root")).toBeUndefined();
    expect(JSON.stringify(view.device)).toBe(original);
    expect(view.navTo).not.toHaveBeenCalled();
    expect(view.setPhoneRuntime).not.toHaveBeenCalled();
    expect(view.refreshRemoteFleet).not.toHaveBeenCalled();
  });
}

test.each([0, 1])("expired-subsidy capacity entry %s uses the same detail sheet", async index => {
  const view = await mount(en, serverDevice({ capacitySubsidized: false, capacitySubsidyRemainingDays: 0,
    capacitySubsidyEndsAt: null, capacityPct: 73.25, capacityAgeMonths: 5 }));
  const entries = all(view.root).filter(entry => hasClass(entry, "nx-device-explainer"));
  expect(entries).toHaveLength(2);
  await fire(entries[index], "click");
  expect(find(view.root, "nx-capacity-explainer-root")?.props["aria-label"]).toBe(en.earn.capExplainTitle);
  expect(view.device.capacityPct).toBe(73.25);
});

test("the existing sheet CTA closes then navigates to the store without business changes", async () => {
  const view = await mount(en);
  const original = JSON.stringify(view.device);
  await fire(find(view.root, "nx-device-explainer")!, "click");
  const dialog = find(view.root, "nx-capacity-explainer-root")!;
  expect(dialog).toBeDefined();
  const cta = all(dialog).find(entry => entry.props["aria-label"] === en.earn.capExplainCta)!;
  await fire(cta, "click");
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/store");
  expect(useCapacityExplainer().visible.value).toBe(false);
  expect(find(view.root, "nx-capacity-explainer-root")).toBeUndefined();
  expect(JSON.stringify(view.device)).toBe(original);
  expect(view.setPhoneRuntime).not.toHaveBeenCalled();
  expect(view.refreshRemoteFleet).not.toHaveBeenCalled();
});

test("unknown remote capacity does not invent a subsidy/capacity entry", async () => {
  const view = await mount(en, serverDevice({ capacityPct: null }));
  expect(find(view.root, "nx-device-card")).toBeDefined();
  expect(find(view.root, "nx-device-explainer")).toBeUndefined();
  expect(find(view.root, "nx-capacity-explainer-root")).toBeUndefined();
  expect(useCapacityExplainer().visible.value).toBe(false);
  expect(view.device.capacityPct).toBeNull();
});
