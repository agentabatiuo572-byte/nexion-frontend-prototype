import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireWeeklyQuestCommandKey,
  finishWeeklyQuestCommand,
  peekWeeklyQuestCommandKey,
} from "./weekly-quest-command-key";

describe("weekly quest pending command keys", () => {
  let storage: Map<string, unknown>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reuses one key for the same account and mission instance after a restart", () => {
    const key = acquireWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35");

    expect(peekWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35")).toBe(key);
    expect(acquireWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35")).toBe(key);
  });

  it("keeps different weeks and accounts in independent command slots", () => {
    const week35 = acquireWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35");
    const week36 = acquireWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W36");
    const anotherAccount = acquireWeeklyQuestCommandKey("user:b", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35");

    expect(week36).not.toBe(week35);
    expect(anotherAccount).not.toBe(week35);
    finishWeeklyQuestCommand("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W36");
    expect(peekWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35")).toBe(week35);
  });

  it("fails closed when the replay key cannot be stored durably", () => {
    vi.stubGlobal("uni", {
      getStorageSync: () => undefined,
      setStorageSync: () => { throw new Error("storage unavailable"); },
      removeStorageSync: () => undefined,
    });

    expect(() => acquireWeeklyQuestCommandKey("user:a", "H3_DEVICE_ACTIVATED", "WEEK:2026-W35"))
      .toThrow("WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE");
  });
});
