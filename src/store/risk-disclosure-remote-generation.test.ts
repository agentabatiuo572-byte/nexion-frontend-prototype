import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createPinia, setActivePinia } from "pinia";
import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  sessionVault: { read: vi.fn(() => ({ accessToken: "test" }) as { accessToken: string } | null) },
  riskDisclosureApi: {
    current: vi.fn(),
    publicCurrent: vi.fn(),
    acknowledge: vi.fn(),
    checkGate: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useRiskDisclosure } = await import("./risk-disclosure");
const { remoteAccountScope } = await import("@/lib/remote-account-epoch");

function disclosure(version: string, acknowledged: boolean): RiskDisclosureCurrent {
  return {
    source: "server",
    sourceEnvironment: "PRODUCTION",
    jurisdiction: "VN",
    jurisdictionName: "Vietnam",
    version,
    languageScope: "zh+vi+en",
    effectiveDate: "2026-09-07",
    acknowledged,
    acknowledgedAt: acknowledged ? "2026-09-07T00:00:00Z" : null,
    chapters: Array.from({ length: 7 }, (_, index) => ({
      no: String(index + 1).padStart(2, "0"),
      zh: `中文 ${index + 1}`,
      vi: `Tieng Viet ${index + 1}`,
      en: `English ${index + 1}`,
      zhBody: `中文正文 ${index + 1}`,
      viBody: `Tieng Viet body ${index + 1}`,
      enBody: `English body ${index + 1}`,
    })),
    acknowledgmentToken: acknowledged ? null : `ack-${version}`,
    acknowledgmentTokenExpiresAt: acknowledged ? null : "2026-09-08T00:00:00Z",
    minimumReadingSeconds: 30,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("risk disclosure remote request generation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    remote.riskDisclosureApi.current.mockReset();
    remote.riskDisclosureApi.publicCurrent.mockReset();
    remote.sessionVault.read.mockReturnValue({ accessToken: "test" });
    remote.riskDisclosureApi.acknowledge.mockReset();
    remote.riskDisclosureApi.checkGate.mockReset();
    remoteAccountScope.bind(`risk-disclosure-test-${Date.now()}-${Math.random()}`);
  });

  it("loads anonymous published copy without offering an acknowledgement", async () => {
    remote.sessionVault.read.mockReturnValue(null);
    remote.riskDisclosureApi.publicCurrent.mockResolvedValue({
      ...disclosure("public", false), acknowledgmentToken: null, acknowledgmentTokenExpiresAt: null,
    });
    const store = useRiskDisclosure();
    await store.refresh("VN");
    expect(store.current?.version).toBe("public");
    expect(remote.riskDisclosureApi.publicCurrent).toHaveBeenCalledWith("VN");
    expect(remote.riskDisclosureApi.current).not.toHaveBeenCalled();
    expect(await store.accept()).toBe(false);
    expect(remote.riskDisclosureApi.acknowledge).not.toHaveBeenCalled();
  });

  it("does not guess a jurisdiction for an anonymous direct link", async () => {
    remote.sessionVault.read.mockReturnValue(null);
    const store = useRiskDisclosure();
    await store.refresh();
    expect(store.error).toBe("RISK_DISCLOSURE_COUNTRY_REQUIRED");
    expect(remote.riskDisclosureApi.publicCurrent).not.toHaveBeenCalled();
  });

  it("classifies only the exact missing published version and never acknowledges it", async () => {
    remote.riskDisclosureApi.current.mockRejectedValue(new ApiError({ kind: "http", status: 404, code: 404, message: "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND" }));
    const store = useRiskDisclosure();
    await store.refresh();
    expect(store.publicationUnavailable).toBe(true);
    expect(store.current).toBeNull();
    expect(store.accepted).toBe(false);
    expect(await store.accept()).toBe(false);
    expect(remote.riskDisclosureApi.acknowledge).not.toHaveBeenCalled();
    remote.riskDisclosureApi.current.mockRejectedValue(new ApiError({ kind: "network", message: "offline" }));
    await store.refresh();
    expect(store.publicationUnavailable).toBe(false);
    remote.riskDisclosureApi.current.mockResolvedValue(disclosure("v2", false));
    await store.refresh();
    expect(store.error).toBeNull();
    expect(store.publicationUnavailable).toBe(false);
    expect(store.current?.version).toBe("v2");
  });

  it.each([
    new Error("RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND"),
    new ApiError({ kind: "business", status: 404, code: 404, message: "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND" }),
    new ApiError({ kind: "http", status: 503, code: 404, message: "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND" }),
    new ApiError({ kind: "http", status: 404, code: 503, message: "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND" }),
    new ApiError({ kind: "http", status: 404, code: 404, message: "RISK_DISCLOSURE_JURISDICTION_NOT_CONFIGURED" }),
  ])("keeps other errors on the existing retry path: %s", async (error) => {
    remote.riskDisclosureApi.current.mockRejectedValue(error);
    const store = useRiskDisclosure();
    await store.refresh();
    expect(store.publicationUnavailable).toBe(false);
    expect(store.error).toBe(error.message);
    expect(store.current).toBeNull();
  });

  it("ignores a stale missing-publication response after account rebind", async () => {
    const old = deferred<RiskDisclosureCurrent>();
    const next = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const store = useRiskDisclosure();
    const pending = store.refresh();
    remoteAccountScope.bind("new-risk-account");
    store.bindAccount();
    expect(store.publicationUnavailable).toBe(false);
    next.resolve(disclosure("v2", false));
    await flush();
    old.reject(new ApiError({ kind: "http", status: 404, code: 404, message: "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND" }));
    await pending;
    expect(store.current?.version).toBe("v2");
    expect(store.publicationUnavailable).toBe(false);
    expect(store.error).toBeNull();
  });

  it("keeps the latest same-account refresh when an earlier refresh resolves late", async () => {
    const earlier = deferred<RiskDisclosureCurrent>();
    const later = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const store = useRiskDisclosure();

    const firstRefresh = store.refresh();
    const secondRefresh = store.refresh();
    later.resolve(disclosure("v2", true));
    await secondRefresh;
    earlier.resolve(disclosure("v1", false));
    await firstRefresh;

    expect(store.current?.version).toBe("v2");
    expect(store.accepted).toBe(true);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("does not let an earlier same-account failure erase a newer disclosure", async () => {
    const earlier = deferred<RiskDisclosureCurrent>();
    const later = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const store = useRiskDisclosure();

    const firstRefresh = store.refresh();
    const secondRefresh = store.refresh();
    later.resolve(disclosure("v2", true));
    await secondRefresh;
    earlier.reject(new Error("old request failed"));
    await firstRefresh;

    expect(store.current?.version).toBe("v2");
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("does not clear the latest loading state when a superseded request finishes", async () => {
    const earlier = deferred<RiskDisclosureCurrent>();
    const later = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const store = useRiskDisclosure();

    const firstRefresh = store.refresh();
    const secondRefresh = store.refresh();
    earlier.resolve(disclosure("v1", false));
    await firstRefresh;

    expect(store.loading).toBe(true);
    later.resolve(disclosure("v2", true));
    await secondRefresh;
    expect(store.loading).toBe(false);
  });

  it("reads current again after acknowledgement instead of trusting an old acknowledgement response", async () => {
    remote.riskDisclosureApi.current
      .mockResolvedValueOnce(disclosure("v1", false))
      .mockResolvedValueOnce(disclosure("v2", false));
    remote.riskDisclosureApi.acknowledge.mockResolvedValueOnce(disclosure("v1", true));
    const store = useRiskDisclosure();

    await store.refresh();
    const accepted = await store.accept();

    expect(accepted).toBe(false);
    expect(store.current?.version).toBe("v2");
    expect(store.accepted).toBe(false);
    expect(remote.riskDisclosureApi.current).toHaveBeenCalledTimes(2);
  });

  it("does not let a delayed acknowledgement response overwrite a newer refresh", async () => {
    const acknowledgement = deferred<RiskDisclosureCurrent>();
    const refreshed = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current
      .mockResolvedValueOnce(disclosure("v1", false))
      .mockReturnValueOnce(refreshed.promise);
    remote.riskDisclosureApi.acknowledge.mockReturnValueOnce(acknowledgement.promise);
    const store = useRiskDisclosure();

    await store.refresh();
    const accepting = store.accept();
    const refreshing = store.refresh();
    refreshed.resolve(disclosure("v2", false));
    await refreshing;
    acknowledgement.resolve(disclosure("v1", true));
    await accepting;

    expect(store.current?.version).toBe("v2");
    expect(store.accepted).toBe(false);
    expect(store.error).toBeNull();
  });

  it("rejects a previous account's acknowledgement without issuing its follow-up read", async () => {
    const acknowledgement = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockResolvedValueOnce(disclosure("account-a", false))
      .mockResolvedValueOnce(disclosure("account-b", false));
    remote.riskDisclosureApi.acknowledge.mockReturnValueOnce(acknowledgement.promise);
    const store = useRiskDisclosure();
    await store.refresh();
    const accepting = store.accept();
    remoteAccountScope.bind("account-b");
    store.bindAccount();
    await flush();
    acknowledgement.resolve(disclosure("account-a", true));
    expect(await accepting).toBe(false);
    expect(store.current?.version).toBe("account-b");
    expect(store.accepted).toBe(false);
    expect(remote.riskDisclosureApi.current).toHaveBeenCalledTimes(2);
  });

  it("keeps the new account loading when the old account request fails", async () => {
    const earlier = deferred<RiskDisclosureCurrent>();
    const later = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const store = useRiskDisclosure();
    const oldRefresh = store.refresh();
    remoteAccountScope.bind("account-b");
    store.bindAccount();
    earlier.reject(new Error("old account unavailable"));
    await oldRefresh;
    expect(store.loading).toBe(true);
    expect(store.error).toBeNull();
    expect(store.current).toBeNull();
    later.resolve(disclosure("account-b", false));
    await flush();
    expect(store.current?.version).toBe("account-b");
    expect(store.loading).toBe(false);
  });

  it("invalidates a pending load when bind or reset starts another same-account load", async () => {
    const earlier = deferred<RiskDisclosureCurrent>();
    const later = deferred<RiskDisclosureCurrent>();
    remote.riskDisclosureApi.current.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
    const store = useRiskDisclosure();

    store.bindAccount();
    store.reset();
    later.resolve(disclosure("v2", false));
    await flush();
    earlier.reject(new Error("superseded request failed"));
    await flush();

    expect(store.current?.version).toBe("v2");
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
});
