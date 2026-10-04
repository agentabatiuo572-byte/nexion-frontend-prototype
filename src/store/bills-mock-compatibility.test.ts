import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({list:vi.fn(),summary:vi.fn()}));
vi.mock("@/api/runtime", () => ({fundsServerEnabled:false,walletBillsApi:api}));
vi.mock("./server-time", () => ({mockServerNow:() => 1900000000000}));
const { useBills } = await import("./bills");
const storage = new Map<string, unknown>();
let broken = false;
beforeEach(() => {
  storage.clear(); broken = false; api.list.mockReset(); api.summary.mockReset(); setActivePinia(createPinia());
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.has(key) ? JSON.parse(JSON.stringify(storage.get(key))) : "",
    setStorageSync: (key: string, value: unknown) => { if (broken) throw new Error("quota"); storage.set(key,JSON.parse(JSON.stringify(value))); },
  });
});
describe("mock ledger compatibility after demand pagination", () => {
  it("preserves mock seed, persistence, account isolation and idempotent writes without remote requests", async () => {
    const store = useBills(); store.bindAccount("A"); const count = store.bills.length;
    const draft = {type:"bonus" as const,amount:8,symbol:"NEX" as const,status:"pending" as const,memo:"fixture",ref:"fixture-A"};
    store.addOnce(draft); store.addOnce(draft);
    expect(store.bills).toHaveLength(count+1); expect(store.settleByRef("fixture-A","posted")).toBe(true);
    store.bindAccount("B"); expect(store.bills.some(b=>b.ref === "fixture-A")).toBe(false);
    store.bindAccount("A"); expect(store.bills.find(b=>b.ref === "fixture-A")?.status).toBe("posted");
    await store.refreshServerLedger(); await store.refreshSummary();
    expect(api.list).not.toHaveBeenCalled(); expect(api.summary).not.toHaveBeenCalled();
  });
  it("still rolls back the whole group if mock persistence fails", () => {
    const store = useBills(); store.bindAccount("A"); const before = store.bills;
    broken = true;
    expect(store.addMany([{type:"swap",amount:-3,symbol:"USDT",status:"posted",memo:"out"},{type:"swap",amount:6,symbol:"NEX",status:"posted",memo:"in"}])).toBeNull();
    expect(store.bills).toEqual(before);
  });
});
