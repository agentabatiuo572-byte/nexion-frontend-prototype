// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const taskCenter = readFileSync(new URL("./task-center.vue", import.meta.url), "utf8");
const receiptsPage = readFileSync(new URL("../../pages/me/receipts.vue", import.meta.url), "utf8");
const appStore = readFileSync(new URL("../../store/app.ts", import.meta.url), "utf8");

describe("earn history Proof-of-Compute interaction", () => {
  it("uses the same receipt document glyph as the high-fidelity page and no R placeholder", () => {
    expect(taskCenter).toContain('d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2');
    expect(taskCenter).not.toContain('font-weight: 600">R</text>');
  });

  it("opens a canonical receipt from the whole history row and the remote receipts list", () => {
    expect(taskCenter).toMatch(/@click\.stop="openTaskReceipt\(task\)"/);
    expect(taskCenter).toMatch(/taskAssignmentApi\.receipt\(task\.receiptNo\)/);
    expect(receiptsPage).toMatch(/@click\.stop="openRemoteComputeReceipt\(r\)"/);
    expect(receiptsPage).toMatch(/taskAssignmentApi\.receipt\(task\.receiptNo/);
  });

  it("loads the selected remote receipt category from its canonical paginated authority", () => {
    expect(receiptsPage).toMatch(/taskAssignmentApi\.receipts\(offset, 20, cursor\)/);
    expect(receiptsPage).toContain("remoteComputeReceiptNextOffset");
    expect(receiptsPage).toContain('remoteReceiptKind.value === "compute"');
    expect(receiptsPage).toContain("loadSelectedRemoteReceipts");
    expect(receiptsPage).toContain("loadSelectedMoreRemoteReceipts");
    expect(receiptsPage).not.toContain("Promise.allSettled(requests)");
    expect(receiptsPage).not.toContain("app.visibleDevices.flatMap");
  });

  it("keeps Proof-of-Compute and top-up receipts in separate tabs with a compute default", () => {
    expect(receiptsPage).toContain('type RemoteReceiptKind = "compute" | "deposit"');
    expect(receiptsPage).toContain('const remoteReceiptKind = ref<RemoteReceiptKind>("compute")');
    expect(receiptsPage).toContain('onLoad((options) =>');
    expect(receiptsPage).toContain('options?.kind === "deposit" ? "deposit" : "compute"');
    expect(receiptsPage).toContain('v-if="remoteReceiptKind === \'compute\'"');
    expect(receiptsPage).toContain('v-if="remoteReceiptKind === \'deposit\'"');
  });

  it("invalidates receipt requests on every account binding and supports keyboard pagination", () => {
    expect(appStore).toContain("const accountBindingEpoch = ref(remoteAccountEpoch.snapshot().epoch)");
    expect(appStore).toContain("accountBindingEpoch.value = remoteAccountEpoch.snapshot().epoch");
    expect(appStore).toMatch(/return \{\s*accountKey, accountBindingEpoch,/);
    expect(taskCenter).toContain("app.accountBindingEpoch");
    expect(receiptsPage).toContain("expectedBindingEpoch !== app.accountBindingEpoch");
    expect(receiptsPage).toMatch(/watch\(\s*\(\) => \[app\.accountKey, app\.accountBindingEpoch\]/);
    expect(receiptsPage).toContain('@keydown.enter.stop.prevent="loadSelectedMoreRemoteReceipts"');
    expect(receiptsPage).toContain('@keydown.space.stop.prevent="loadSelectedMoreRemoteReceipts"');
  });

  it("uses the same 8 GB routing capacity as the server for Cloud Share", () => {
    expect(taskCenter).toContain("const CLOUD_SHARE_ROUTING_VRAM_GB = 8");
    expect(taskCenter).toMatch(/d\.kind === "cloud-share" \? CLOUD_SHARE_ROUTING_VRAM_GB : d\.vramTotal/);
  });
});
