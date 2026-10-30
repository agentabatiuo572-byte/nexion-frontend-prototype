import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import homeSource from "./home/my-fleet-section.vue?raw";
import inventorySource from "@/pages/me/devices.vue?raw";
import earnSource from "@/pages/earn/earn.vue?raw";
import earnFleetSource from "./earn/empty-slots-hint.vue?raw";
import slotSheetSource from "./slot-action-sheet.vue?raw";
import { en } from "@/i18n/messages/en";
import { trialFleetCopy } from "@/i18n/trial-fleet";
import * as slotPolicy from "@/lib/device-slot-policy";

const scopes: Vue.EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));
function tree(node: Vue.VNode): Vue.VNode[] {
  return [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? tree(child) : []) : [])];
}
function mount(source: string) {
  const descriptor = parse(source).descriptor;
  const code = ts.transpileModule(compileScript(descriptor, { id: "trial-fleet-integration" }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  // Render the actual parent template; child components remain named VNodes so
  // the assertions can observe the exact fleet identities passed to each row.
  const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true,
    isCustomElement: () => true }).code)(Vue);
  const paid = { id: "paid-1", kind: "stellarbox-s1", activatedAt: 1 as number | null, rowVersion: 1 };
  const app = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1, remoteFleetHasSnapshot: true, remoteFleetStatus: "ready", remotePhoneBindingInvalid: false,
    slotCap: 6, activeSlotCount: 5,
    get remoteSlotsUsed(): number | null { return this.remoteSlotUsage?.slotsUsed ?? null; },
    set remoteSlotsUsed(value: number | null) { this.remoteSlotUsage = value === null ? null : { slotsUsed: value, reservedSlotCount: 0, trialSlotCount: 0 }; },
    remoteSlotUsage: null as { slotsUsed: number; reservedSlotCount: number; trialSlotCount: number } | null,
    visibleDevices: [paid], devices: [paid], user: { joinedAt: 1 }, refreshRemoteFleet: vi.fn(async () => true) });
  const trial = Vue.reactive({ authorityStatus: "ready", status: "active", poll: vi.fn(async () => true), cancel: vi.fn(async () => ({ ok: true })) });
  const presentation = { active: Vue.ref(true), reservedSlots: Vue.ref<number | null>(1), actionsReady: Vue.ref(true) };
  const navTo = vi.fn(), confirm = vi.fn(async () => true), toast = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() };
  const activateRemote = vi.fn(async () => {});
  const modules: Record<string, unknown> = {
    "@dcloudio/uni-app": { onLoad: vi.fn(), onUnload: vi.fn() },
    "@/store/data-visibility": { useDataVisibility: () => ({ hidden: false, mask: String }) },
    vue: Vue, "@/lib/amount-display": { formatAmount: (n: number) => n.toFixed(2) },
    "@/lib/route": { navTo, navReset: vi.fn() }, "@/store/app": { useApp: () => app },
    "@/store/free-trial": { useFreeTrial: () => trial, trialReservesSlotNow: () => presentation.reservedSlots.value === 1 },
    "@/store/slot-action-sheet": { useSlotActionSheet: () => ({ open: true, hide: vi.fn() }) },
    "@/composables/use-dialog-a11y": { useDialogA11y: vi.fn() },
    "@/composables/use-trial-presentation": { useTrialPresentation: () => presentation },
    "@/i18n/trial-fleet": { useTrialFleetCopy: () => Vue.ref(trialFleetCopy.en) },
    "@/i18n/use-t": { useT: () => Vue.ref(en) },
    "@/i18n/format": { fmt: (text: string, args: Record<string, unknown>) => text.replace(/\{(\w+)\}/g, (_, key) => String(args[key])) },
    "@/i18n/audit-ui": { useAuditUiCopy: () => Vue.ref({ fleetLoading: "Loading", fleetUnavailable: "Unavailable" }) },
    "@/api/runtime": { remoteApiEnabled: true, apiRuntimeConfig: { environment: "dev" }, deviceE3Api: { activate: activateRemote } },
    "@/lib/device-slot-policy": slotPolicy, "@/lib/hashpower": { deviceOnlineState: () => "online" },
    "@/store/session": { useSession: () => ({ isCurrentDeviceCalibrated: () => true }) },
    "@/lib/native-phone-runtime": { hasNativeAndroidPhoneRuntime: () => false, hasNativePhoneRuntime: () => false, nativePhonePlatform: () => null },
    "@/lib/phone-activation-guidance": { resolvePhoneActivationGuidance: () => ({ title: "Phone", body: "Connect" }) },
    "@/lib/device-control-platform": { canControlDevice: () => true },
    "@/lib/device-copy": { deviceName: () => "Paid device" },
    "@/store/tradein-sheet": { useTradeinSheet: () => ({}) }, "@/mock/products": { PRODUCTS: [] },
    "@/mock/tradein-config": {}, "@/mock/eligibility": {}, "@/store/product-phase": { getMonthsSince: () => 1 },
    "@/composables/use-product-phase": { useProductPhase: () => Vue.ref(1) }, "@/store/ui": { confirm, toast },
    "@/api/errors": {}, "@/lib/account-scope": { captureAccountScope: () => ({}), isCurrentAccountScope: () => true },
    "@/lib/device-command-key": { acquireDeviceCommandKey: () => "activation-key", finishDeviceCommand: vi.fn() }, "@/store/product-availability": {},
    "@/store/product-catalog": { productCatalogState: { status: "ready" }, refreshProductCatalog: async () => false },
    "@/lib/e3-fleet-bootstrap": { refreshRemoteFleetAfterCatalog: async () => true },
    "@/composables/use-device-deactivation": { useDeviceDeactivation: () => ({ sheetDevice: Vue.ref(null), handleDeactivate: vi.fn(), onSheetWait: vi.fn(), onSheetForce: vi.fn(), runRemoteDeviceCommand: vi.fn() }) },
    "@/composables/use-tradein-strip": { useTradeinStrip: () => ({ tradeinStrip: () => ({}), handleTradein: vi.fn() }) },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => {
    if (id.endsWith(".vue")) return { default: id };
    if (!(id in modules)) throw new Error(id); return modules[id];
  }, exports);
  const scope = Vue.effectScope(); scopes.push(scope);
  const view = scope.run(() => exports.default.setup({}, { expose() {} }))!;
  const node = () => render(Vue.proxyRefs(view), []) as Vue.VNode;
  return { app, trial, presentation, view, node, navTo, confirm, toast, activateRemote };
}

it.each(["unknown", "error", "loading"])("keeps legacy inventory visible but blocks activation while trial capacity is %s, then recovers", async status => {
  const screen = mount(slotSheetSource);
  screen.trial.status = "none"; screen.trial.authorityStatus = status;
  screen.presentation.reservedSlots.value = null; screen.presentation.actionsReady.value = false;
  const inventory = { id: "7", kind: "cloud-share", activatedAt: null as number | null, rowVersion: 1, baseRateNEX: 0 };
  screen.app.devices.push(inventory); screen.app.visibleDevices.push(inventory);
  const row = () => tree(screen.node()).find(node => String(node.props?.class).split(/\s+/).includes("sas-device"))!;
  expect(row().props!["aria-disabled"]).toBe("true");
  await screen.view.onActivate(inventory);
  expect(screen.activateRemote).not.toHaveBeenCalled();
  expect(screen.app.visibleDevices.map(device => device.id)).toEqual(["paid-1", "7"]);
  screen.trial.authorityStatus = "ready";
  screen.presentation.reservedSlots.value = 0; screen.presentation.actionsReady.value = true;
  expect(row().props!["aria-disabled"]).toBe("false");
  screen.activateRemote.mockImplementationOnce(async () => { inventory.activatedAt = 1; });
  await screen.view.onActivate(inventory);
  expect(screen.activateRemote).toHaveBeenCalledExactlyOnceWith(7, 1, 6, "activation-key");
  expect(screen.toast.success).toHaveBeenCalledOnce();
});

it("allows an inventory activation with confirmed total capacity even when the separate trial read failed", async () => {
  const screen = mount(slotSheetSource);
  screen.trial.status = "none"; screen.trial.authorityStatus = "error";
  screen.presentation.reservedSlots.value = null; screen.presentation.actionsReady.value = false;
  screen.app.remoteSlotUsage = { slotsUsed: 5, reservedSlotCount: 0, trialSlotCount: 0 };
  const inventory = { id: "7", kind: "cloud-share", activatedAt: null as number | null, rowVersion: 1, baseRateNEX: 0 };
  screen.app.devices.push(inventory); screen.app.visibleDevices.push(inventory);
  const row = tree(screen.node()).find(node => String(node.props?.class).split(/\s+/).includes("sas-device"))!;
  expect(row.props!["aria-disabled"]).toBe("false");
  screen.activateRemote.mockImplementationOnce(async () => { inventory.activatedAt = 1; });
  await screen.view.onActivate(inventory);
  expect(screen.activateRemote).toHaveBeenCalledExactlyOnceWith(7, 1, 6, "activation-key");
  expect(screen.toast.success).toHaveBeenCalledOnce();
});

it.each([["Home", homeSource], ["management", inventorySource]])("uses server reservations without adding the trial twice on %s", (_label, source) => {
  const screen = mount(source);
  screen.app.activeSlotCount = 1;
  screen.app.remoteSlotsUsed = 7;
  screen.presentation.reservedSlots.value = 1;
  expect(screen.view.slotsUsed.value).toBe(7);
  expect(tree(screen.node()).filter(node => node.type === "DeviceRow" || node.type === "DeviceInventoryRow")).toHaveLength(1);
  expect(tree(screen.node()).filter(node => node.type === "AddDeviceRow")).toHaveLength(0);
  screen.presentation.reservedSlots.value = null;
  expect(screen.view.slotsUsed.value).toBe(7);
  screen.app.remoteSlotsUsed = 0;
  expect(screen.view.slotsUsed.value).toBe(0);
});

it("blocks a Cloud activation in the actual chooser when five Online devices and one order reservation use all slots", async () => {
  const screen = mount(slotSheetSource); screen.presentation.reservedSlots.value = 0;
  screen.app.remoteSlotUsage = { slotsUsed: 6, reservedSlotCount: 1, trialSlotCount: 0 };
  expect(screen.view.slotsUsed.value).toBe(6);
  expect(screen.view.slotsFull.value).toBe(true);
  await screen.view.onActivate({ id: "stock-cloud", kind: "cloud-share", activatedAt: null, rowVersion: 1 });
  expect(screen.toast.warn).toHaveBeenCalledWith(en.slotSheet.toastSlotsFull.replaceAll("{max}", "6"));
  expect(screen.toast.success).not.toHaveBeenCalled();
});

it.each([["Home", homeSource], ["management", inventorySource]])("counts authoritative order and trial reservations exactly once on %s", (_label, source) => {
  const screen = mount(source); screen.presentation.reservedSlots.value = 1;
  screen.app.activeSlotCount = 4;
  screen.app.remoteSlotUsage = { slotsUsed: 6, reservedSlotCount: 1, trialSlotCount: 1 };
  expect(screen.view.slotsUsed.value).toBe(6);
  expect(screen.app.activeSlotCount).toBe(4);
  expect(tree(screen.node()).some(node => node.type === "AddDeviceRow")).toBe(false);
});

it.each([["Home", homeSource], ["management", inventorySource]])("counts a trial once with the full paid capacity on %s", (_label, source) => {
  const screen = mount(source); expect(screen.view.slotsUsed.value).toBe(6);
  expect(tree(screen.node()).filter(node => node.type === "TrialDeviceRow")).toHaveLength(1);
  // The hidden paid capacity remains in the authoritative count even though
  // only one paid row is visible under the current product flag.
  expect(screen.app.visibleDevices).toHaveLength(1);
});

it.each([["Home", homeSource, "home"], ["management", inventorySource, "inventory"]])("uses the matching existing device-row presentation on %s", (_label, source, variant) => {
  const screen = mount(source);
  expect(tree(screen.node()).find(node => node.type === "TrialDeviceRow")!.props!.variant).toBe(variant);
});

it("connects the trial to the Earn accordion so a paid row closes it and preserves the first paid divider", () => {
  const script = parse(earnSource).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile("earn.ts", script, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
    ? statement.name?.text === "toggleDevice"
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => item.name.getText(ast) === "expandedId"));
  const actualAccordion = ts.transpileModule(declarations.map(item => item.getText(ast)).join("\n") + "\nreturn { expandedId, toggleDevice };",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const accordion = new Function("ref", actualAccordion)(Vue.ref);
  const template = earnSource.match(/<EmptySlotsHint\b[\s\S]*?<\/EmptySlotsHint>/)![0];
  const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true }).code)(Vue);
  const context = Vue.proxyRefs({ ...accordion, fleetReady: true, devices: [{ id: "paid-1" }], trialPresentation: { active: Vue.ref(true) } });
  const node = () => render(context, []) as Vue.VNode;
  const paidRow = () => tree(node()).find(item => item.type === "DeviceCardPC")!;

  expect(node().props!["trial-expanded"]).toBe(false);
  node().props!.onToggleTrial();
  expect(node().props!["trial-expanded"]).toBe(true);
  expect(paidRow().props!.expanded).toBe(false);
  expect(paidRow().props!.divider).toBe(true);
  const trialTemplate = earnFleetSource.match(/<TrialDeviceRow\b[^>]*\/>/)![0];
  const renderTrial = new Function("Vue", compile(trialTemplate, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true }).code)(Vue);
  const emit = vi.fn();
  const trialRow = renderTrial({ trialExpanded: node().props!["trial-expanded"], emit }, []) as Vue.VNode;
  expect(trialRow.props).toMatchObject({ variant: "earn", expanded: true });
  trialRow.props!.onToggle(); expect(emit).toHaveBeenCalledExactlyOnceWith("toggleTrial");

  paidRow().props!.onToggle();
  expect(node().props!["trial-expanded"]).toBe(false);
  expect(paidRow().props!.expanded).toBe(true);
  context.trialPresentation.active.value = false;
  expect(paidRow().props!.divider).toBe(false);
});

it("keeps purchased rows visible after a trial read failure on both parent templates", () => {
  const home = mount(homeSource), inventory = mount(inventorySource);
  for (const screen of [home, inventory]) {
    screen.trial.authorityStatus = "error"; screen.presentation.reservedSlots.value = null;
  }
  expect(home.view.fleetCountText.value).toBe("— / —"); expect(inventory.view.slotsUsed.value).toBeNull();
  expect(tree(home.node()).filter(node => node.type === "DeviceRow").map(node => node.props?.device.id)).toEqual(["paid-1"]);
  expect(tree(inventory.node()).filter(node => node.type === "DeviceInventoryRow").map(node => node.props?.device.id)).toEqual(["paid-1"]);
});

it("removes only the trial row on conversion and retains the paid fleet", () => {
  const screen = mount(homeSource); screen.presentation.active.value = false; screen.presentation.reservedSlots.value = 0;
  expect(screen.view.slotsUsed.value).toBe(5);
  expect(tree(screen.node()).filter(node => node.type === "TrialDeviceRow")).toHaveLength(0);
  expect(tree(screen.node()).filter(node => node.type === "DeviceRow")).toHaveLength(1);
});

it("guards management cancellation while unavailable and preserves confirmation before the actual action", async () => {
  const screen = mount(inventorySource); screen.presentation.actionsReady.value = false;
  await screen.view.handleCancelTrial(); expect(screen.confirm).not.toHaveBeenCalled(); expect(screen.trial.cancel).not.toHaveBeenCalled();
  screen.presentation.actionsReady.value = true;
  await screen.view.handleCancelTrial(); expect(screen.confirm).toHaveBeenCalledTimes(1); expect(screen.trial.cancel).toHaveBeenCalledTimes(1);
  expect(screen.view.cancelTrialBusy.value).toBe(false);
});

it("does not open duplicate confirmations or apply an old confirmation to a new account binding", async () => {
  const screen = mount(inventorySource); let resolve!: (answer: boolean) => void;
  screen.confirm.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  const pending = screen.view.handleCancelTrial();
  await screen.view.handleCancelTrial(); expect(screen.confirm).toHaveBeenCalledTimes(1);
  screen.app.accountBindingEpoch++; resolve(true); await pending;
  expect(screen.trial.cancel).not.toHaveBeenCalled(); expect(screen.view.cancelTrialBusy.value).toBe(false);
});

it("keeps a failed cancellation as failure feedback and restores the control", async () => {
  const screen = mount(inventorySource); screen.trial.cancel.mockResolvedValueOnce({ ok: false });
  await screen.view.handleCancelTrial();
  expect(screen.toast.info).not.toHaveBeenCalled(); expect(screen.toast.warn).toHaveBeenCalledWith(en.trial.cancelError);
  expect(screen.view.cancelTrialBusy.value).toBe(false);
});

it("uses a loading snapshot only for presentation and blocks slot activation until both reads are fresh", async () => {
  const screen = mount(inventorySource); screen.app.activeSlotCount = 1;
  screen.trial.authorityStatus = "loading"; screen.presentation.actionsReady.value = false;
  expect(screen.view.slotsUsed.value).toBe(2); expect(screen.view.activationReady.value).toBe(false);
  await screen.view.handleActivate({ id: "inventory-1", kind: "stellarbox-s1", activatedAt: null, rowVersion: 1 });
  expect(screen.toast.warn).toHaveBeenCalledWith(trialFleetCopy.en.slotsChecking);
});
