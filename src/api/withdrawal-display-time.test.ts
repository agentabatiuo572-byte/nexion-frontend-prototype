import { afterEach, expect, it, vi } from "vitest";
import { createWithdrawalApi, toCanonicalWithdrawal } from "./withdrawal-api";
import { readAccountSnapshot, writeAccountSnapshot, mergeAccountSnapshots, type AccountCloudSnapshot } from "@/store/account-cloud";
const address = "0x1234567890123456789012345678901234567890";
const row = { withdrawalNo: "WD-display", targetAddress: address, amount: 25, chain: "USDT-BEP20", status: "REVIEW_PENDING", holdUntil: "2026-08-20T00:00:00Z",
  createdAt: "2025-12-31 23:05:06", networkConfirmUsd: 1, networkFee: 1, penaltyFee: 0, grossFee: 1, nexBurned: 0, feeWaived: 0,
  actualFee: 1, netReceive: 24, policyVersion: "p1", useNexFeeOffset: false, riskRoute: "delay", idSource: "server" };
async function canonical(createdAt: unknown) {
  const api = createWithdrawalApi({ request: async () => ({ source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION", withdrawals: [{ ...row, createdAt }],
    page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false } }) } as never);
  const [parsed] = await api.list(); return { parsed, withdrawal: toCanonicalWithdrawal(parsed, address) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps parsed Java creation time as read-only display evidence without changing business submission time", async () => {
  const { parsed, withdrawal } = await canonical(row.createdAt);
  expect(withdrawal.displaySubmittedAt).toBe(Date.parse("2025-12-31T23:05:06+08:00"));
  expect(withdrawal.submittedAt).toBe(withdrawal.displaySubmittedAt);
  const custom = toCanonicalWithdrawal(parsed, address, 12345);
  expect(custom.displaySubmittedAt).toBe(withdrawal.displaySubmittedAt); expect(custom.submittedAt).toBe(12345);
  expect(custom.amount).toBe(25); expect(custom.status).toBe("review-pending"); expect(custom.fee).toEqual(withdrawal.fee);
});
it.each([undefined, null, "", "invalid", "1970-01-01T00:00:00Z", "1969-12-31T23:59:59Z"])("remote missing/invalid creation %s never becomes the current display date", async createdAt => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T01:02:03Z"));
  const { withdrawal } = await canonical(createdAt);
  expect(withdrawal.displaySubmittedAt).toBeNull(); expect(withdrawal.amount).toBe(25); expect(withdrawal.status).toBe("review-pending");
});
it.each([NaN, Infinity, -1, 0, 9e18])("out-of-domain converter input %s retains unknown display evidence", async value => {
  const { parsed } = await canonical(row.createdAt); const withdrawal = toCanonicalWithdrawal({ ...parsed, createdAt: value }, address, 12345);
  expect(withdrawal.displaySubmittedAt).toBeNull(); expect(withdrawal.submittedAt).toBe(12345);
});
it("persists and clones display evidence without backfilling old cache or changing original business timestamps", async () => {
  const store: Record<string, unknown> = {}; vi.stubGlobal("uni", { getStorageSync: (key: string) => store[key], setStorageSync: (key: string, value: unknown) => { store[key] = JSON.parse(JSON.stringify(value)); } });
  const { withdrawal } = await canonical(row.createdAt); const old = { ...withdrawal, id: "legacy" }; delete old.displaySubmittedAt;
  const snapshot = { schema: 1, accountKey: "scope-a", entrySurface: "app", updatedAt: 1, user: { email: "fixture@example.invalid" }, devices: [], earnings: {}, withdrawals: [withdrawal, old] } as unknown as AccountCloudSnapshot;
  expect(writeAccountSnapshot(snapshot)).toBe(true);
  const read = readAccountSnapshot("scope-a")!;
  expect(read.withdrawals[0].displaySubmittedAt).toBe(withdrawal.displaySubmittedAt); expect(read.withdrawals[1].displaySubmittedAt).toBeUndefined();
  expect(read.withdrawals.map(w => w.submittedAt)).toEqual(snapshot.withdrawals.map(w => w.submittedAt)); expect(readAccountSnapshot("scope-b")).toBeNull();
  const next = { ...read, withdrawals: read.withdrawals.map(w => ({ ...w, displaySubmittedAt: null })) };
  const merged = mergeAccountSnapshots(read, next, read);
  expect(merged.withdrawals.every(w => w.displaySubmittedAt === null)).toBe(true);
});
it("does not add display evidence to the withdrawal command payload", async () => {
  const request = vi.fn(async (_input: unknown) => row); const api = createWithdrawalApi({ request } as never);
  await api.submit(25, "USDT-BEP20", address, "p1", false, "test-key");
  expect(request.mock.calls[0][0]).toMatchObject({ method: "POST", path: "/api/withdrawals", body: { amount: 25, chain: "USDT-BEP20", address, policyVersion: "p1", useNexFeeOffset: false } });
  expect(Object.keys((request.mock.calls[0] as unknown as [{ body: object }])[0].body).sort()).toEqual(["address", "amount", "chain", "policyVersion", "useNexFeeOffset"]);
});
