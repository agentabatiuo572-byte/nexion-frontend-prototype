/**
 * 待支付会话 store —— 本地支付腿(mock)主路径的机器覆盖。
 * vitest 全局把 API 模式钉成 remote(fundsServerEnabled=true → 本 store 拒建不读),
 * 这里显式 mock 成 mock 档,否则任何断言都会落在「恒空」分支上假绿。
 * uni storage 用内存表桩掉(同源多标签页共享 localStorage 的语义由 CAS 提交器承担,见 store 文件头)。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/runtime", () => ({ fundsServerEnabled: false, remoteApiEnabled: false, developmentFundsEnabled: false }));

const memory = new Map<string, unknown>();
let storageBroken = false;
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => (memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : ""),
  setStorageSync: (k: string, v: unknown) => { if (storageBroken) throw new Error("QuotaExceededError"); memory.set(k, JSON.parse(JSON.stringify(v))); },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { usePendingCheckout } = await import("./pending-checkout");
const { PENDING_CHECKOUT_WINDOW_MIN } = await import("./pending-checkout-core");

const TABLE = "nexgrid-pending-checkout-accounts-v1";
const QUOTE = { total: 649, voucher: { id: null, discount: 0 }, trial: { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0 }, tradeIn: null };
const INPUT = { productId: "stellarbox-s1", method: "usdt-trc20" as const, amountUsdt: 649, quote: QUOTE };

function diskSessions(account: string) {
  const table = memory.get(TABLE) as Record<string, { sessions: { id: string; leftNoticeShown: boolean }[] }> | undefined;
  return table?.[account]?.sessions ?? [];
}

describe("usePendingCheckout (mock leg)", () => {
  beforeEach(() => {
    memory.clear();
    storageBroken = false;
    setActivePinia(createPinia());
  });

  it("holds at most ONE live invoice per account: a second begin() without replaceId is refused", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const first = store.begin(INPUT);
    expect(first).not.toBeNull();
    const second = store.begin(INPUT);
    expect(second).toBeNull();
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]?.id).toBe(first!.id);
    expect(diskSessions("acct-a")).toHaveLength(1);
  });

  it("begin(replaceId) swaps the old invoice for the new one in one commit", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const first = store.begin(INPUT)!;
    const next = store.begin({ ...INPUT, method: "usdt-bep20", replaceId: first.id });
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(first.id);
    expect(next!.address).not.toBe(first.address);
    expect(store.sessions.map((s) => s.id)).toEqual([next!.id]);
    expect(diskSessions("acct-a").map((s) => s.id)).toEqual([next!.id]);
  });

  it("refuses invalid input: non-chain method, bad amount, bad quote total", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    expect(store.begin({ ...INPUT, method: "card" as never })).toBeNull();
    expect(store.begin({ ...INPUT, amountUsdt: Number.NaN })).toBeNull();
    expect(store.begin({ ...INPUT, quote: { ...QUOTE, total: -1 } })).toBeNull();
    expect(store.sessions).toHaveLength(0);
  });

  it("stamps a 30-minute deadline and a per-invoice address in the method's network shape", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    expect(s.expiresAt - s.createdAt).toBe(PENDING_CHECKOUT_WINDOW_MIN * 60_000);
    expect(s.address).toMatch(/^T[0-9A-F]{33}$/);
    const evm = store.begin({ ...INPUT, method: "usdt-erc20", replaceId: s.id })!;
    expect(evm.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("remove() settles the invoice and releases the viewing slot; barSession follows viewingId", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    expect(store.barSession?.id).toBe(s.id);
    store.setViewing(s.id);
    expect(store.barSession).toBeNull();
    store.remove(s.id);
    expect(store.viewingId).toBeNull();
    expect(store.sessions).toHaveLength(0);
    expect(store.current).toBeNull();
    expect(diskSessions("acct-a")).toHaveLength(0);
  });

  it("markLeftNotice() is one-shot and persisted", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    expect(store.markLeftNotice(s.id)).toBe(true);
    expect(store.markLeftNotice(s.id)).toBe(false);
    expect(diskSessions("acct-a")[0]?.leftNoticeShown).toBe(true);
    expect(store.markLeftNotice("pc-nope")).toBe(false);
  });

  it("isolates invoices per account and rehydrates them on rebind", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const a = store.begin(INPUT)!;
    store.bindAccount("acct-b");
    expect(store.sessions).toHaveLength(0);
    expect(store.begin({ ...INPUT, productId: "stellarbox-pro", amountUsdt: 1199, quote: { ...QUOTE, total: 1199 } })).not.toBeNull();
    store.bindAccount("acct-a");
    expect(store.sessions.map((s) => s.id)).toEqual([a.id]);
    expect(store.current?.address).toBe(a.address);
  });

  it("drops expired rows on hydrate and never resurrects them", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    // simulate the clock passing the deadline on disk (another tab / long sleep)
    const table = memory.get(TABLE) as Record<string, { sessions: typeof s[]; rev?: number }>;
    table["acct-a"].sessions[0].expiresAt = Date.now() - 1;
    memory.set(TABLE, table);
    store.bindAccount("acct-a");
    expect(store.sessions).toHaveLength(0);
    expect(store.current).toBeNull();
    // and a fresh begin() is not blocked by the dead one
    expect(store.begin(INPUT)).not.toBeNull();
    expect(store.sessions).toHaveLength(1);
  });

  it("consume() settles an invoice exactly once: the second claimant (stale instance / other tab) gets false", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    expect(store.consume(s.id)).toBe("consumed");
    expect(store.consume(s.id)).toBe("absent"); // already settled — must not pay twice
    expect(store.sessions).toHaveLength(0);
    expect(diskSessions("acct-a")).toHaveLength(0);
  });

  it("consume() refuses a cancelled invoice and an expired one", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const cancelled = store.begin(INPUT)!;
    store.remove(cancelled.id);
    expect(store.consume(cancelled.id)).toBe("absent");
    const dying = store.begin(INPUT)!;
    const table = memory.get(TABLE) as Record<string, { sessions: typeof dying[] }>;
    table["acct-a"].sessions[0].expiresAt = Date.now() - 1;
    memory.set(TABLE, table);
    expect(store.consume(dying.id)).toBe("absent");
  });

  it("consume() is disk-authoritative: a second store instance (other tab) cannot settle a ticket the first one already consumed", () => {
    const tabA = usePendingCheckout();
    tabA.bindAccount("acct-a");
    const s = tabA.begin(INPUT)!;
    setActivePinia(createPinia());
    const tabB = usePendingCheckout();
    tabB.bindAccount("acct-a");
    expect(tabB.current?.id).toBe(s.id); // tab B sees it on disk
    expect(tabB.consume(s.id)).toBe("consumed"); // tab B settles first
    expect(tabA.consume(s.id)).toBe("absent"); // tab A's stale memory copy must lose
    expect(tabA.sessions).toHaveLength(0); // and its memory is now refreshed from disk
  });

  it("refreshFromDisk() pulls another tab's writes without writing", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const other = { ...INPUT, id: "pc-other", kind: "purchase", orderNo: null, address: "TOTHER", createdAt: Date.now(), expiresAt: Date.now() + 60_000, leftNoticeShown: false };
    memory.set(TABLE, { "acct-a": { sessions: [other], rev: 3 } });
    store.refreshFromDisk();
    expect(store.current?.id).toBe("pc-other");
    expect((memory.get(TABLE) as Record<string, { rev: number }>)["acct-a"].rev).toBe(3); // no write
  });

  it("bindAccount heals a corrupted multi-live row down to one invoice", () => {
    const now = Date.now();
    const mk = (id: string) => ({ ...INPUT, id, kind: "purchase", orderNo: null, address: "T" + id, createdAt: now, expiresAt: now + 60_000, leftNoticeShown: false });
    memory.set(TABLE, { "acct-a": { sessions: [mk("pc-1"), mk("pc-2")], rev: 1 } });
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    expect(store.sessions.map((s) => s.id)).toEqual(["pc-1"]);
    expect(diskSessions("acct-a").map((s) => s.id)).toEqual(["pc-1"]);
    expect(store.begin({ ...INPUT, replaceId: "pc-1" })).not.toBeNull(); // no longer locked out
  });
  it("sees an invoice another tab opened (disk-latest base) and refuses to double it", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    // another tab wrote an invoice straight to disk after we bound
    const other = { ...INPUT, id: "pc-other", kind: "purchase", orderNo: null, address: "TOTHER", createdAt: Date.now(), expiresAt: Date.now() + 60_000, leftNoticeShown: false };
    memory.set(TABLE, { "acct-a": { sessions: [other], rev: 1 } });
    expect(store.begin(INPUT)).toBeNull();
    // memory now mirrors disk → the bar can surface the other tab's invoice
    expect(store.sessions.map((s) => s.id)).toEqual(["pc-other"]);
  });

  it("refreshFromDisk() heals the read side: expired rows pruned, extra live rows collapsed to the earliest one (memory AND disk)", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const live = store.begin(INPUT)!;
    // another (older) client appended a second live row + an expired one straight to disk
    const table = memory.get(TABLE) as Record<string, { sessions: unknown[]; rev?: number }>;
    const row = table["acct-a"]!;
    const now = Date.now();
    row.sessions = [
      { ...live, id: "pc-expired", createdAt: now - 40 * 60_000, expiresAt: now - 10 * 60_000 },
      live,
      { ...live, id: "pc-second", createdAt: now + 1, expiresAt: now + 25 * 60_000 },
    ];
    memory.set(TABLE, table);
    store.refreshFromDisk();
    expect(store.sessions.map((s) => s.id)).toEqual([live.id]);
    expect(diskSessions("acct-a").map((s) => s.id)).toEqual([live.id]);
    // a normal row is a read-only sync (no rewrite): rev unchanged across a second refresh
    const revBefore = (memory.get(TABLE) as Record<string, { rev?: number }>)["acct-a"]!.rev;
    store.refreshFromDisk();
    expect((memory.get(TABLE) as Record<string, { rev?: number }>)["acct-a"]!.rev).toBe(revBefore);
  });

  it("settleProduct(): a completed purchase of a product voids that product's live invoice only (memory + disk); remove() reports", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const inv = store.begin(INPUT)!;
    expect(store.settleProduct("stellarbox-pro")).toBe(true); // other product: nothing to void, still true
    expect(store.sessions.map((s) => s.id)).toEqual([inv.id]);
    expect(store.settleProduct(INPUT.productId)).toBe(true);
    expect(store.sessions).toHaveLength(0);
    expect(diskSessions("acct-a")).toHaveLength(0);
    // remove(): true when the row is gone (removed or never there)
    const again = store.begin(INPUT)!;
    expect(store.remove(again.id)).toBe(true);
    expect(store.remove("pc-nope")).toBe(true);
    expect(diskSessions("acct-a")).toHaveLength(0);
  });

  it("consume() is tri-state: a storage write failure is 'failed' (invoice stays on disk), not 'absent'", () => {
    const store = usePendingCheckout();
    store.bindAccount("acct-a");
    const s = store.begin(INPUT)!;
    storageBroken = true;
    expect(store.consume(s.id)).toBe("failed");
    storageBroken = false;
    expect(diskSessions("acct-a").map((x) => x.id)).toEqual([s.id]); // still there — the user may have paid, keep the instruction
    expect(store.consume(s.id)).toBe("consumed");
    expect(store.consume(s.id)).toBe("absent");
  });
});
