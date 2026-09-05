/**
 * VietQR 建单 / 撤单幂等键的**存储故障**契约(2026-08-19,同族见 funds-mutation-key.storage.test)。
 *
 * 分档同钱面:命令发出**之前**(getOrCreate)写不进去就抛、不许发;发出**之后**
 * (bindIntent / finish / finishByIntent)一律不许抛。
 *
 * 本文件多一条钱面独有的回归点:deposits.ts 的 createRemoteBankIntent / cancelRemoteBankIntent
 * 都是 `catch (cause) { if (!isAmbiguousOutcome(cause)) finishVietQrCommand(...); throw cause; }`
 * —— 退役写一抛,原始 cause 就被 QuotaExceededError 顶掉,页面拿到的错因与真相无关,
 * 「结果未知就保留键」这条判断也随之失效(键被当作已退役之外的另一种方式丢失)。
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

const { vietQrCommandKey, bindVietQrIntent, finishVietQrCommand, finishVietQrCommandByIntent } =
  await import("./vietqr-command-key");

const STORAGE_KEY = "nexgrid-vietqr-command-keys-v1";
const CREATE = { accountKey: "user-1", action: "CREATE", fingerprint: "25.000000" } as const;

describe("vietqr command key storage-failure contract", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; readBroken = false; });

  it("baseline: 一把键跨重载复用,只有权威结局才换新键", () => {
    const first = vietQrCommandKey(CREATE);
    expect(vietQrCommandKey(CREATE)).toBe(first);
    expect(bindVietQrIntent(CREATE, first, "VQR-1")).toBe(true);
    expect(finishVietQrCommandByIntent("user-1", "VQR-1")).toBe(true);
    expect(vietQrCommandKey(CREATE)).not.toBe(first);
  });

  it("建单请求发出前写不进去 → 抛域码、不交出任何键(fail closed)", () => {
    storageBroken = true;
    expect(() => vietQrCommandKey(CREATE)).toThrow(/VIETQR_COMMAND_KEY_UNPERSISTED/);
    expect(memory.has(STORAGE_KEY)).toBe(false);
  });

  it("🔴 请求已发出后写不进去 → 绝不抛,只回 false", () => {
    const key = vietQrCommandKey(CREATE);
    storageBroken = true;
    // 回归点:修复前 bindVietQrIntent 一抛,createRemoteBankIntent 里
    // `intents.value = [intent, ...]` 就走不到 —— 单已在服务端建好,用户却看不到那张付款单。
    expect(() => bindVietQrIntent(CREATE, key, "VQR-1")).not.toThrow();
    expect(bindVietQrIntent(CREATE, key, "VQR-1")).toBe(false);
    expect(finishVietQrCommand(CREATE, key)).toBe(false);
  });

  it("🔴 catch 里的退役写失败不许顶掉真实错因", () => {
    const key = vietQrCommandKey(CREATE);
    storageBroken = true;
    // 复刻 deposits.ts 的 catch 形状:退役一抛,throw cause 就再也执行不到。
    const real = new Error("VIETQR_CREATE_REJECTED");
    const surfaced = (() => {
      try {
        try {
          throw real;
        } catch (cause) {
          finishVietQrCommand(CREATE, key);
          throw cause;
        }
      } catch (cause) {
        return cause;
      }
    })();
    expect(surfaced).toBe(real);
  });

  it("🔴 退役写不进去 → 回 false 且真的没退役(键留着,重放保护还在)", () => {
    const key = vietQrCommandKey(CREATE);
    expect(bindVietQrIntent(CREATE, key, "VQR-1")).toBe(true);
    storageBroken = true;
    expect(finishVietQrCommandByIntent("user-1", "VQR-1")).toBe(false);
    storageBroken = false;
    expect(vietQrCommandKey(CREATE)).toBe(key);
  });

  it("🔴 站点数据被禁(连读都抛)时,已发出命令的那几个方法仍然是全函数", () => {
    const key = vietQrCommandKey(CREATE);
    readBroken = true;
    expect(bindVietQrIntent(CREATE, key, "VQR-1")).toBe(false);
    expect(finishVietQrCommand(CREATE, key)).toBe(false);
    expect(finishVietQrCommandByIntent("user-1", "VQR-1")).toBe(false);
  });

  it("键真接错了仍然抛 —— 调用方的错不该被降级吞掉", () => {
    const key = vietQrCommandKey(CREATE);
    expect(() => bindVietQrIntent(CREATE, `${key}-wrong`, "VQR-1")).toThrow(/VIETQR_COMMAND_KEY_MISMATCH/);
  });
});
