import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/api/runtime", () => ({
  behaviorAnalyticsApi: {},
  remoteApiEnabled: true,
}));

const {
  createBehaviorTracker,
  getAcceptanceObservationCredential,
  isAcceptanceObservationModalOpen,
  onAcceptanceObservationModalOpened,
  onAcceptanceObservationModalClosed,
} = await import("./behavior-analytics");

const token = "c".repeat(64);

beforeEach(() => {
  (globalThis as { uni?: unknown }).uni = {
    setClipboardData: vi.fn(),
    showModal: vi.fn(() => new Promise(() => undefined)),
  };
});

test("retired sandbox receipts never expose a credential or interrupt the user", async () => {
  const closed = vi.fn();
  const opened = vi.fn();
  const unsubscribeOpened = onAcceptanceObservationModalOpened(opened);
  const unsubscribeClosed = onAcceptanceObservationModalClosed(closed);
  const tracker = createBehaviorTracker({
    transport: {
      ingest: async () => ({
        accepted: true,
        duplicate: false,
        eventId: "event-1",
        source: "mock" as const,
        sourceEnvironment: "SANDBOX" as const,
        runId: "h5.20260818",
        observationToken: token,
      }),
    },
    now: () => 1_700_000_000_000,
    sessionId: "s".repeat(32),
    deviceType: () => "H5",
    locale: () => "en-US",
    eventId: () => "e".repeat(32),
    credentialScope: "user:a",
    enabled: () => true,
  });

  tracker.tap({ route: "/pages/index/index", clientX: 1, clientY: 1, viewportWidth: 10, viewportHeight: 10 });
  await tracker.flush();

  expect(getAcceptanceObservationCredential()).toBe("");
  expect(uni.setClipboardData).not.toHaveBeenCalled();
  expect(uni.showModal).not.toHaveBeenCalled();
  expect(opened).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  expect(isAcceptanceObservationModalOpen()).toBe(false);
  unsubscribeOpened();
  unsubscribeClosed();
});
