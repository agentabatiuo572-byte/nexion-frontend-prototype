import { describe, expect, it } from "vitest";
import { createReceiptsPageRequestFence } from "./receipts-page-request-fence";
import receiptsPageSource from "./receipts.vue?raw";

describe("receipts page request fence", () => {
  it("rejects an async compute response after hide or an account rebind", async () => {
    let accountKey = "user-a";
    let accountBindingEpoch = 1;
    const fence = createReceiptsPageRequestFence(() => accountKey, () => accountBindingEpoch);
    fence.show();
    const scope = fence.capture("compute");
    let resolveOld!: (value: string) => void;
    const oldRequest = new Promise<string>((resolve) => { resolveOld = resolve; });
    let rendered = "";
    const settle = oldRequest.then((value) => {
      if (fence.isCurrent(scope)) rendered = value;
    });

    fence.hide();
    accountKey = "user-b";
    accountBindingEpoch += 1;
    fence.show();
    resolveOld("stale receipt");
    await settle;

    expect(rendered).toBe("");
  });

  it("does not let an old load-more finally clear a newer page busy state", async () => {
    const fence = createReceiptsPageRequestFence(() => "user-a", () => 1);
    fence.show();
    const staleMore = fence.capture("more");
    let resolveOld!: () => void;
    const oldRequest = new Promise<void>((resolve) => { resolveOld = resolve; });
    let busy = true;
    const settle = oldRequest.finally(() => {
      if (fence.isCurrent(staleMore)) busy = false;
    });

    fence.hide();
    busy = false;
    fence.show();
    fence.capture("more");
    busy = true;
    resolveOld();
    await settle;

    expect(busy).toBe(true);
  });
});

describe("receipts page lifecycle wiring", () => {
  it("invalidates all receipt lanes on hide and refreshes only the selected source on show", () => {
    expect(receiptsPageSource).toContain('from "@dcloudio/uni-app"');
    expect(receiptsPageSource).toMatch(/onHide\(\(\) => \{[\s\S]*invalidateRemoteReceiptsPage\(\)/);
    expect(receiptsPageSource).toMatch(/onShow\(\(\) => \{[\s\S]*receiptsPageFence\.show\(\)[\s\S]*loadSelectedRemoteReceipts\(\)/);
    expect(receiptsPageSource).toMatch(/function loadSelectedRemoteReceipts\(\): void \{[\s\S]*remoteReceiptKind\.value === "compute"[\s\S]*loadRemoteComputeReceipts\(0, false\)[\s\S]*refreshRemoteVietQrDeposits\(\)/);
    expect(receiptsPageSource).toMatch(/function invalidateRemoteReceiptsPage\(\)[\s\S]*receiptRequestEpoch \+= 1[\s\S]*receiptPageRequestEpoch \+= 1[\s\S]*remoteComputeMoreLoading\.value = false[\s\S]*remoteDepositMoreLoading\.value = false[\s\S]*open\.value = null[\s\S]*invalidateRemoteVietQrReceiptReads\(\)/);
  });
});
