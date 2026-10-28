import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { acquireRaffleEntry, finishRaffleEntry, pendingRaffleEntry } from "./genesis-raffle-entry";
import { createGenesisRaffleApi, parseGenesisRaffleState } from "@/api/genesis-raffle-api";
import type { ApiClient } from "@/api/api-client";

vi.mock("./secure-command-id", () => ({ requireCryptoUuid: () => "entry-id" }));
beforeEach(() => {
  const rows = new Map<string, unknown>();
  vi.stubGlobal("uni", { getStorageSync: (key: string) => structuredClone(rows.get(key) ?? ""), setStorageSync: (key: string, value: unknown) => rows.set(key, structuredClone(value)) });
});
afterEach(() => vi.unstubAllGlobals());
it("keeps one immutable ticket intent across a reload and isolates accounts and draws", () => {
  const entry = acquireRaffleEntry("origin:user-a", "draw-a", 3);
  expect(acquireRaffleEntry("origin:user-a", "draw-a", 9)).toEqual(entry);
  expect(pendingRaffleEntry("origin:user-b", "draw-a")).toBeNull();
  expect(pendingRaffleEntry("origin:user-a", "draw-b")).toBeNull();
  finishRaffleEntry("origin:user-a", "draw-a", "wrong-key"); expect(pendingRaffleEntry("origin:user-a", "draw-a")).toEqual(entry);
  finishRaffleEntry("origin:user-a", "draw-a", entry.key); expect(pendingRaffleEntry("origin:user-a", "draw-a")).toBeNull();
});
it("does not start a new intent when persistence is unreadable or unwritable", () => {
  vi.stubGlobal("uni", { getStorageSync: () => { throw new Error("unreadable"); } });
  expect(() => acquireRaffleEntry("user-a", "draw", 1)).toThrow();
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: () => { throw new Error("full"); } });
  expect(() => acquireRaffleEntry("user-a", "draw", 1)).toThrow();
});
it("requires valid public snapshots and confirms the exact number of tickets entered", async () => {
  expect(parseGenesisRaffleState({ availableTickets: 0, draws: [] })).toEqual({ availableTickets: 0, draws: [] });
  expect(() => parseGenesisRaffleState({ availableTickets: -1, draws: [] })).toThrow();
  expect(() => parseGenesisRaffleState({ availableTickets: 1, draws: [{ status: "DRAFT" }] })).toThrow();
  const request = vi.fn().mockResolvedValue({ drawId: "d", enteredTickets: 2, availableTickets: 3 });
  const api = createGenesisRaffleApi({ request } as unknown as ApiClient);
  await expect(api.enter("d", 2, "stable-key")).resolves.toEqual({ drawId: "d", enteredTickets: 2, availableTickets: 3 });
  expect(request).toHaveBeenCalledWith({ method: "POST", path: "/api/events/genesis-raffle/d/enter", idempotencyKey: "stable-key", body: { tickets: 2 } });
  await expect(api.enter("d", 1, "stable-key")).rejects.toThrow();
  await expect(api.enter("d", 1.5, "key")).rejects.toThrow();
});

it("accepts fixed draw results during delivery without treating pending rewards as paid", () => {
  const draw = { id: "d", titleZh: "奖", titleEn: "Prize", titleVi: "Giải", startsAt: "2030-01-01T00:00:00Z", drawAt: "2030-01-02T00:00:00Z", status: "PROCESSING", revision: 2, prizes: [], myEntries: 1, totalEntries: 1, myResults: [{ prizeId: "p", rewardType: "UVT", amount: "10", receiptId: "r", status: "PENDING" }] };
  const state = parseGenesisRaffleState({ availableTickets: 0, draws: [draw] });
  expect(state.draws[0].status).toBe("PROCESSING"); expect(state.draws[0].myResults[0].status).toBe("PENDING");
  expect(() => parseGenesisRaffleState({ availableTickets: 0, draws: [{ ...draw, myResults: [{ ...draw.myResults[0], status: undefined }] }] })).toThrow();
});
