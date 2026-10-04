import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, genesisApi: api }));
import { useGenesisConfig } from "./genesis-config";

beforeEach(() => { setActivePinia(createPinia()); api.state.mockReset(); });
function state(open: boolean) {
  return { halted: !open, revision: open ? "older-open" : "current-closed", source: "server",
    tiers: [], marketOpenState: open ? "open" : "closed", closedNoticeKey: "default",
    sale: { startAt: null, showCountdown: false }, showcaseEnabled: open };
}
test.each(["resolve", "reject"])("late config %s cannot replace newer closed state", async (completion) => {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void;
  api.state.mockImplementationOnce(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }))
    .mockResolvedValueOnce(state(false));
  const config = useGenesisConfig();
  const old = config.refresh();
  await config.refresh();
  if (completion === "resolve") resolve(state(true));
  else reject(new Error("OLD_OFFLINE"));
  await old;
  expect(config.loaded).toBe(true);
  expect(config.config.marketOpenState).toBe("closed");
  expect(config.config.killSwitchRevision).toBe("current-closed");
});
