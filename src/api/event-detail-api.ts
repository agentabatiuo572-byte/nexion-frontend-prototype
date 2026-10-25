import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { parseEvent, type CanonicalEvent, type CanonicalEventUserStatus } from "./events-api";

const eventEligibilityReasons = ["DISABLED", "NOT_STARTED", "ENDED", "NOT_ELIGIBLE", "IN_PROGRESS", "READY", "CLAIMED", "VOUCHER_UNAVAILABLE", "VOUCHER_NOT_STARTED", "VOUCHER_EXPIRED", "VOUCHER_ALREADY_USED", "VOUCHER_EXHAUSTED"] as const;
export type EventEligibilityReason = typeof eventEligibilityReasons[number];
export interface EventVoucher { voucherId:string;percent:number|null;applicableSkus:string[];grantStatus:string;claimable:boolean;usable:boolean;singleSkuOnly:true;singleUse:true;claimSurface:'store' }
export interface EventDetail {
  event: CanonicalEvent;
  rules: Record<string, unknown>;
  enabled: boolean;
  eligible: boolean;
  eligibilityReason: EventEligibilityReason;
  progressValue: number;
  targetValue: number;
  rewards: Array<{ type: string; amount: string | number; productNo?: string; quantity?: number; pool?: boolean }>;
  results: Array<{ region?: string; rank?: number; volume?: number; rewardAmount?: number }>;
  userStatus: CanonicalEventUserStatus;
  claimKeys?: string[];
  reminderSubscribed?: boolean;
  voucher?: EventVoucher | null;
}
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_INVALID" });
  return value as Record<string, any>;
}
function nonnegative(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0)
    throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_INVALID" });
  return Number(value);
}
export function parseEventDetail(value: unknown): EventDetail {
  const row = record(value);
  let voucher:EventVoucher|null|undefined;
  if(row.voucher!=null){
    const v=record(row.voucher);
    if(typeof v.voucherId!=='string'||!v.voucherId.trim()||(v.percent!==null&&(typeof v.percent!=='number'||!Number.isFinite(v.percent)||v.percent<=0||v.percent>=100))
      ||!Array.isArray(v.applicableSkus)||v.applicableSkus.some((sku:unknown)=>typeof sku!=='string'||!sku.trim())||typeof v.grantStatus!=='string'
      ||typeof v.claimable!=='boolean'||typeof v.usable!=='boolean'||v.singleSkuOnly!==true||v.singleUse!==true||v.claimSurface!=='store')throw new ApiError({kind:'protocol',message:'EVENT_DETAIL_INVALID'});
    voucher=v as EventVoucher;
  }else if(row.voucher===null)voucher=null;
  if (typeof row.enabled !== "boolean" || typeof row.eligible !== "boolean"
    || (row.claimKeys !== undefined && (!Array.isArray(row.claimKeys) || row.claimKeys.some((key: unknown) => typeof key !== "string" || !key)))
    || (row.reminderSubscribed !== undefined && typeof row.reminderSubscribed !== "boolean")
    || !eventEligibilityReasons.includes(row.eligibilityReason)
    || !["AVAILABLE", "JOINED", "CLAIMABLE", "CLAIMED"].includes(row.userStatus)
    || !Array.isArray(row.rewards) || !Array.isArray(row.results)) throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_INVALID" });
  return {
    event: parseEvent(row.event), rules: record(row.rules), enabled: row.enabled, eligible: row.eligible,
    eligibilityReason: row.eligibilityReason, userStatus: row.userStatus,
    ...(voucher!==undefined?{voucher}:{}),
    ...(Array.isArray(row.claimKeys) && row.claimKeys.every((key: unknown) => typeof key === "string" && key) ? { claimKeys: row.claimKeys } : {}),
    ...(typeof row.reminderSubscribed === "boolean" ? { reminderSubscribed: row.reminderSubscribed } : {}),
    progressValue: nonnegative(row.progressValue), targetValue: nonnegative(row.targetValue),
    rewards: row.rewards.map(value => {
      const item = record(value);
      if (typeof item.type !== "string" || !item.type.trim()) throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_INVALID" });
      if (item.pool !== undefined && typeof item.pool !== "boolean") throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_INVALID" });
      nonnegative(item.amount);
      return { type: item.type, amount: item.amount,
        ...(typeof item.productNo === "string" ? { productNo: item.productNo } : {}),
        ...(item.quantity != null ? { quantity: nonnegative(item.quantity) } : {}),
        ...(item.pool === true ? { pool: true } : {}),
      };
    }),
    results: row.results.map(value => {
      const item = record(value);
      return { ...(typeof item.region === "string" ? { region: item.region } : {}),
        ...(item.rank != null ? { rank: nonnegative(item.rank) } : {}),
        ...(item.volume != null ? { volume: nonnegative(item.volume) } : {}),
        ...(item.rewardAmount != null ? { rewardAmount: nonnegative(item.rewardAmount) } : {}),
      };
    }),
  };
}
export function createEventDetailApi(client: ApiClient) {
  return { detail: async (code: string, locale: string): Promise<EventDetail> => {
    const result = parseEventDetail(await client.request({ method: "GET", path: `/api/events/${encodeURIComponent(code)}/detail?locale=${encodeURIComponent(locale)}` }));
    if (result.event.eventCode !== code) throw new ApiError({ kind: "protocol", message: "EVENT_DETAIL_SCOPE_MISMATCH" });
    return result;
  }, remind: async (code: string, key: string) => {
    const result = record(await client.request({ method: "POST", path: `/api/events/${encodeURIComponent(code)}/reminder`, idempotencyKey: key }));
    if (result.eventId !== code || result.status !== "SUBSCRIBED") throw new ApiError({ kind: "protocol", message: "EVENT_REMINDER_INVALID" });
    return result;
  } };
}
