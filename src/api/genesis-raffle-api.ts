import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface GenesisRafflePrize { id: string; nameZh: string; nameEn: string; nameVi: string; rewardType: "NEX" | "USDT" | "DEVICE"; amount: string | number; quantity: number; productNo?: string; }
export interface GenesisRaffleDraw { id: string; titleZh: string; titleEn: string; titleVi: string; startsAt: string; drawAt: string; status: "OPEN" | "PROCESSING" | "DRAWN"; revision: number; prizes: GenesisRafflePrize[]; myEntries: number; totalEntries: number; myResults: Array<{ prizeId: string; rewardType: GenesisRafflePrize["rewardType"]; amount: string | number; productNo?: string; receiptId: string; status: "PENDING" | "PAID" }>; }
export interface GenesisRaffleState { availableTickets: number; draws: GenesisRaffleDraw[]; }
const invalid = (): never => { throw new ApiError({ kind: "protocol", message: "GENESIS_RAFFLE_RESPONSE_INVALID" }); };
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : invalid();
const text = (value: unknown): string => typeof value === "string" && value.trim() ? value : invalid();
const integer = (value: unknown, min = 0): number => Number.isSafeInteger(value) && Number(value) >= min ? Number(value) : invalid();
const amount = (value: unknown): string | number => (typeof value === "string" && /^(0|[1-9]\d*)(\.\d+)?$/.test(value)) || (typeof value === "number" && Number.isFinite(value) && value >= 0) ? value as string | number : invalid();
const time = (value: unknown): string => Number.isFinite(Date.parse(text(value))) ? value as string : invalid();
const rewardType = (value: unknown): GenesisRafflePrize["rewardType"] => ["NEX", "USDT", "DEVICE"].includes(String(value)) ? value as GenesisRafflePrize["rewardType"] : invalid();
export function parseGenesisRaffleState(value: unknown): GenesisRaffleState {
  const row = object(value); if (!Array.isArray(row.draws)) return invalid();
  return { availableTickets: integer(row.availableTickets), draws: row.draws.map(value => {
    const draw = object(value); if (!["OPEN", "PROCESSING", "DRAWN"].includes(draw.status) || !Array.isArray(draw.prizes) || !Array.isArray(draw.myResults)) return invalid();
    return { id: text(draw.id), titleZh: text(draw.titleZh), titleEn: text(draw.titleEn), titleVi: text(draw.titleVi), startsAt: time(draw.startsAt), drawAt: time(draw.drawAt), status: draw.status,
      revision: integer(draw.revision), myEntries: integer(draw.myEntries), totalEntries: integer(draw.totalEntries),
      prizes: draw.prizes.map(value => { const p = object(value); return { id: text(p.id), nameZh: text(p.nameZh), nameEn: text(p.nameEn), nameVi: text(p.nameVi), rewardType: rewardType(p.rewardType), amount: amount(p.amount), quantity: integer(p.quantity, 1), ...(typeof p.productNo === "string" ? { productNo: p.productNo } : {}) }; }),
      myResults: draw.myResults.map(value => { const p = object(value); if (!["PENDING", "PAID"].includes(p.status)) return invalid(); return { status: p.status as "PENDING" | "PAID", prizeId: text(p.prizeId), rewardType: rewardType(p.rewardType), amount: amount(p.amount), receiptId: text(p.receiptId), ...(typeof p.productNo === "string" ? { productNo: p.productNo } : {}) }; }),
    };
  }) };
}
export function createGenesisRaffleApi(client: ApiClient) {
  return {
    state: async () => parseGenesisRaffleState(await client.request({ path: "/api/events/genesis-raffle" })),
    enter: async (drawId: string, tickets: number, key: string) => {
      integer(tickets, 1);
      const result = object(await client.request({ method: "POST", path: `/api/events/genesis-raffle/${encodeURIComponent(drawId)}/enter`, idempotencyKey: text(key), body: { tickets } }));
      if (result.drawId !== drawId) return invalid();
      if (integer(result.enteredTickets, 1) !== tickets) return invalid();
      return { drawId, enteredTickets: result.enteredTickets as number, availableTickets: integer(result.availableTickets) };
    },
  };
}
