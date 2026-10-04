/**
 * freeTrial.start / end / convert —— 落盘失败时的回滚基准(审计 R7 P0):
 * 快照必须取在任何字段改动之前;写失败后内存必须回到「什么都没发生」的那一行,再次尝试仍可开始。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/runtime", () => ({
  fundsServerEnabled: false, remoteApiEnabled: false, developmentFundsEnabled: false,
  trialApi: {}, orderApi: {}, accountApi: {}, walletApi: {}, voucherApi: {},
}));

const memory = new Map<string, unknown>();
let storageBroken = false;
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => (memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : ""),
  setStorageSync: (k: string, v: unknown) => {
    if (storageBroken) throw new Error("QuotaExceededError");
    memory.set(k, JSON.parse(JSON.stringify(v)));
  },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { useFreeTrial } = await import("./free-trial");

describe("useFreeTrial persistence contract (mock leg)", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; setActivePinia(createPinia()); });

  it("start(): a failed write leaves the trial exactly as it was (still startable), a later start succeeds", async () => {
    const trial = useFreeTrial();
    trial.bindAccount("acct-a");
    expect(trial.status).toBe("none");
    storageBroken = true;
    const first = await trial.start();
    expect(first.ok).toBe(false);
    expect(trial.status).toBe("none");         // not "active" with empty bounds, not "ended"
    expect(trial.startedAt).toBeNull();
    expect(trial.eligibility().ok).toBe(true); // the one-shot right is NOT burnt
    storageBroken = false;
    const second = await trial.start();
    expect(second.ok).toBe(true);
    expect(trial.status).toBe("active");
    setActivePinia(createPinia());
    const again = useFreeTrial();
    again.bindAccount("acct-a");
    expect(again.status).toBe("active");        // and it is on disk
  });

  it("convert(): a failed write is reported as not-ok and the trial stays active", async () => {
    const trial = useFreeTrial();
    trial.bindAccount("acct-a");
    expect((await trial.start()).ok).toBe(true);
    storageBroken = true;
    const res = await trial.convert("stellarbox-s1");
    expect(res.ok).toBe(false);
    expect(trial.status).toBe("active");
    storageBroken = false;
    expect((await trial.convert("stellarbox-s1")).ok).toBe(true);
    expect(trial.status).toBe("converted");
  });
});
