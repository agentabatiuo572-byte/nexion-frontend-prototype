/**
 * 五个同族幂等键注册表的**存储故障**契约(2026-08-19)。
 *
 * 同族口径见 lib/funds-mutation-key.ts 那一整段头注:命令发出**之前**的写失败要 fail closed
 * (抛域码、不交出键);命令**已发出之后**的写失败一律**不许抛**,如实回 false。
 *
 * 这五个比先修的三个更凶一档:它们的键是**随机**的(randomUUID)。一旦「写没落盘却把键交出去」,
 * 下一次重试铸的是**另一把键**,服务端认不出是同一次意图 → 直接执行**第二条命令**
 * (先修那三个的键是确定性的,同样情形只会过度去重,是欠执行)。所以 acquire 必须 fail closed。
 *
 * 而 finish 一侧的损害与先修那三个逐字相同 —— 抛出去就把一次**成功**的操作报成失败:
 *   devices.vue     设备已激活 → toast.success / return true 走不到,用户看到失败
 *   agent.vue       大使申请已受理 → 落进 catch,弹「远端失败」
 *   profile.ts      昵称已改成功 → return true 走不到,调用方当成拒绝
 *   wallet-exchange 撤单已成功 → cancelDone 弹不出,返回 unknown
 * 以及 catch 分支里的那几处(`if (!isAmbiguousOutcome(e)) finishX(...); throw e`)——
 * 退役写一抛,真实错因当场被 QuotaExceededError 顶掉。
 *
 * 桩:storageBroken = 写不进去(配额满,读照常);readBroken = 连读都抛(站点数据被禁)。
 */
import { beforeEach, describe, expect, it } from "vitest";

const memory = new Map<string, unknown>();
let storageBroken = false;
let readBroken = false;
function quota(): never {
  const err = new Error("QuotaExceededError");
  err.name = "QuotaExceededError";
  throw err;
}
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => {
    if (readBroken) {
      const err = new Error("SecurityError");
      err.name = "SecurityError";
      throw err;
    }
    return memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : "";
  },
  setStorageSync: (k: string, v: unknown) => {
    if (storageBroken) quota();
    memory.set(k, JSON.parse(JSON.stringify(v)));
  },
  removeStorageSync: (k: string) => {
    if (storageBroken) quota();
    memory.delete(k);
  },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { acquireAmbassadorCommandKey, finishAmbassadorCommand } = await import("./ambassador-command-key");
const { acquireProfileCommandKey, finishProfileCommand } = await import("./profile-command-key");
const { acquireDeviceCommandKey, finishDeviceCommand } = await import("./device-command-key");
const { acquireExchangeCancelCommand, finishExchangeCancelCommand, createExchangeCancelStorage } =
  await import("./exchange-cancel");
const { createExchangePendingMutationStore } = await import("./exchange-pending-mutation");

beforeEach(() => { memory.clear(); storageBroken = false; readBroken = false; });

describe("ambassador command key", () => {
  const KEY = "nexgrid-ambassador-pending-command-v1";
  it("baseline: 同一份申请复用一把键,受理后退役", () => {
    const first = acquireAmbassadorCommandKey("user-a", "payload-1");
    expect(acquireAmbassadorCommandKey("user-a", "payload-1")).toBe(first);
    expect(finishAmbassadorCommand("user-a", "payload-1")).toBe(true);
    expect(acquireAmbassadorCommandKey("user-a", "payload-1")).not.toBe(first);
  });
  it("提交前写不进去 → 抛域码、不交出键", () => {
    storageBroken = true;
    expect(() => acquireAmbassadorCommandKey("user-a", "payload-1"))
      .toThrow(/AMBASSADOR_COMMAND_KEY_UNPERSISTED/);
    expect(memory.has(KEY)).toBe(false);
  });
  it("🔴 已提交后退役失败 → 不抛,回 false(申请已受理,不许报成失败)", () => {
    acquireAmbassadorCommandKey("user-a", "payload-1");
    storageBroken = true;
    expect(() => finishAmbassadorCommand("user-a", "payload-1")).not.toThrow();
    expect(finishAmbassadorCommand("user-a", "payload-1")).toBe(false);
  });
});

describe("profile command key", () => {
  const KEY = "nexgrid-profile-pending-commands-v1";
  it("baseline: 同一次改名复用一把键,成功后退役", () => {
    const first = acquireProfileCommandKey("user-a", "old", "new");
    expect(acquireProfileCommandKey("user-a", "old", "new")).toBe(first);
    expect(finishProfileCommand("user-a", "old", "new")).toBe(true);
    expect(acquireProfileCommandKey("user-a", "old", "new")).not.toBe(first);
  });
  it("提交前写不进去 → 抛域码、不交出键", () => {
    storageBroken = true;
    expect(() => acquireProfileCommandKey("user-a", "old", "new"))
      .toThrow(/PROFILE_COMMAND_KEY_UNPERSISTED/);
    expect(memory.has(KEY)).toBe(false);
  });
  it("🔴 已提交后退役失败 → 不抛,回 false(昵称已改成功)", () => {
    acquireProfileCommandKey("user-a", "old", "new");
    storageBroken = true;
    expect(() => finishProfileCommand("user-a", "old", "new")).not.toThrow();
    expect(finishProfileCommand("user-a", "old", "new")).toBe(false);
  });
});

describe("device command key", () => {
  const KEY = "nexgrid-device-pending-commands-v1";
  it("baseline: 同一台设备同一版本复用一把键,确认后退役", () => {
    const first = acquireDeviceCommandKey("user-a", "activate", "dev-1", 3);
    expect(acquireDeviceCommandKey("user-a", "activate", "dev-1", 3)).toBe(first);
    expect(finishDeviceCommand("user-a", "activate", "dev-1", 3)).toBe(true);
    expect(acquireDeviceCommandKey("user-a", "activate", "dev-1", 3)).not.toBe(first);
  });
  it("下发前写不进去 → 抛域码、不交出键", () => {
    storageBroken = true;
    expect(() => acquireDeviceCommandKey("user-a", "activate", "dev-1", 3))
      .toThrow(/DEVICE_COMMAND_KEY_UNPERSISTED/);
    expect(memory.has(KEY)).toBe(false);
  });
  it("🔴 已下发后退役失败 → 不抛,回 false(设备已激活)", () => {
    acquireDeviceCommandKey("user-a", "activate", "dev-1", 3);
    storageBroken = true;
    expect(() => finishDeviceCommand("user-a", "activate", "dev-1", 3)).not.toThrow();
    expect(finishDeviceCommand("user-a", "activate", "dev-1", 3)).toBe(false);
  });
});

describe("exchange cancel command key", () => {
  const KEY = "nexgrid-exchange-cancel-commands-v1";
  it("baseline: 同一张单复用一把撤单键,撤成后退役", () => {
    const s = createExchangeCancelStorage();
    const first = acquireExchangeCancelCommand(s, "user-a", "EX-1");
    expect(acquireExchangeCancelCommand(s, "user-a", "EX-1")).toBe(first);
    expect(finishExchangeCancelCommand(s, "user-a", "EX-1", first)).toBe(true);
    expect(acquireExchangeCancelCommand(s, "user-a", "EX-1")).not.toBe(first);
  });
  it("撤单请求发出前写不进去 → 抛域码、不交出键", () => {
    const s = createExchangeCancelStorage();
    storageBroken = true;
    expect(() => acquireExchangeCancelCommand(s, "user-a", "EX-1"))
      .toThrow(/EXCHANGE_CANCEL_KEY_UNPERSISTED/);
    expect(memory.has(KEY)).toBe(false);
  });
  it("🔴 已发出后退役失败 → 不抛,回 false(单已撤成)", () => {
    const s = createExchangeCancelStorage();
    const key = acquireExchangeCancelCommand(s, "user-a", "EX-1");
    storageBroken = true;
    expect(() => finishExchangeCancelCommand(s, "user-a", "EX-1", key)).not.toThrow();
    expect(finishExchangeCancelCommand(s, "user-a", "EX-1", key)).toBe(false);
  });
  it("🔴 退役写失败不许顶掉真实错因(复刻页面 catch 形状)", () => {
    const s = createExchangeCancelStorage();
    const key = acquireExchangeCancelCommand(s, "user-a", "EX-1");
    storageBroken = true;
    const real = new Error("EXCHANGE_CANCEL_REJECTED");
    const surfaced = (() => {
      try {
        try { throw real; } catch (cause) {
          finishExchangeCancelCommand(s, "user-a", "EX-1", key);
          throw cause;
        }
      } catch (cause) { return cause; }
    })();
    expect(surfaced).toBe(real);
  });
});

describe("exchange pending swap lease", () => {
  const KEY = "nexgrid-exchange-pending-mutations-v1";
  const INTENT = { direction: "USDT_TO_NEX", fromAmount: 25, queueIfCapped: false } as const;
  it("baseline: 同一笔兑换意图复用一份租约,收口后释放", () => {
    const store = createExchangePendingMutationStore();
    const first = store.acquire("user-a", INTENT, []);
    expect(store.acquire("user-a", INTENT, []).key).toBe(first.key);
    expect(store.forget(first.fingerprint)).toBe(true);
    expect(store.acquire("user-a", INTENT, []).key).not.toBe(first.key);
  });
  it("兑换请求发出前写不进去 → 抛域码、不交出租约", () => {
    const store = createExchangePendingMutationStore();
    storageBroken = true;
    expect(() => store.acquire("user-a", INTENT, []))
      .toThrow(/EXCHANGE_PENDING_KEY_UNPERSISTED/);
    expect(memory.has(KEY)).toBe(false);
  });
  it("🔴 已发出后释放失败 → 不抛,回 false(兑换已成交)", () => {
    const store = createExchangePendingMutationStore();
    const lease = store.acquire("user-a", INTENT, []);
    storageBroken = true;
    expect(() => store.forget(lease.fingerprint)).not.toThrow();
    expect(store.forget(lease.fingerprint)).toBe(false);
  });
});

describe("站点数据被禁(连读都抛)时,已发出命令的退役一律不抛", () => {
  it("五个模块的 finish 全是全函数", () => {
    const s = createExchangeCancelStorage();
    const store = createExchangePendingMutationStore();
    const cancelKey = acquireExchangeCancelCommand(s, "user-a", "EX-1");
    const lease = store.acquire("user-a", { direction: "NEX_TO_USDT", fromAmount: 5, queueIfCapped: false }, []);
    acquireAmbassadorCommandKey("user-a", "payload-1");
    acquireProfileCommandKey("user-a", "old", "new");
    acquireDeviceCommandKey("user-a", "activate", "dev-1", 3);
    readBroken = true;
    expect(() => finishAmbassadorCommand("user-a", "payload-1")).not.toThrow();
    expect(() => finishProfileCommand("user-a", "old", "new")).not.toThrow();
    expect(() => finishDeviceCommand("user-a", "activate", "dev-1", 3)).not.toThrow();
    expect(() => finishExchangeCancelCommand(s, "user-a", "EX-1", cancelKey)).not.toThrow();
    expect(() => store.forget(lease.fingerprint)).not.toThrow();
  });
});
