import { describe, expect, it } from "vitest";
import { deviceName, deviceNameByKind, deviceNameInline } from "./device-copy";
import { localized } from "./promotion-display";
import { en } from "@/i18n/messages/en";
import { createExchangePendingMutationStore, exchangeSwapFingerprint } from "./exchange-pending-mutation";

describe("UVT migration preserves stored product and pending command truth", () => {
  it.each(["UVELBox S1", "NexGridBox S1", "StellarBox Pro", "My custom device"])("renders stored product name verbatim: %s", name => {
    expect(deviceName(en, { kind: "stellarbox-s1", name })).toBe(name);
    expect(deviceNameByKind(en, "stellarbox-s1", name)).toBe(name);
    expect(deviceNameInline(en, "stellarbox-s1", name)).toBe(name);
    expect(localized({ zh: name, en: name, vi: name }, "en")).toBe(name);
  });
  it.each([["USDT_TO_NEX", "USDT_TO_UVT"], ["NEX_TO_USDT", "UVT_TO_USDT"]] as const)("retains the pending key through %s migration", (oldDirection, direction) => {
    const old = { accountKey: "user:1", fingerprint: `user:1:${oldDirection}:10.000000:QUEUE`, key: "original-key", intent: { direction: oldDirection, fromAmount: 10, queueIfCapped: true }, baselineOrderNos: ["EX-before"] };
    const storage = { read: () => ({ version: 1, records: [old] }), write: () => { throw new Error("Must not issue a replacement command"); } };
    const pending = createExchangePendingMutationStore(storage, () => "replacement-key");
    const intent = { direction, fromAmount: 10, queueIfCapped: true };
    expect(pending.acquire("user:1", intent, [])).toEqual({ ...old, intent, fingerprint: exchangeSwapFingerprint("user:1", intent) });
    expect(pending.list("user:1")[0].key).toBe("original-key");
  });
});
