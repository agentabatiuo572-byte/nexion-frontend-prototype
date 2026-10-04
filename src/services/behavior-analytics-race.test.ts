import { beforeEach, expect, test, vi } from "vitest";
import type { SessionVault } from "@/api/session-vault";

vi.mock("@/api/runtime", () => ({
  behaviorAnalyticsApi: {},
  remoteApiEnabled: true,
}));

const { createBehaviorTracker, createBehaviorAnalyticsManager, createBehaviorSessionGuard, getAcceptanceObservationCredential } = await import("./behavior-analytics");

const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const storeView = {
  clientEventId: "e".repeat(32), eventName: "store.viewed" as const, sessionId: "s".repeat(32),
  route: "/pages/store/store", clientTs: 1_700_000_000_000, deviceType: "H5" as const, locale: "zh-CN",
};

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

test("retired credentials stay unavailable across late receipts and account rotation", async () => {
  let resolveA: ((value: ReturnType<typeof receipt>) => void) | undefined;
  const a = tracker("account-A", () => new Promise((resolve) => { resolveA = resolve; }));
  a.tap({ route: "/pages/index/index", clientX: 1, clientY: 1, viewportWidth: 10, viewportHeight: 10 });
  await Promise.resolve();

  // A logout/rotation cancels A's queue before B begins a fresh authenticated scope.
  a.discard();
  const b = tracker("account-B", async () => receipt("h5.20260812", tokenB));
  b.tap({ route: "/pages/index/index", clientX: 1, clientY: 1, viewportWidth: 10, viewportHeight: 10 });
  await b.flush();
  expect(getAcceptanceObservationCredential()).toBe("");

  resolveA?.(receipt("h5.20260812", tokenA));
  await a.flush();
  expect(getAcceptanceObservationCredential()).toBe("");
  expect(uni.setClipboardData).not.toHaveBeenCalled();
  expect(uni.showModal).not.toHaveBeenCalled();
});

test("store visit sends one strict conversion event without a client actor", async () => {
  const events: unknown[] = [];
  const observer = createBehaviorTracker({
    transport: { ingest: async (event) => {
      events.push(event);
      return { accepted: true, duplicate: false, eventId: "store-event" };
    } },
    now: () => 1_700_000_000_000,
    sessionId: "s".repeat(32),
    deviceType: () => "H5",
    locale: () => "zh-CN",
    eventId: () => "e".repeat(32),
    enabled: () => true,
  });

  expect(await observer.viewStore(storeView)).toBe(true);
  expect(events).toEqual([storeView]);
});

test("store conversion is scoped to an authenticated account", async () => {
  let subject: string | null = null;
  const events: unknown[] = [];
  const manager = createBehaviorAnalyticsManager({
    context: () => ({ enabled: true, subject }),
    now: () => 1_700_000_000_000,
    createTracker: () => createBehaviorTracker({
      transport: { ingest: async (event) => {
        events.push(event);
        return { accepted: true, duplicate: false, eventId: "store-event" };
      } },
      now: () => 1_700_000_000_000,
      sessionId: "a".repeat(32),
      deviceType: () => "H5",
      locale: () => "zh-CN",
      eventId: () => "e".repeat(32),
    }),
  });
  expect(await manager.viewStore(storeView)).toBe(false);
  subject = "user-42";
  expect(await manager.viewStore(storeView)).toBe(true);
  expect(events).toHaveLength(1);
});

test("an in-flight store visit cannot become a later account's success", async () => {
  let subject = "user:42";
  let userId = 42;
  let revision = 1;
  let releaseFirst: (() => void) | undefined;
  const sent: unknown[] = [];
  const vault = {
    read: () => ({ user: { userId } }),
    revision: () => revision,
    isRefreshContinuation: () => false,
  };
  const scopeCurrent = createBehaviorSessionGuard(
    vault as unknown as Pick<SessionVault, "read" | "revision" | "isRefreshContinuation">,
    subject, () => ({ enabled: true, subject }),
  );
  expect(createBehaviorSessionGuard(
    vault as unknown as Pick<SessionVault, "read" | "revision" | "isRefreshContinuation">,
    "user:99", () => ({ enabled: true, subject: "user:99" }),
  )()).toBe(false);
  const observer = createBehaviorTracker({
    transport: { ingest: (event) => {
      sent.push(event);
      if (sent.length === 1) return new Promise((resolve) => {
        releaseFirst = () => resolve({ accepted: true, duplicate: false, eventId: "first" });
      });
      return Promise.resolve({ accepted: true, duplicate: false, eventId: "second" });
    } },
    now: () => 1_700_000_000_000,
    sessionId: "a".repeat(32), deviceType: () => "H5", locale: () => "zh-CN",
    eventId: () => "e".repeat(32), enabled: scopeCurrent,
  });
  const first = observer.viewStore(storeView);
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  subject = "user:99";
  userId = 99;
  revision = 2;
  expect(await observer.viewStore(storeView)).toBe(false);
  releaseFirst?.();
  expect(await first).toBe(false);
  expect(sent).toHaveLength(1);
});

test("ambiguous store failure retries the identical event and accepts a duplicate receipt", async () => {
  const sent: unknown[] = [];
  const observer = createBehaviorTracker({
    transport: { ingest: async (event) => {
      sent.push(event);
      if (sent.length === 1) throw new Error("connection reset after write");
      return { accepted: false, duplicate: true };
    } },
    now: () => 1_700_000_000_000, sessionId: "s".repeat(32),
    deviceType: () => "H5", locale: () => "zh-CN", eventId: () => "e".repeat(32),
  });
  expect(await observer.viewStore(storeView)).toBe(false);
  expect(await observer.viewStore(storeView)).toBe(true);
  expect(sent).toEqual([storeView, storeView]);
});
