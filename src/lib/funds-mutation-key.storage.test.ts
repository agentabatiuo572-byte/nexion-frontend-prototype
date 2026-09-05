/**
 * 资金幂等键注册表的**存储故障**契约(2026-08-19,与 orders.persist.test / auth-otp.storage.test 同族)。
 *
 * 为什么这条链值得单独焊:本仓 mock 把账本 / 账号云 / 订单整套塞 localStorage,长期 dev/demo
 * profile 撑满 5MB 后,`uni.setStorageSync` 在 H5 上会原样抛出 QuotaExceededError(站点数据
 * 被浏览器禁掉时同样抛)。这张表是资金命令唯一的重放护栏,它写不进去要按**两套**语义处理:
 *
 *   ① 命令发出**之前**(getOrCreate)—— 抛,这一笔不许发(fail closed)。
 *      放行 = 一笔没有重放保护的资金命令:超时后再也认不回那个键,用户一重试就是第二笔钱。
 *   ② 命令发出**之后**(bindOrder / finish / finishByOrder)—— 绝不许抛。
 *      此刻服务端可能已经扣钱建单,抛出去会把一笔**成功**的提现 / 充值报成失败:
 *      app.ts submitWithdrawal 走不到 `return canonical`,deposits.ts 的 records.value
 *      拿不到那条记录 —— 用户被告知失败,钱却已经动了。
 *
 * 桩:uni storage 用内存表桩掉;storageBroken = 写不进去(配额满),readBroken = 连读都读不出来
 * (站点数据被禁)。测的是**模块级默认注册表**(真接 uni 的那个),不是注入的假 storage。
 */
import { beforeEach, describe, expect, it } from "vitest";

const memory = new Map<string, unknown>();
let storageBroken = false;
let readBroken = false;
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
    if (storageBroken) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    memory.set(k, JSON.parse(JSON.stringify(v)));
  },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const {
  pendingFundsMutationKey,
  bindPendingFundsMutationOrder,
  finishPendingFundsMutation,
  finishPendingFundsMutationByOrder,
} = await import("./funds-mutation-key");

const STORAGE_KEY = "nexgrid-funds-pending-mutations-v1";
const WITHDRAWAL = {
  accountKey: "user-a",
  environment: "SANDBOX",
  method: "WITHDRAWAL:CREGIS_USDT_BEP20",
  fingerprint: '{"amount":"4.000000","address":"0xabc"}',
} as const;

describe("funds mutation key storage-failure contract", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; readBroken = false; });

  it("baseline: one key survives a reload and only a terminal result retires it", () => {
    const first = pendingFundsMutationKey(WITHDRAWAL);
    expect(pendingFundsMutationKey(WITHDRAWAL)).toBe(first);
    expect(bindPendingFundsMutationOrder(WITHDRAWAL, first, "FSW-1")).toBe(true);
    expect(finishPendingFundsMutationByOrder("user-a", "SANDBOX", "FSW-1")).toBe(true);
    expect(pendingFundsMutationKey(WITHDRAWAL)).not.toBe(first);
  });

  it("命令发出前写不进去 → 抛域码、不交出任何键(fail closed)", () => {
    storageBroken = true;
    // 回归点:修复前这里抛的是裸 QuotaExceededError —— 调用方只能把它当成一次普通网络失败,
    // 分不清「存储满了,腾空间再试」与「后端不可达」。域码让失败可分诊。
    expect(() => pendingFundsMutationKey(WITHDRAWAL)).toThrow(/FUNDS_MUTATION_KEY_UNPERSISTED/);
    // 关键不是它抛了,而是**没有任何键被交出去**,盘上也没有半张记录。
    expect(memory.has(STORAGE_KEY)).toBe(false);
  });

  it("存储恢复后照常发键,且与故障期间无关", () => {
    storageBroken = true;
    expect(() => pendingFundsMutationKey(WITHDRAWAL)).toThrow();
    storageBroken = false;
    const key = pendingFundsMutationKey(WITHDRAWAL);
    expect(key).toMatch(/^funds-/);
    expect(pendingFundsMutationKey(WITHDRAWAL)).toBe(key);
  });

  it("🔴 命令已发出后写不进去 → 绝不抛,只如实回 false(否则成功的提现被报成失败)", () => {
    const key = pendingFundsMutationKey(WITHDRAWAL);
    // 服务端已经建单扣钱,此刻配额被别的表写满。
    storageBroken = true;
    // 回归点:修复前这三处都会把 QuotaExceededError 抛给 app.ts / deposits.ts,
    // 于是 `return canonical` / `records.value = [...]` 全部走不到 —— 钱动了,用户看到失败。
    expect(() => bindPendingFundsMutationOrder(WITHDRAWAL, key, "FSW-1")).not.toThrow();
    expect(bindPendingFundsMutationOrder(WITHDRAWAL, key, "FSW-1")).toBe(false);
    expect(finishPendingFundsMutation(WITHDRAWAL, key)).toBe(false);
    expect(finishPendingFundsMutationByOrder("user-a", "SANDBOX", "FSW-1")).toBe(false);
  });

  it("🔴 退役写不进去 → 回 false 且**真的没退役**(键留着,下一笔同意图仍复用它)", () => {
    const key = pendingFundsMutationKey(WITHDRAWAL);
    expect(bindPendingFundsMutationOrder(WITHDRAWAL, key, "FSW-1")).toBe(true);
    storageBroken = true;
    expect(finishPendingFundsMutationByOrder("user-a", "SANDBOX", "FSW-1")).toBe(false);
    storageBroken = false;
    // false 必须是诚实的:没退役 = generation 没推进 = 同一把键还在,重放保护还在。
    // (若这里返回了新键,说明退役被当成成功,服务端那笔在途单就再也认不回来了。)
    expect(pendingFundsMutationKey(WITHDRAWAL)).toBe(key);
  });

  it("🔴 站点数据被禁(连读都抛)时,命令已发出的那几个方法仍然是全函数", () => {
    const key = pendingFundsMutationKey(WITHDRAWAL);
    readBroken = true;
    // 读不出来 ≠ 键不匹配:不许因此抛 FUNDS_MUTATION_KEY_MISMATCH 把成功的资金操作打成失败。
    expect(bindPendingFundsMutationOrder(WITHDRAWAL, key, "FSW-1")).toBe(false);
    expect(finishPendingFundsMutation(WITHDRAWAL, key)).toBe(false);
    expect(finishPendingFundsMutationByOrder("user-a", "SANDBOX", "FSW-1")).toBe(false);
  });

  it("键真接错了仍然抛 —— 那是调用方的错,不是存储故障(别被降级吞掉)", () => {
    const key = pendingFundsMutationKey(WITHDRAWAL);
    expect(() => bindPendingFundsMutationOrder(WITHDRAWAL, `${key}-wrong`, "FSW-1"))
      .toThrow(/FUNDS_MUTATION_KEY_MISMATCH/);
  });
});
