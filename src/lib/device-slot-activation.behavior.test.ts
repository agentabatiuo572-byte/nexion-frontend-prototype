import { computed, ref } from "vue";
import { parse } from "@vue/compiler-sfc";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import appSource from "@/store/app.ts?raw";
import sheetSource from "@/components/slot-action-sheet.vue?raw";
import inventorySource from "@/pages/me/devices.vue?raw";
import checkoutSource from "@/pages/store/checkout.vue?raw";
import { isActiveSlotDevice, requiresActivationConfirmation } from "./device-slot-policy";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { DeviceKind } from "@/store/types";

function actualFunction(source: string, name: string, deps: Record<string, unknown>) {
  const code = source.includes("<script") ? parse(source).descriptor.scriptSetup!.content : source;
  const ast = ts.createSourceFile("activation.ts", code, ts.ScriptTarget.Latest, true);
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const compiled = ts.transpileModule(found!.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), `${compiled}; return ${name};`)(...Object.values(deps));
}

describe("all-device activation capacity", () => {
  it.each<DeviceKind>(["cloud-share", "phone", "pc-gpu", "stellarbox-s1", "stellarbox-pro-v2", "stellarrack-p2"])("keeps %s waiting for task completion in its slot and permits a replacement only after actual deactivation", kind => {
    const task = { id: "running-task" };
    const devices = ref(Array.from({ length: 7 }, (_, index) => ({ id: String(index), kind,
      activatedAt: index < 6 ? 123 as number | null : null,
      pendingDeactivate: false, currentTask: index === 0 ? task : null,
    })));
    const count = computed(() => devices.value.filter(isActiveSlotDevice).length);
    const deps = { devices, activeSlotCount: count, remoteSlotUsage: ref(null), slotCap: ref(6), computeShareEnabled: ref(true), persistAccountSnapshot: vi.fn(() => true) };
    const activate = actualFunction(appSource, "activateDevice", deps);
    actualFunction(appSource, "scheduleDeactivation", deps)("0");
    expect(devices.value[0]).toMatchObject({ activatedAt: 123, pendingDeactivate: true, currentTask: task });
    expect(count.value).toBe(6);
    expect(activate("6")).toBe(false);
    expect(count.value).toBe(6);
    expect(actualFunction(appSource, "deactivateDevice", deps)("0")).toBe(true);
    expect(devices.value[0]).toMatchObject({ activatedAt: null, pendingDeactivate: false, currentTask: null });
    expect(count.value).toBe(5);
    expect(activate("6")).toBe(true);
    expect(count.value).toBe(6);
  });

  it.each<DeviceKind>(["cloud-share", "phone", "pc-gpu", "stellarbox-s1", "stellarbox-pro-v2", "stellarrack-p2"])("allows %s as device six, blocks device seven, and retains the trial reservation", kind => {
    const devices = ref(Array.from({ length: 6 }, (_, index) => ({ id: String(index), kind, activatedAt: index < 5 ? 123 as number | null : null })));
    const persistAccountSnapshot = vi.fn(() => true);
    const activate = actualFunction(appSource, "activateDevice", {
      devices, activeSlotCount: computed(() => devices.value.filter(isActiveSlotDevice).length),
      remoteSlotUsage: ref(null),
      slotCap: ref(6), computeShareEnabled: ref(true), persistAccountSnapshot,
    });
    expect(activate("5", 1)).toBe(false);
    expect(persistAccountSnapshot).not.toHaveBeenCalled();
    expect(activate("5", 0)).toBe(true);
    devices.value.push({ id: "6", kind, activatedAt: null });
    expect(activate("6", 0)).toBe(false);
    devices.value[0].activatedAt = null;
    expect(activate("6", 0)).toBe(true);
    expect(devices.value.filter(isActiveSlotDevice)).toHaveLength(6);
  });

  it("blocks device six when five active devices plus a confirmed order reservation use all capacity", () => {
    const devices = ref(Array.from({ length: 6 }, (_, index) => ({ id: String(index), kind: "cloud-share" as const, activatedAt: index < 5 ? 123 as number | null : null })));
    const remoteSlotUsage = ref({ slotsUsed: 6, reservedSlotCount: 1, trialSlotCount: 0 });
    const persistAccountSnapshot = vi.fn(() => true);
    const activate = actualFunction(appSource, "activateDevice", { devices, remoteSlotUsage,
      activeSlotCount: computed(() => devices.value.filter(isActiveSlotDevice).length), slotCap: ref(6),
      computeShareEnabled: ref(true), persistAccountSnapshot });
    expect(activate("5", 0)).toBe(false);
    expect(persistAccountSnapshot).not.toHaveBeenCalled();
    expect(devices.value.filter(isActiveSlotDevice)).toHaveLength(5);
    remoteSlotUsage.value = { slotsUsed: 5, reservedSlotCount: 0, trialSlotCount: 0 };
    expect(activate("5", 0)).toBe(true);
  });

  it.each([zh, en, vietnamese])("blocks Cloud Share from the actual sheet and inventory handlers when full", async copy => {
    const app = { slotCap: 6, activateDevice: vi.fn(() => true) };
    const toast = { warn: vi.fn(), success: vi.fn() };
    const device = { id: "cloud-7", kind: "cloud-share", activatedAt: null };
    const deps = { app, toast, requiresActivationConfirmation, t: ref(copy), fmt, slotsFull: ref(true),
      reservedSlots: ref(0), remoteApiEnabled: false, sheet: { hide: vi.fn() },
      canControlDevice: () => true, slotsUsed: ref(6), activationReady: ref(true),
    };
    await actualFunction(sheetSource, "onActivate", deps)(device);
    await actualFunction(inventorySource, "handleActivate", deps)(device);
    expect(app.activateDevice).not.toHaveBeenCalled();
    expect(toast.warn).toHaveBeenNthCalledWith(1, fmt(copy.slotSheet.toastSlotsFull, { max: 6 }));
    expect(toast.warn).toHaveBeenNthCalledWith(2, fmt(copy.myDevices.inventoryToastSlotsFull, { max: 6 }));
    expect(fmt(copy.slotSheet.desc, { max: 6 })).toContain("Cloud Share");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the same full-slot warning for Cloud Share and hardware without changing trial conversion", () => {
    const script = parse(checkoutSource).descriptor.scriptSetup!.content;
    const ast = ts.createSourceFile("checkout.ts", script, ts.ScriptTarget.Latest, true);
    const declarations = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
      .filter(node => ["cappedRaw", "capped"].includes(node.name.getText(ast)));
    const compiled = ts.transpileModule(declarations.map(node => `const ${node.getText(ast)};`).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const app = { activeSlotCount: 5, slotCap: 6 };
    const trialConversionMode = ref(false), hasTradein = ref(false), reservedSlots = ref(1);
    const view = new Function("computed", "app", "trialConversionMode", "hasTradein", "reservedSlots", `${compiled}; return capped;`)(computed, app, trialConversionMode, hasTradein, reservedSlots);
    expect(view.value).toBe(true);
    trialConversionMode.value = true;
    expect(view.value).toBe(false);
    hasTradein.value = true;
    expect(view.value).toBe(false);
  });
});
