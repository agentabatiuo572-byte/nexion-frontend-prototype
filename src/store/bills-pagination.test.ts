import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({ fundsServerEnabled: true, walletBillsApi: { list: vi.fn(), summary: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const { useBills } = await import("./bills");
const row = (id: string) => ({ id, bizNo: id, bizType: "QUEST_REWARD", asset: "NEX", direction: "IN", amount: 2, balanceAfter: 9, status: "SUCCESS", remark: id, createdAt: 1000 });
const page = (ids: string[], nextCursor: string | null = null, current = 1) => ({ source: "server", sourceEnvironment: "PRODUCTION", bills: ids.map(row), page: current, pageSize: 50, total: 1101, nextPage: nextCursor ? current + 1 : null, nextCursor });
const summary = (amount = 2202) => ({ source: "server", sourceEnvironment: "PRODUCTION", asOf: 2000, timeZone: "Asia/Shanghai", rewardsUsdt: 0, rewardsNex: amount, latestRewardAt: 1000, todayNexEarn: 800, pendingNex: 120, monthBillCount: 1101, recentNexBills: [row("recent")] });
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { setActivePinia(createPinia()); remote.walletBillsApi.list.mockReset(); remote.walletBillsApi.summary.mockReset().mockResolvedValue(summary()); });

describe("wallet ledger demand pagination and authoritative summaries", () => {
  it("login loads a summary, never twenty pages; opening bills loads exactly one page", async () => {
    remote.walletBillsApi.list.mockResolvedValue(page(["1"], "cursor-1"));
    const store = useBills(); store.bindAccount("A"); await store.refreshSummary();
    expect(remote.walletBillsApi.list).not.toHaveBeenCalled();
    await store.refreshServerLedger();
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(1);
    expect(remote.walletBillsApi.list).toHaveBeenCalledWith(1, 50, { cursor: "start" });
    expect(store.bills.map(b => b.id)).toEqual(["1"]);
    expect(store.summary?.rewardsNex).toBe(2202);
    expect(store.summary?.recentNexBills[0].type).toBe("achievement");
  });
  it("coalesces first-page, next-page and summary reads, but does not cache settled reads", async () => {
    const first = deferred<ReturnType<typeof page>>(); const next = deferred<ReturnType<typeof page>>(); const sum = deferred<ReturnType<typeof summary>>();
    remote.walletBillsApi.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise).mockResolvedValue(page(["fresh"]));
    remote.walletBillsApi.summary.mockReturnValue(sum.promise);
    const store = useBills(); store.bindAccount("A");
    const sums = [store.refreshSummary(), store.refreshSummary()];
    const p = store.getLedger(); const initial = [p.refresh(), p.refresh(), store.refreshServerLedger()];
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(1); expect(remote.walletBillsApi.summary).toHaveBeenCalledTimes(1);
    first.resolve(page(["1"], "c1")); sum.resolve(summary()); await Promise.all([...initial, ...sums]);
    const more = [p.loadMore(), p.loadMore()]; expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
    next.resolve(page(["1", "2"], null, 2)); await Promise.all(more);
    expect(p.rows.map(b => b.id)).toEqual(["1", "2"]); expect(p.hasMore).toBe(false);
    await p.loadMore(); expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
    await p.refresh(); expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(3); expect(p.rows[0].id).toBe("fresh");
  });
  it("keeps loaded rows after an append failure and retries the same cursor", async () => {
    remote.walletBillsApi.list.mockResolvedValueOnce(page(["1"], "c1")).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page(["2"], null, 2));
    const p = useBills().getLedger(); await p.refresh();
    await expect(p.loadMore()).rejects.toThrow("offline"); expect(p.rows.map(b => b.id)).toEqual(["1"]); expect(p.hasMore).toBe(true); expect(p.loadingMore).toBe(false);
    await p.loadMore(); expect(p.rows.map(b => b.id)).toEqual(["1", "2"]); expect(p.error).toBe("");
    expect(remote.walletBillsApi.list.mock.calls[1]).toEqual(remote.walletBillsApi.list.mock.calls[2]);
  });
  it("keeps filtered streams separate and deduplicates equivalent filters", async () => {
    remote.walletBillsApi.list.mockResolvedValue(page(["r"])); const store = useBills();
    const p = store.getLedger({ category: "REWARD", asset: "NEX" });
    expect(p).toBe(store.getLedger({ asset: "NEX", category: "REWARD" }));
    await p.refresh(); expect(remote.walletBillsApi.list).toHaveBeenCalledWith(1, 50, { asset: "NEX", category: "REWARD", cursor: "start" });
    expect(store.getLedger().rows).toEqual([]);
  });
  it("uses the controlled projection for a trial purchase and never exposes its internal remark", async () => {
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: 1, nextPage: null, nextCursor: null,
      bills: [{ ...row("trial-charge"), bizNo: "TRIAL-42:CHARGE", bizType: "TRIAL_CHARGE", direction: "OUT", amount: 1249,
        remark: "H2 internal conversion settlement", category: "purchase", presentationCode: "trialCharge" }],
    });
    const pager = useBills().getLedger(); await pager.refresh();
    expect(pager.rows[0]).toMatchObject({ type: "purchase", amount: -1249, memo: "", memoKey: "trialCharge", ref: undefined });
  });
  it.each(["constructor", "toString", "__proto__"])("treats inherited presentation code %s as unknown", async (presentationCode) => {
    remote.walletBillsApi.list.mockResolvedValue({
      ...page(["unrecognized"]),
      bills: [{ ...row("unrecognized"), bizType: "FUTURE_UNMAPPED", presentationCode }],
    });
    const pager = useBills().getLedger(); await pager.refresh();
    expect(pager.rows[0]).toMatchObject({ memoKey: "other", memo: "", ref: undefined });
  });
  it("uses the legacy bizType allowlist without exposing internal remarks or DEV task identifiers", async () => {
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: 3, nextPage: null, nextCursor: null,
      bills: [
        { ...row("compute"), bizNo: "DEV-TASK-77", bizType: "COMPUTE_TASK_REWARD", remark: "development server-authoritative compute task reward" },
        { ...row("unknown"), bizNo: "INTERNAL-ONLY-9", bizType: "FUTURE_UNMAPPED", remark: "D5 internal ledger note" },
        { ...row("order"), bizNo: "ORD-42", bizType: "ORDER_PURCHASE", direction: "OUT", remark: "internal order settlement" },
      ],
    });
    const pager = useBills().getLedger(); await pager.refresh();
    expect(pager.rows).toMatchObject([
      { type: "earn", memo: "", memoKey: "computeTaskReward", ref: undefined },
      { type: "other", memo: "", memoKey: "other", ref: undefined },
      { type: "purchase", memo: "", memoKey: "purchase", ref: "ORD-42" },
    ]);
  });
  it("keeps three equal course rewards traceable with an older generic server projection", async () => {
    const courses = ["account-security", "orders-and-bills", "tasks-and-learning"];
    remote.walletBillsApi.list.mockResolvedValue({
      ...page([], null), total: 3,
      bills: courses.map((course, index) => ({ ...row(`course-${index}`), bizNo: `LEARN:7:${course}:v1`,
        bizType: "LEARNING_REWARD", amount: 10, category: "bonus", presentationCode: "bonus",
        remark: `internal user 7 ${course}` })),
    });
    const pager = useBills().getLedger(); await pager.refresh();
    expect(pager.rows.map(b => [b.memoKey, b.ref, b.amount])).toEqual(courses.map(course => ["learningReward", `${course}@v1`, 10]));
    expect(pager.rows.every(b => b.memo === "" && !b.ref?.includes("7"))).toBe(true);
  });
  it("does not invent a course source from a malformed ledger number", async () => {
    remote.walletBillsApi.list.mockResolvedValue({ ...page([], null), total: 2, bills: [
      { ...row("wrong-prefix"), bizNo: "PRIVATE:7:account-security:v1", bizType: "LEARNING_REWARD" },
      { ...row("wrong-course"), bizNo: "LEARN:7:UPPER CASE:v1", bizType: "LEARNING_REWARD" },
    ] });
    const pager = useBills().getLedger(); await pager.refresh();
    expect(pager.rows.map(b => b.ref)).toEqual([undefined, undefined]);
  });
  it("normalizes every current withdrawal accounting leg to its withdrawal tracking number", async () => {
    const withdrawalNo = "WD-0123456789ABCDEF0123456789ABCDEF";
    const components = [
      ["WITHDRAW_NET_PRINCIPAL", `${withdrawalNo}:USDT:PRINCIPAL`, "withdrawPrincipal"],
      ["WITHDRAW_NETWORK_FEE", `${withdrawalNo}:USDT:NETWORK_FEE`, "withdrawNetworkFee"],
      ["WITHDRAW_PENALTY_FEE", `${withdrawalNo}:USDT:PENALTY_FEE`, "withdrawPenaltyFee"],
      ["WITHDRAW_FEE_OFFSET", `${withdrawalNo}:NEX:OFFSET`, "withdrawFeeOffset"],
      ["WITHDRAW_PAYOUT_REFUND", `${withdrawalNo}:PAYOUT:USDT:REFUND`, "withdrawPayoutRefund"],
      ["WITHDRAW_PAYOUT_NEX_REFUND", `${withdrawalNo}:PAYOUT:NEX:REFUND`, "withdrawPayoutNexRefund"],
      ["WITHDRAW_REFUND", `D2-REFUND-${withdrawalNo}`, "withdrawRefund"],
      ["WITHDRAW_FEE_OFFSET_REFUND", `D2-NEX-REFUND-${withdrawalNo}`, "withdrawFeeOffsetRefund"],
    ] as const;
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: components.length, nextPage: null, nextCursor: null,
      bills: components.map(([bizType, bizNo], index) => ({ ...row(`withdraw-${index}`), bizType, bizNo, remark: `D${index + 2} internal withdrawal accounting note` })),
    });

    const pager = useBills().getLedger(); await pager.refresh();

    expect(pager.rows).toHaveLength(components.length);
    expect(pager.rows).toEqual(expect.arrayContaining(components.map(([, , memoKey]) => expect.objectContaining({
      type: "withdraw", memo: "", memoKey, ref: withdrawalNo,
    }))));
  });
  it("keeps future withdrawal legs generic unless the server supplies a recognized presentation code", async () => {
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: 2, nextPage: null, nextCursor: null,
      bills: [
        { ...row("withdraw-unknown"), bizType: "WITHDRAW_FUTURE_COMPONENT", category: "withdraw", direction: "OUT", presentationCode: undefined },
        { ...row("withdraw-server-code"), bizType: "WITHDRAW_FUTURE_COMPONENT", category: "withdraw", direction: "OUT", presentationCode: "withdrawNetworkFee" },
      ],
    });

    const pager = useBills().getLedger(); await pager.refresh();

    expect(pager.rows).toMatchObject([
      { type: "withdraw", memo: "", memoKey: "withdraw", ref: undefined },
      { type: "withdraw", memo: "", memoKey: "withdrawNetworkFee", ref: undefined },
    ]);
  });  it("keeps specific legacy component labels when an older server sends generic withdraw", async () => {
    const withdrawalNo = "WD-0123456789ABCDEF0123456789ABCDEF";
    const components = [
      ["WITHDRAW_NET_PRINCIPAL", `${withdrawalNo}:USDT:PRINCIPAL`, "withdrawPrincipal"],
      ["WITHDRAW_NETWORK_FEE", `${withdrawalNo}:USDT:NETWORK_FEE`, "withdrawNetworkFee"],
      ["WITHDRAW_PENALTY_FEE", `${withdrawalNo}:USDT:PENALTY_FEE`, "withdrawPenaltyFee"],
      ["WITHDRAW_FEE_OFFSET", `${withdrawalNo}:NEX:OFFSET`, "withdrawFeeOffset"],
      ["WITHDRAW_PAYOUT_REFUND", `${withdrawalNo}:PAYOUT:USDT:REFUND`, "withdrawPayoutRefund"],
      ["WITHDRAW_PAYOUT_NEX_REFUND", `${withdrawalNo}:PAYOUT:NEX:REFUND`, "withdrawPayoutNexRefund"],
      ["WITHDRAW_REFUND", `D2-REFUND-${withdrawalNo}`, "withdrawRefund"],
      ["WITHDRAW_FEE_OFFSET_REFUND", `D2-NEX-REFUND-${withdrawalNo}`, "withdrawFeeOffsetRefund"],
    ] as const;
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: components.length, nextPage: null, nextCursor: null,
      bills: components.map(([bizType, bizNo], index) => ({ ...row(`legacy-withdraw-${index}`), bizType, bizNo, category: "withdraw", presentationCode: "withdraw" })),
    });

    const pager = useBills().getLedger(); await pager.refresh();

    expect(pager.rows).toEqual(expect.arrayContaining(components.map(([, , memoKey]) => expect.objectContaining({
      type: "withdraw", memo: "", memoKey, ref: withdrawalNo,
    }))));
  });
  it("does not turn a malformed withdrawal component key into a tracking link", async () => {
    remote.walletBillsApi.list.mockResolvedValue({
      source: "server", sourceEnvironment: "PRODUCTION", page: 1, pageSize: 50, total: 1, nextPage: null, nextCursor: null,
      bills: [{ ...row("withdraw-malformed"), bizType: "WITHDRAW_PAYOUT_REFUND", bizNo: "D5-PRIVATE-LEDGER:PAYOUT:USDT:REFUND", remark: "provider internal return" }],
    });

    const pager = useBills().getLedger(); await pager.refresh();

    expect(pager.rows[0]).toMatchObject({ type: "withdraw", memo: "", memoKey: "withdrawPayoutRefund", ref: undefined });
  });
  it("rejects old-account and same-account-rebind results without changing current data", async () => {
    const old = deferred<ReturnType<typeof page>>(); const oldSum = deferred<ReturnType<typeof summary>>();
    remote.walletBillsApi.list.mockReturnValueOnce(old.promise).mockResolvedValue(page(["B"]));
    remote.walletBillsApi.summary.mockReturnValueOnce(oldSum.promise).mockResolvedValue(summary(7));
    const store = useBills(); store.bindAccount("A"); const oldSummary = store.refreshSummary().catch(e => e); const oldPage = store.refreshServerLedger().catch(e => e);
    store.bindAccount("A"); await store.refreshSummary(); await store.refreshServerLedger();
    old.resolve(page(["A"])); oldSum.resolve(summary(999)); await Promise.all([oldSummary, oldPage]);
    expect(store.bills[0].id).toBe("B"); expect(store.summary?.rewardsNex).toBe(7);
    store.bindAccount("B"); expect(store.bills).toEqual([]); expect(store.getLedger().hasMore).toBe(false);
  });
  it("refresh supersedes an older append and a forced read supersedes an older refresh", async () => {
    const stale = deferred<ReturnType<typeof page>>(); const p = useBills().getLedger();
    remote.walletBillsApi.list.mockResolvedValueOnce(page(["1"], "c1")).mockReturnValueOnce(stale.promise).mockResolvedValueOnce(page(["fresh"]));
    await p.refresh(); const old = p.loadMore().catch(e => e); await p.refresh(); stale.resolve(page(["stale"])); await old;
    expect(p.rows.map(b => b.id)).toEqual(["fresh"]);
    const slow = deferred<ReturnType<typeof page>>(); remote.walletBillsApi.list.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(["forced"]));
    const read = p.refresh().catch(e => e); await p.refresh({ force: true }); slow.resolve(page(["old"])); await read;
    expect(p.rows[0].id).toBe("forced");
  });
  it("never replaces a failed summary with partial-page sums or a fake zero", async () => {
    const store = useBills(); await store.refreshSummary(); remote.walletBillsApi.summary.mockRejectedValueOnce(new Error("summary offline"));
    await expect(store.refreshSummary()).rejects.toThrow("summary offline"); expect(store.summary).toBeNull(); expect(store.summaryStatus).toBe("error");
  });
  it("can scroll beyond the former 1000-row cap and stops when the server has no cursor", async () => {
    remote.walletBillsApi.list.mockImplementation(async (n: number) => page(Array.from({length:50}, (_,i) => `${n}-${i}`), n < 22 ? `c${n}` : null, n));
    const p = useBills().getLedger(); await p.refresh(); expect(p.rows).toHaveLength(50);
    for (let i = 0; i < 24; i++) await p.loadMore();
    expect(p.rows).toHaveLength(1100); expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(22);
  });
  it("fails closed for a repeated or missing next cursor without draining pages", async () => {
    const p = useBills().getLedger();
    remote.walletBillsApi.list.mockResolvedValueOnce(page(["1"], "c1"))
      .mockResolvedValueOnce(page(["2"], "c1", 2));
    await p.refresh(); await expect(p.loadMore()).rejects.toThrow("CURSOR_INVALID");
    expect(p.rows.map(b => b.id)).toEqual(["1"]); expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
    remote.walletBillsApi.list.mockResolvedValueOnce({...page(["2"], null, 2),nextPage:3});
    await expect(p.loadMore()).rejects.toThrow("CURSOR_INVALID"); expect(p.rows.map(b => b.id)).toEqual(["1"]);
  });
  it("rejects multi-step cursor cycles without accepting a duplicate page", async () => {
    remote.walletBillsApi.list.mockResolvedValueOnce(page(["1"],"c1")).mockResolvedValueOnce(page(["2"],"c2",2)).mockResolvedValueOnce(page(["3"],"c1",3));
    const p = useBills().getLedger(); await p.refresh(); await p.loadMore();
    await expect(p.loadMore()).rejects.toThrow("CURSOR_INVALID"); expect(p.rows.map(b=>b.id)).toEqual(["1","2"]);
  });
  it("does not make old failures clear a new account or refreshed summary", async () => {
    const old = deferred<ReturnType<typeof summary>>(); const store = useBills();
    remote.walletBillsApi.summary.mockReturnValueOnce(old.promise).mockResolvedValueOnce(summary(3));
    const slow = store.refreshSummary().catch(e => e); await store.refreshSummary({force:true});
    old.reject(new Error("old failure")); await slow;
    expect(store.summaryStatus).toBe("ready"); expect(store.summary?.rewardsNex).toBe(3); expect(store.summaryError).toBe("");
  });
  it("clears all filters on logout without an unauthorized automatic read", async () => {
    const store = useBills(); remote.walletBillsApi.list.mockResolvedValue(page(["1"], "c1"));
    const filtered = store.getLedger({direction:"IN"}); await filtered.refresh();
    store.bindAccount("default");
    expect(filtered.rows).toEqual([]); expect(filtered.status).toBe("idle"); expect(store.summary).toBeNull();
    expect(remote.walletBillsApi.summary).not.toHaveBeenCalled();
  });
});
