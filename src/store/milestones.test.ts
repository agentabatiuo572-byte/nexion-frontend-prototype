import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const storage = vi.hoisted(() => ({ rows: new Map<string, unknown>(), writable: true }));
vi.mock("./account-cloud", () => ({ normalizeAccountKey: (key: string) => key.trim().toLowerCase() }));
vi.mock("./account-scoped-storage", () => ({
  readAccountRow: (table: string, key: string) => storage.rows.get(`${table}:${key}`) ?? null,
  writeAccountRow: (table: string, key: string, row: unknown) => {
    if (!storage.writable) return false;
    storage.rows.set(`${table}:${key}`, JSON.parse(JSON.stringify(row)));
    return true;
  },
}));
import { useMilestones } from "./milestones";

beforeEach(() => {
  storage.rows.clear();
  storage.writable = true;
  setActivePinia(createPinia());
});

describe("earnings milestone crossings", () => {
  it("silently baselines historical earnings without marking or rewarding old tiers", () => {
    const m = useMilestones();
    m.bindAccount("a");
    expect(m.nextEligible(28_452.18)).toBeNull();
    expect(m.nextEligible(28_453)).toBeNull();
    expect(m.firedIds).toEqual([]);
    expect(m.pendingCelebrations).toEqual([]);
    setActivePinia(createPinia());
    const reloaded = useMilestones();
    reloaded.bindAccount("a");
    expect(reloaded.nextEligible(28_453)).toBeNull();
  });

  it("retains a real crossing across reload, retries until marked, and never repeats", () => {
    const m = useMilestones();
    m.bindAccount("a");
    m.initialize(99);
    expect(m.nextEligible(99.99)).toBeNull();
    setActivePinia(createPinia());
    const reloaded = useMilestones();
    reloaded.bindAccount("a");
    expect(reloaded.nextEligible(100)?.id).toBe("earn-100");
    expect(reloaded.nextEligible(100)?.id).toBe("earn-100");
    reloaded.markFired("earn-100");
    expect(reloaded.nextEligible(100)).toBeNull();
    reloaded.bindAccount("a");
    expect(reloaded.nextEligible(100)).toBeNull();
    expect(reloaded.nextEligible(1_000)?.id).toBe("earn-500");
    reloaded.markFired("earn-500");
    expect(reloaded.nextEligible(1_000)?.id).toBe("earn-1000");
  });

  it("migrates old records and keeps account baselines separate", () => {
    storage.rows.set("nexgrid-milestones-accounts-v1:a", { firedIds: ["earn-100"] });
    const m = useMilestones();
    m.bindAccount("a");
    expect(m.nextEligible(600)).toBeNull();
    expect(m.firedIds).toEqual(["earn-100"]);
    m.bindAccount("b");
    m.initialize(0);
    expect(m.nextEligible(100)?.id).toBe("earn-100");
    m.bindAccount("a");
    expect(m.nextEligible(600)).toBeNull();
    expect(m.nextEligible(1_000)?.id).toBe("earn-1000");
  });

  it("rejects invalid earnings and does not proceed with an unpersisted baseline", () => {
    const m = useMilestones();
    for (const invalid of [NaN, Infinity, -1]) expect(m.nextEligible(invalid)).toBeNull();
    storage.writable = false;
    expect(m.nextEligible(99)).toBeNull();
    expect(m.nextEligible(100)).toBeNull();
    storage.writable = true;
    m.initialize(99);
    expect(m.nextEligible(Infinity)).toBeNull();
    expect(m.nextEligible(100)?.id).toBe("earn-100");
    storage.writable = false;
    expect(m.markFired("earn-100")).toBe(false);
    expect(m.firedIds).toEqual([]);
    storage.writable = true;
    expect(m.markFired("earn-100")).toBe(true);
    expect(m.nextEligible(100)).toBeNull();
  });
});
