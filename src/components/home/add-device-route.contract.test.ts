import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import home from "./add-device-row.vue?raw";
import { useSlotActionSheet } from "@/store/slot-action-sheet";

const f = vi.hoisted(() => ({ app: { accountKey: "user:1", remoteFleetStatus: "ready", visibleDevices: [] as any[], refreshRemoteFleet: vi.fn() }, navTo: vi.fn(), error: vi.fn() }));
vi.mock("@/store/app", () => ({ useApp: () => f.app }));
vi.mock("@/lib/route", () => ({ navTo: f.navTo }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true }));
vi.mock("@/store/ui", () => ({ toast: { error: f.error } }));
vi.mock("@/i18n/use-t", () => ({ useT: () => ({ value: { myDevices: { inventoryStaleWarning: "Retry device data" } } }) }));
beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks();
  Object.assign(f.app, { accountKey: "user:1", remoteFleetStatus: "ready", visibleDevices: [] });
});
const ast = ts.createSourceFile("home.ts", home.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.Latest, true);
const go = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "go")!.getText(ast);
function homeClick() { new Function("useSlotActionSheet", `${go}; go();`)(useSlotActionSheet); }

describe("home and empty-slot inventory routing", () => {
  it("home opens the existing chooser when selectable inventory exists", () => {
    f.app.visibleDevices = [{ kind: "stellarbox-s1", activatedAt: null }]; homeClick();
    expect(useSlotActionSheet().open).toBe(true); expect(f.navTo).not.toHaveBeenCalled();
  });
  it("empty inventory and old phones go to the store", async () => {
    f.app.visibleDevices = [{ kind: "phone", activatedAt: null }];
    await useSlotActionSheet().openForSlot();
    expect(f.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/store");
    expect(useSlotActionSheet().open).toBe(false);
  });
  it("failed reads retain a retry path without routing to the store", async () => {
    f.app.remoteFleetStatus = "error"; f.app.refreshRemoteFleet.mockResolvedValue(false);
    await useSlotActionSheet().openForSlot();
    expect(f.error).toHaveBeenCalledWith("Retry device data"); expect(f.navTo).not.toHaveBeenCalled();
    f.app.refreshRemoteFleet.mockImplementation(async () => {
      f.app.visibleDevices = [{ kind: "cloud-share", activatedAt: null }]; return true;
    });
    await useSlotActionSheet().openForSlot(); expect(useSlotActionSheet().open).toBe(true);
    useSlotActionSheet().hide(); expect(useSlotActionSheet().open).toBe(false);
  });
  it("a response from a previous account cannot open the chooser or navigate", async () => {
    f.app.remoteFleetStatus = "idle";
    f.app.refreshRemoteFleet.mockImplementation(async () => { f.app.accountKey = "user:2"; return true; });
    await useSlotActionSheet().openForSlot();
    expect(useSlotActionSheet().open).toBe(false); expect(f.navTo).not.toHaveBeenCalled();
  });
});
