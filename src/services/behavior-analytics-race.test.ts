import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/api/runtime", () => ({
  behaviorAnalyticsApi: {},
  remoteApiEnabled: true,
}));

const { createBehaviorTracker, getAcceptanceObservationCredential } = await import("./behavior-analytics");

const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);

function receipt(runId: string, observationToken: string) {
  return {
    accepted: true,
    duplicate: false,
    eventId: "event-1",
    source: "mock" as const,
    sourceEnvironment: "SANDBOX" as const,
    runId,
    observationToken,
  };
}

function tracker(scope: string, ingest: () => Promise<ReturnType<typeof receipt>>) {
  return createBehaviorTracker({
    transport: { ingest },
    now: () => 1_700_000_000_000,
    sessionId: "s".repeat(32),
    deviceType: () => "H5",
    locale: () => "zh-CN",
    eventId: () => "e".repeat(32),
    credentialScope: scope,
    enabled: () => true,
  });
}

beforeEach(() => {
  // Native UI is irrelevant to the isolation decision; stub it so receipt
  // projection is observable through the exported getter.
  (globalThis as { uni?: unknown }).uni = {
    setClipboardData: vi.fn(),
    showModal: vi.fn(),
  };
});

test("an A receipt resolving after logout and B login cannot overwrite B's credential", async () => {
  let resolveA: ((value: ReturnType<typeof receipt>) => void) | undefined;
  const a = tracker("account-A", () => new Promise((resolve) => { resolveA = resolve; }));
  a.tap({ route: "/pages/index/index", clientX: 1, clientY: 1, viewportWidth: 10, viewportHeight: 10 });
  await Promise.resolve();

  // A logout/rotation cancels A's queue before B begins a fresh authenticated scope.
  a.discard();
  const b = tracker("account-B", async () => receipt("h5.20260812", tokenB));
  b.tap({ route: "/pages/index/index", clientX: 1, clientY: 1, viewportWidth: 10, viewportHeight: 10 });
  await b.flush();
  expect(getAcceptanceObservationCredential()).toBe(`h5.20260812.${tokenB}`);

  resolveA?.(receipt("h5.20260812", tokenA));
  await a.flush();
  expect(getAcceptanceObservationCredential()).toBe(`h5.20260812.${tokenB}`);
});
