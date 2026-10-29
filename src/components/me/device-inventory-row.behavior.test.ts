vi.mock("@/services/native-push", () => ({ revokeNativePush: vi.fn(), resumeNativePush: vi.fn() }));
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./device-inventory-row.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { deviceName, deviceGpuLabel } from "@/lib/device-copy";
import { deviceOnlineState } from "@/lib/hashpower";
import { getProductMedia } from "@/lib/product-media";
import { formatAmount } from "@/lib/amount-display";
import type { Device } from "@/store/types";

const messages = { en, zh, vi: vietnamese };
const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: "device-inventory-row" }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true,
  isCustomElement: tag => ["view", "text", "image"].includes(tag) }).code)(Vue);
function nodes(node: Vue.VNode): Vue.VNode[] {
  return [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];
}
function mount(locale: keyof typeof messages = "en") {
  const t = messages[locale];
  const device = Vue.reactive({ id: "paid-1", kind: "stellarbox-pro-v2", name: "UVELBox Pro v2", gpu: "RTX 4090",
    activatedAt: 1, capacitySource: "server", runtimeStatus: "ONLINE", status: "online", baseRate: 2, baseRateNEX: 3,
  } as Device);
  const props = Vue.reactive({ device, active: true, runtimeConfirmed: true, showAction: true, disabled: false, actionDisabled: false,
    disabledLabel: undefined as string | undefined, activateLabel: t.myDevices.inventoryRowActivate, deactivateLabel: t.myDevices.inventoryRowDeactivate,
    slotsFullLabel: t.myDevices.inventoryRowSlotsFull, pendingChipLabel: t.myDevices.inventoryPendingDeactivateChip,
    tradeinCreditText: "Credit $200", tradeinCtaLabel: t.tradein.stripCta, tradeinDisabledText: undefined as string | undefined });
  const emit = vi.fn();
  const modules: Record<string, unknown> = { vue: Vue, "@/i18n/use-t": { useT: () => Vue.ref(t) },
    "@/lib/device-copy": { deviceName, deviceGpuLabel }, "@/lib/hashpower": { deviceOnlineState },
    "@/lib/product-media": { getProductMedia }, "@/lib/amount-display": { formatAmount } };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(id); return modules[id];
  }, exports);
  const view = exports.default.setup(props, { expose() {}, emit });
  const node = () => render(Vue.proxyRefs({ ...props, ...view }), []) as Vue.VNode;
  const byClass = (className: string) => nodes(node()).find(item => item.props?.class?.split(" ").includes(className));
  return { props, device, emit, node, byClass, t };
}

it.each(["zh", "en", "vi"] as const)("keeps the %s purchased row compact and reveals all actions only after expansion", locale => {
  const screen = mount(locale);
  expect(screen.byClass("device-inventory-row__name")!.children).toBe("UVELBox Pro v2");
  expect(screen.byClass("device-inventory-row__image")!.props!.src).toBe(getProductMedia("stellarbox-pro-v2")!.src);
  expect(screen.byClass("device-inventory-row__state")!.children).toBe("Online");
  expect(screen.byClass("device-inventory-row__status")).toBeUndefined();
  expect(nodes(screen.node()).filter(node => node.children === "Online")).toHaveLength(1);
  expect(screen.byClass("device-inventory-row__state--active")).toBeDefined();
  expect(screen.byClass("device-inventory-row__body")).toBeUndefined();
  const heading = screen.byClass("device-inventory-row__heading")!;
  expect(heading.props).toMatchObject({ role: "button", tabindex: "0", "aria-expanded": false });
  heading.props!.onClick();
  expect(screen.emit).not.toHaveBeenCalled();
  expect(screen.byClass("device-inventory-row__body")!.props!.id).toBe(heading.props!["aria-controls"]);
  expect(screen.byClass("device-inventory-row__spec")!.children).toContain("RTX 4090");
  screen.byClass("device-inventory-row__credit")!.props!.onClick({ stopPropagation() {} });
  screen.byClass("device-inventory-row__tradein-cta")!.props!.onClick({ stopPropagation() {} });
  screen.byClass("device-inventory-row__action")!.props!.onClick();
  expect(screen.emit.mock.calls).toEqual([["ladder"], ["tradein"], ["toggle"]]);
  screen.byClass("device-inventory-row__heading")!.props!.onClick();
  expect(screen.byClass("device-inventory-row__body")).toBeUndefined();
});

it("preserves disabled activation, remote pending-deactivation, and read-only controls", () => {
  const screen = mount(); screen.byClass("device-inventory-row__heading")!.props!.onClick();
  screen.props.active = false; screen.props.disabled = true;
  expect(screen.byClass("device-inventory-row__action")!.children).toHaveLength(1);
  expect(screen.byClass("device-inventory-row__action")!.props).toMatchObject({ tabindex: -1, "aria-disabled": true });
  screen.byClass("device-inventory-row__action")!.props!.onClick(); expect(screen.emit).not.toHaveBeenCalled();
  screen.props.disabledLabel = "Refresh before activation";
  expect(nodes(screen.node()).some(item => item.children === "Refresh before activation")).toBe(true);
  screen.props.active = true; screen.props.disabled = false; screen.props.actionDisabled = true; screen.device.pendingDeactivate = true;
  expect(screen.byClass("device-inventory-row__pending")).toBeDefined();
  screen.byClass("device-inventory-row__action")!.props!.onClick(); expect(screen.emit).not.toHaveBeenCalled();
  screen.props.showAction = false; expect(screen.byClass("device-inventory-row__action")).toBeUndefined();
});

it("keeps a confirmed pending-deactivation visible before opening the row", () => {
  const screen = mount(); screen.device.pendingDeactivate = true;
  expect(screen.byClass("device-inventory-row__body")).toBeUndefined();
  expect(screen.byClass("device-inventory-row__status")!.children).toBe(screen.t.myDevices.inventoryPendingDeactivateChip);
  expect(screen.byClass("device-inventory-row__state--active")).toBeDefined();
});

it.each(["zh", "en", "vi"] as const)("shows only activated Online and preserves read failure in %s", locale => {
  const screen = mount(locale);
  for (const runtime of ["OFFLINE", "UNKNOWN"] as const) {
    screen.device.runtimeStatus = runtime;
    expect(screen.byClass("device-inventory-row__state")!.children).toBe(screen.t.earn.online);
    expect(screen.byClass("device-inventory-row__status")).toBeUndefined();
    expect(screen.byClass("device-inventory-row__state--active")).toBeDefined();
  }
  screen.props.runtimeConfirmed = false;
  expect(screen.byClass("device-inventory-row__status")!.children).toBe(screen.t.earn.runtimeUnknown);
  expect(screen.byClass("device-inventory-row__state")).toBeUndefined();
  screen.props.runtimeConfirmed = true;
  screen.props.active = false; screen.device.activatedAt = null;
  expect(screen.byClass("device-inventory-row__status")).toBeUndefined();
  expect(screen.byClass("device-inventory-row__state--active")).toBeUndefined();
  screen.device.activationUnconfirmed = true;
  expect(screen.byClass("device-inventory-row__status")!.children).toBe(screen.t.earn.runtimeUnknown);
  expect(screen.t.myDevices.inventorySectionDevices).toBe("Online");
  expect(screen.t.myDevices.inventorySectionInventory).not.toBe("Offline");
});

it.each(["stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2", "cloud-share"] as const)("uses the actual %s product artwork", kind => {
  const screen = mount(); screen.device.kind = kind;
  expect(screen.byClass("device-inventory-row__image")!.props!.src).toBe(getProductMedia(kind)!.src);
});
