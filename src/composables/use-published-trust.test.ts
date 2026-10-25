import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrustSectionApi, type PublishedTrustSection } from "@/api/trust-section-api";

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
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function batch(version: string): PublishedTrustSection[] {
  return (["financials", "leadership", "nexNarrative", "complianceBadges", "auditsReserves", "listings"] as const).map(sectionKey => ({
    sectionKey,
    version,
    description: version,
    structure: "fields",
    fields: [{ key: "summary", label: "Summary", value: sectionKey === 'listings' ? '' : version }],
  }));
}

beforeEach(() => {
  current.mockReset();
  runListeners.forEach(listener => listener({ runId: null, epoch: 0 }));
});

describe("published Trust Run isolation", () => {
  it("detaches an old request and lets the new commerce Run refresh immediately", async () => {
    const oldRequest = deferred<PublishedTrustSection[]>();
    current.mockReturnValueOnce(oldRequest.promise);
    const trust = usePublishedTrust();
    const staleRefresh = trust.refresh(true);

    runListeners.forEach((listener) => listener({ runId: "trust-next-run-20260819", epoch: 2 }));
    current.mockResolvedValueOnce(batch("v2"));
    const currentRefresh = trust.refresh(true);
    oldRequest.resolve(batch("v1"));

    await expect(staleRefresh).resolves.toBe(false);
    await expect(currentRefresh).resolves.toBe(true);
    expect(current).toHaveBeenCalledTimes(2);
    expect(trust.sections.value).toEqual(batch("v2"));
    expect(trust.status.value).toBe("ready");
  });

  it('retains a complete snapshot while refreshing and after failure, then atomically replaces all six sections', async () => {
    const trust = usePublishedTrust();
    current.mockResolvedValueOnce(batch('v1'));
    await trust.refresh();
    const refresh = deferred<PublishedTrustSection[]>();
    current.mockReturnValueOnce(refresh.promise);
    const result = trust.refresh(true);
    expect(trust.refresh(true)).toBe(result);
    expect(trust.refreshing.value).toBe(true);
    expect(trust.sections.value).toEqual(batch('v1'));
    refresh.reject(new Error('503'));
    await expect(result).resolves.toBe(false);
    expect(trust.refreshing.value).toBe(false);
    expect(trust.refreshError.value).toBe(true);
    expect(trust.sections.value).toEqual(batch('v1'));
    current.mockResolvedValueOnce(batch('v2'));
    await expect(trust.refresh()).resolves.toBe(true);
    expect(trust.sections.value).toEqual(batch('v2'));
    expect(trust.refreshError.value).toBe(false);
    expect(current).toHaveBeenCalledTimes(3);
  });

  it('rejects incomplete/invalid-source collections through the real parser without mixing them into the snapshot', async () => {
    const request = vi.fn();
    const api = createTrustSectionApi({ request } as never);
    current.mockImplementation(api.current);
    const envelope = { serverCanonical: true, source: 'nx_trust_section_version:published', sourceEnvironment: 'PRODUCTION', runId: '', sections: batch('v1') };
    request.mockResolvedValueOnce(envelope);
    const trust = usePublishedTrust();
    await expect(trust.refresh()).resolves.toBe(true);
    for (const invalid of [{ ...envelope, sections: batch('v2').slice(1) }, { ...envelope, source: 'other' }, { ...envelope, sections: [] }]) {
      request.mockResolvedValueOnce(invalid);
      await expect(trust.refresh(true)).resolves.toBe(false);
      expect(trust.sections.value).toEqual(batch('v1'));
      expect(trust.refreshError.value).toBe(true);
    }
    expect(request.mock.calls.every(([input]) => input.path === '/api/content/trust/sections/current')).toBe(true);
  });

  it('clears prior-source content immediately and ignores an old failure during the new runtime read', async () => {
    const trust = usePublishedTrust();
    current.mockResolvedValueOnce(batch('v1'));
    await trust.refresh();
    const old = deferred<PublishedTrustSection[]>(), next = deferred<PublishedTrustSection[]>();
    current.mockReturnValueOnce(old.promise);
    const previous = trust.refresh(true);
    runListeners.forEach(listener => listener({ runId: 'new-source', epoch: 2 }));
    expect(trust.sections.value).toEqual([]);
    expect(trust.status.value).toBe('idle');
    expect(trust.refreshError.value).toBe(false);
    current.mockReturnValueOnce(next.promise);
    const active = trust.refresh();
    old.reject(new Error('old request failed'));
    await expect(previous).resolves.toBe(false);
    expect(trust.status.value).toBe('loading');
    expect(trust.refresh(true)).toBe(active);
    next.reject(new Error('new source unavailable'));
    await expect(active).resolves.toBe(false);
    expect(trust.sections.value).toEqual([]);
    expect(trust.status.value).toBe('error');
    expect(trust.refreshError.value).toBe(false);
  });
});
