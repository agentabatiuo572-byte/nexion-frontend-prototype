import { describe, expect, it, vi } from "vitest";
import type { PublishedTrustSection } from "@/api/trust-section-api";

const { current, runListeners } = vi.hoisted(() => ({
  current: vi.fn(),
  runListeners: new Set<(scope: { runId: string | null; epoch: number }) => void>(),
}));

vi.mock("@/api/runtime", () => ({
  trustSectionApi: { current, recordView: vi.fn() },
}));

vi.mock("@/api/order-api", () => ({
  subscribeRuntimeRevision: vi.fn((listener) => {
    runListeners.add(listener);
    return () => runListeners.delete(listener);
  }),
}));

import { usePublishedTrust } from "./use-published-trust";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function section(version: string): PublishedTrustSection {
  return {
    sectionKey: "financials",
    version,
    description: version,
    structure: "fields",
    fields: [{ key: "tvlOnChain", label: "TVL", value: version }],
  };
}

describe("published Trust Run isolation", () => {
  it("detaches an old request and lets the new commerce Run refresh immediately", async () => {
    const oldRequest = deferred<PublishedTrustSection[]>();
    current.mockReturnValueOnce(oldRequest.promise);
    const trust = usePublishedTrust();
    const staleRefresh = trust.refresh(true);

    runListeners.forEach((listener) => listener({ runId: "trust-next-run-20260819", epoch: 2 }));
    current.mockResolvedValueOnce([section("v2")]);
    const currentRefresh = trust.refresh(true);
    oldRequest.resolve([section("v1")]);

    await expect(staleRefresh).resolves.toBe(false);
    await expect(currentRefresh).resolves.toBe(true);
    expect(current).toHaveBeenCalledTimes(2);
    expect(trust.sections.value).toEqual([section("v2")]);
    expect(trust.status.value).toBe("ready");
  });
});
