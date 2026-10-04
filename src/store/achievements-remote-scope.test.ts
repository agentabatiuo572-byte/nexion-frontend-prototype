import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true }));
const storage = vi.hoisted(() => ({
  readAccountRow: vi.fn(() => ({
    records: [{ id: "local-only", unlockedAt: 1, claimed: false }],
  })),
  writeAccountRow: vi.fn(),
}));

vi.mock("@/api/runtime", () => remote);
vi.mock("./account-scoped-storage", () => storage);

const { useAchievements } = await import("./achievements");

beforeEach(() => {
  setActivePinia(createPinia());
  storage.readAccountRow.mockClear();
  storage.writeAccountRow.mockClear();
});

describe("achievements remote authority", () => {
  it("does not hydrate or bind local achievement rows in remote mode", () => {
    const store = useAchievements();

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.records).toEqual([]);

    store.bindAccount("remote-account");

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.records).toEqual([]);
  });

  it("does not persist local unlock or claim mutations in remote mode", () => {
    const store = useAchievements();

    expect(store.unlock("local-only")).toBe(false);
    expect(store.claim("local-only")).toBe(false);
    expect(storage.writeAccountRow).not.toHaveBeenCalled();
  });
});
