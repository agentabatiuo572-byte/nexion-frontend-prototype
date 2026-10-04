import { describe, expect, it } from "vitest";
import source from "./app.ts?raw";
import cardContent from "../components/earn/device-card-pc.vue?raw";
import slotSheetContent from "../components/slot-action-sheet.vue?raw";
import slotStoreSource from "./slot-action-sheet.ts?raw";
import ts from "typescript";
import { isActiveSlotDevice, isActivatableInventoryDevice, requiresActivationConfirmation } from "../lib/device-slot-policy";

const ast = ts.createSourceFile("app.ts", source, ts.ScriptTarget.Latest, true);
let body = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "canonicalDevice") body = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!body) throw new Error("canonicalDevice missing");
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const project = new Function("canonicalKind", `${compiled}; return canonicalDevice;`)((device: {kind?:string}) => device.kind ?? "cloud-share");
const fixture = { id: 42, status: "ACTIVE", activatedAt: 123, purchasedAt: 100, pendingDeactivate: false,
  capacityPct: 100, dailyUsdt: 2, dailyNex: 3, todayEarningsUsdt: 7, todayEarningsNex: 8,
  cumulativeOutputUsdt: 9, actualPaidUsdt: 10 };
describe("remote fleet lifecycle and online state are independent", () => {
  it.each(["OFFLINE", "UNKNOWN", undefined])("does not report active hardware online for %s", runtimeStatus => {
    const result = project({ ...fixture, runtimeStatus }, 1000, 20);
    expect(result.status).toBe("offline");
    expect(result.runtimeStatus).toBe(runtimeStatus ?? "UNKNOWN");
    expect(result.activatedAt).toBe(123);
    expect(result.todayEarnings).toBe(7);
    expect(result.cumulativeEarningsUsdt).toBe(9);
  });
  it.each(["OFFLINE", "RUNNING"])("preserves a PC-activated %s device and its slot", status => {
    const result = project({ ...fixture, kind: "stellarbox-s1", status, runtimeStatus: "OFFLINE" }, 1000, 20);
    expect(result.activatedAt).toBe(123);
    expect(result.status).toBe("offline");
    expect(isActiveSlotDevice(result)).toBe(true);
    expect(isActiveSlotDevice({...result, pendingDeactivate:true})).toBe(false);
  });
  it.each([null, undefined])("does not invent activation time when the server returns %s", activatedAt => {
    const result = project({...fixture, kind:"stellarbox-s1", activatedAt, runtimeStatus:"ONLINE"},1000,20);
    expect(result.activatedAt).toBeNull();
    expect(result.activationUnconfirmed).toBe(true);
    expect(requiresActivationConfirmation(result)).toBe(true);
    expect(result.status).toBe("offline");
    expect(isActiveSlotDevice(result)).toBe(false);
  });
  it("keeps legal inventory activatable without inventing an activation time", () => {
    const result = project({ ...fixture, kind: "stellarbox-s1", status: "INVENTORY", activatedAt: null }, 1000, 20);
    expect(result.activatedAt).toBeNull();
    expect(result.activationUnconfirmed).toBe(false);
    expect(requiresActivationConfirmation(result)).toBe(false);
  });
  it("uses explicit online runtime without dropping pending state", () => {
    const result = project({ ...fixture, runtimeStatus: "ONLINE", pendingDeactivate: true }, 1000, 20);
    expect(result.status).toBe("online");
    expect(result.pendingDeactivate).toBe(true);
    expect(result.activatedAt).toBe(123);
  });
  it("preserves server phone calibration separately from task and earnings facts", () => {
    const result = project({ ...fixture, kind: "phone", capabilityTops: 32.3, capabilityTier: 3,
      gpuModel: "Mobile NPU · ~32.3 TOPS", runtimeStatus: "ONLINE" }, 1000, 20);
    expect(result.capabilityTops).toBe(32.3);
    expect(result.capabilityTier).toBe(3);
    expect(result.todayEarnings).toBe(7);
    expect(result.cumulativeEarningsUsdt).toBe(9);
    const older = project({ ...fixture, kind: "phone", gpuModel: "Mobile NPU · ~32.3 TOPS" }, 1000, 20);
    expect(older.capabilityTops).toBeUndefined();
    expect(older.capabilityTier).toBeUndefined();
  });
  it("does not revive a deactivated asset from runtime status", () => {
    const result = project({ ...fixture, status: "DEACTIVATED", runtimeStatus: "ONLINE" }, 1000, 20);
    expect(result.activatedAt).toBeNull();
    expect(result.status).toBe("offline");
  });
  it("fails closed when an active lifecycle also carries a deactivation time", () => {
    const result = project({ ...fixture, kind: "stellarbox-s1", runtimeStatus: "ONLINE", deactivatedAt: 456 }, 1000, 20);
    expect(result.activatedAt).toBeNull();
    expect(result.activationUnconfirmed).toBe(true);
    expect(result.status).toBe("offline");
    expect(isActiveSlotDevice(result)).toBe(false);
    expect(requiresActivationConfirmation(result)).toBe(true);
  });
  it("keeps a legal deactivated record with activation history as ordinary inventory", () => {
    const result = project({ ...fixture, kind: "stellarbox-s1", status: "DEACTIVATED", runtimeStatus: "ONLINE", deactivatedAt: 456 }, 1000, 20);
    expect(result.activatedAt).toBeNull();
    expect(result.activationUnconfirmed).toBe(false);
    expect(result.status).toBe("offline");
    expect(isActiveSlotDevice(result)).toBe(false);
    expect(requiresActivationConfirmation(result)).toBe(false);
  });
});

const cardSource = cardContent.split('<script setup lang="ts">')[1].split("</script>")[0];
const cardAst = ts.createSourceFile("card.ts", cardSource, ts.ScriptTarget.Latest, true);
let labelBody = "";
function findLabel(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(cardAst) === "statusLabel"
      && node.initializer && ts.isCallExpression(node.initializer)) labelBody = node.initializer.arguments[0].getText(cardAst);
  ts.forEachChild(node, findLabel);
}
findLabel(cardAst);
const labelFactory = new Function("props", "reconnecting", "idleGated", "deviceOnline", "task", "t", "phoneLocalReady", "phoneActivationGuidance", `return (${labelBody})();`);
const texts = { value: { earn: { runtimeUnknown: "unknown", offline: "offline", online: "online", phoneTaskPaused: "paused" }, myDevices: { inventoryPendingDeactivateChip: "pending", phoneActivationTitle: "activate phone", phoneActivationAppOnlyTitle: "use Android App" } } };
const withoutTask = (props: unknown, reconnecting: unknown, idleGated: unknown, deviceOnline: unknown, t: unknown) =>
  labelFactory(props, reconnecting, idleGated, deviceOnline, { value: null }, t, { value: true }, { value: { title: "activate phone" } });
describe("actual device card runtime label", () => {
  it("does not expose mock heartbeat controls in the remote phone card", () => {
    expect(cardContent).toContain("v-if=\"device.kind === 'phone' && !remoteApiEnabled\"");
  });
  it.each([["ONLINE", "online"], ["OFFLINE", "offline"], ["UNKNOWN", "unknown"]])("renders server phone %s as %s", (runtimeStatus, expected) => {
    expect(withoutTask({ device: { kind: "phone", capacitySource: "server", runtimeStatus } }, {value:false}, {value:false}, {value:false}, texts)).toBe(expected);
  });
  it.each([undefined, "UNKNOWN"])("renders unknown rather than offline for %s", runtimeStatus => {
    expect(withoutTask({ device: { kind: "cloud-share", capacitySource: "server", runtimeStatus } }, {value:false}, {value:false}, {value:false}, texts)).toBe("unknown");
  });
  it("keeps pending deactivation above unknown runtime", () => {
    expect(withoutTask({ device: {kind:"cloud-share", capacitySource:"server", runtimeStatus:"UNKNOWN", pendingDeactivate:true} }, {value:false}, {value:false}, {value:false}, texts)).toBe("pending");
  });
  it("renders known offline accurately", () => {
    expect(withoutTask({ device: {kind:"cloud-share", capacitySource:"server", runtimeStatus:"OFFLINE"} }, {value:false}, {value:false}, {value:false}, texts)).toBe("offline");
  });
  it("shows a server-paused phone task as paused even when the last runtime flag was ONLINE", () => {
    expect(labelFactory({ device: {kind:"phone", capacitySource:"server", runtimeStatus:"ONLINE"} },
      {value:false}, {value:false}, {value:false}, {value:{status:"PAUSED"}}, texts, {value:true}, {value:{title:"activate phone"}})).toBe("paused");
  });
  it("does not claim a different phone is running locally", () => {
    const phone = { device: { kind: "phone", capacitySource: "server", runtimeStatus: "ONLINE" } };
    for (const title of ["activate phone", "use Android App", "native unavailable"]) {
      expect(labelFactory(phone, {value:false}, {value:false}, {value:false}, {value:null}, texts, {value:false}, {value:{title}})).toBe(title);
    }
  });
});

// Recalibration is a distinct server-authorized repair flow; ordinary inventory activation stays blocked.
import inventoryContent from "../pages/me/devices.vue?raw";
const inventorySource = inventoryContent.split('<script setup lang="ts">')[1].split("</script>")[0];
const inventoryAst = ts.createSourceFile("devices.ts", inventorySource, ts.ScriptTarget.Latest, true);
let phoneOfferBody = "";
let phoneNavigationBody = "";
function findPhoneRecovery(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(inventoryAst) === "phoneNeedsActivation"
      && node.initializer && ts.isCallExpression(node.initializer)) phoneOfferBody = node.initializer.arguments[0].getText(inventoryAst);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "goPhoneActivation") phoneNavigationBody = node.getText(inventoryAst);
  ts.forEachChild(node, findPhoneRecovery);
}
findPhoneRecovery(inventoryAst);
const offerPhoneRecovery = new Function("app", "session", "requiresActivationConfirmation", `return (${phoneOfferBody})();`);
describe("phone reconciliation remains reachable", () => {
  it.each([[], [{kind:"phone",activatedAt:null,activationUnconfirmed:false}], [{kind:"phone",activatedAt:null,activationUnconfirmed:true}],
    [{kind:"phone",activatedAt:123},{kind:"phone",activatedAt:null,activationUnconfirmed:true}]].map(visibleDevices => ({visibleDevices})))("offers recovery for missing or unconfirmed phone facts", ({visibleDevices}) => {
    expect(offerPhoneRecovery({visibleDevices,accountKey:"u"}, {isCurrentDeviceCalibrated:()=>true}, requiresActivationConfirmation)).toBe(true);
  });
  it("does not require recalibration for a confirmed calibrated phone", () => {
    expect(offerPhoneRecovery({visibleDevices:[{kind:"phone",activatedAt:123}],accountKey:"u"}, {isCurrentDeviceCalibrated:()=>true}, requiresActivationConfirmation)).toBe(false);
  });
  it("navigates to the authenticated recalibration flow without a stale fleet gate", () => {
    const routes:string[]=[];
    new Function("navTo", "nativePhoneAvailable", `${phoneNavigationBody}; goPhoneActivation();`)((route:string)=>routes.push(route), true);
    expect(routes).toEqual(["/pages/onboarding/connect?mode=recalibrate"]);
    routes.length = 0;
    new Function("navTo", "nativePhoneAvailable", `${phoneNavigationBody}; goPhoneActivation();`)((route:string)=>routes.push(route), false);
    expect(routes).toEqual([]);
  });
});

// Execute the consumer callbacks and routing branch rather than copy their inventory rules.
function inventorySelection(content: string, name: string, visibleDevices: unknown[]): { id: string }[] {
  const script = content.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("inventory.ts", script, ts.ScriptTarget.Latest, true);
  let callback = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name
      && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!callback) throw new Error(`${name} missing`);
  return new Function("app", "isActivatableInventoryDevice", "requiresActivationConfirmation", `return (${callback})();`)(
    { visibleDevices }, isActivatableInventoryDevice, requiresActivationConfirmation,
  );
}

const slotStoreAst = ts.createSourceFile("slot-action-sheet.ts", slotStoreSource, ts.ScriptTarget.Latest, true);
let openForSlotBody = "";
function findSlotBranch(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "openForSlot") openForSlotBody = node.getText(slotStoreAst);
  ts.forEachChild(node, findSlotBranch);
}
findSlotBranch(slotStoreAst);
if (!openForSlotBody) throw new Error("openForSlot missing");
function openInventory(visibleDevices: unknown[]) {
  const open = { value: false };
  const routes: string[] = [];
  new Function("useApp", "open", "navTo", "isActivatableInventoryDevice", "requiresActivationConfirmation", `${openForSlotBody}; openForSlot();`)(
    () => ({ visibleDevices }), open, (route: string) => routes.push(route), isActivatableInventoryDevice, requiresActivationConfirmation,
  );
  return { open: open.value, routes };
}

describe("purchased inventory excludes historical phones", () => {
  const oldPhone = project({ ...fixture, id: 1144, kind: "phone", status: "DEACTIVATED", activatedAt: null }, 1000, 20);
  const currentPhone = project({ ...fixture, id: 1151, kind: "phone" }, 1000, 20);

  it("does not advertise an old phone as inventory or hide the current active phone", () => {
    const devices = [oldPhone, currentPhone];
    for (const content of [inventoryContent, slotSheetContent]) {
      expect(inventorySelection(content, "inactiveDevices", devices)).toEqual([]);
    }
    expect(inventorySelection(inventoryContent, "activeDevices", devices).map((device) => device.id)).toEqual(["1151"]);
    expect(devices.filter(isActiveSlotDevice)).toEqual([currentPhone]);
    expect(openInventory([oldPhone])).toEqual({ open: false, routes: ["/pages/store/store"] });
    expect(openInventory(devices)).toEqual({ open: false, routes: ["/pages/store/store"] });
  });

  it("keeps real hardware and Cloud Share inventory in both lists and opens their chooser", () => {
    const hardware = project({ ...fixture, id: 1201, kind: "stellarbox-s1", status: "DEACTIVATED" }, 1000, 20);
    const cloud = project({ ...fixture, id: 1202, kind: "cloud-share", status: "INVENTORY", activatedAt: null }, 1000, 20);
    const devices = [oldPhone, currentPhone, hardware, cloud];
    for (const content of [inventoryContent, slotSheetContent]) {
      expect(inventorySelection(content, "inactiveDevices", devices).map((device) => device.id)).toEqual(["1201", "1202"]);
    }
    expect(openInventory(devices)).toEqual({ open: true, routes: [] });
  });

  it.each(["phone", "stellarbox-s1"])("keeps unconfirmed %s visible without an inventory activation promise", (kind) => {
    const unconfirmed = project({ ...fixture, id: 1203, kind, activatedAt: null }, 1000, 20);
    for (const content of [inventoryContent, slotSheetContent]) {
      expect(inventorySelection(content, "inactiveDevices", [unconfirmed])).toEqual([]);
      expect(inventorySelection(content, "unconfirmedDevices", [unconfirmed]).map((device) => device.id)).toEqual(["1203"]);
    }
    expect(openInventory([unconfirmed])).toEqual({ open: true, routes: [] });
  });
});
