/**
 * voucher.markUsed / release —— 单次券「先占后花」的 CAS 契约(审计 R5 P0):
 * 同一张券被两个 store 实例(= 两个标签页 / 页面实例)各核销一次,只有第一次拿到 true;
 * 结算在核销之后失败 → release 放回,再次核销可成功。远端档由服务端事务核销,本测试钉 mock 档。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/runtime", () => ({
  fundsServerEnabled: false, remoteApiEnabled: false, developmentFundsEnabled: false,
  voucherApi: {}, orderApi: {}, accountApi: {}, walletApi: {},
}));

const memory = new Map<string, unknown>();
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => (memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : ""),
  setStorageSync: (k: string, v: unknown) => { memory.set(k, JSON.parse(JSON.stringify(v))); },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { useVoucher } = await import("./voucher");
const ID = "vc-newuser-50";

describe("useVoucher redemption is a CAS claim (mock leg)", () => {
  beforeEach(() => { memory.clear(); setActivePinia(createPinia()); });

  it("second instance's markUsed on an already-redeemed voucher returns false; release re-opens it", () => {
    const a = useVoucher();
    a.bindAccount("acct-a");
    expect(a.claim(ID).ok).toBe(true);
    // a second store instance = another tab that hydrated the same ledger
    setActivePinia(createPinia());
    const b = useVoucher();
    b.bindAccount("acct-a");
    expect(a.markUsed(ID)).toBe(true);
    expect(b.markUsed(ID)).toBe(false); // CAS on the disk-latest row: already used elsewhere
    expect(b.isUsed(ID)).toBe(true);    // and b's memory got synced to the truth
    expect(a.release(ID)).toBe(true);
    expect(b.markUsed(ID)).toBe(true);  // released → redeemable again, exactly once
    expect(a.markUsed(ID)).toBe(false);
  });

  it("markUsed on an unclaimed voucher is false (nothing to redeem)", () => {
    const a = useVoucher();
    a.bindAccount("acct-a");
    expect(a.markUsed(ID)).toBe(false);
    expect(a.release(ID)).toBe(false);
  });
});
