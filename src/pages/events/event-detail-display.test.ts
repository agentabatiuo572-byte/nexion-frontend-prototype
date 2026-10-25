import { expect, it, vi } from "vitest";
import { createEventDetailApi, parseEventDetail, type EventDetail } from "@/api/event-detail-api";
import type { ApiClient } from "@/api/api-client";
import { eventDetailCopy } from "@/i18n/event-detail";
import { eventDetailAction, eventDetailRules, eventDetailReward, eventClaimCommandKey, eventDetailHref } from "./event-detail-display";
import { promotionDetailHref,promotionCheckoutHref,voucherEntryContext } from '@/lib/promotion-entry';

function queryValues(query:URLSearchParams){const values:Record<string,string>={};query.forEach((value,key)=>{values[key]=value;});return values;}
function detail(): EventDetail {
  return { event: { eventCode: "evt-1", kind: "referral", state: "ongoing", title: "Invite", subtitle: "Invite friends", rewardName: "Device", rewardType: "DEVICE", rewardAmount: 1, featured: false, trackable: true, targetValue: 5, progressValue: 2, userStatus: "AVAILABLE", geo: "", href: "/pages/team/team", startsAt: null, endsAt: null },
    rules: { targetInvites: 5, windowDays: 7, deviceBudget: 20, giftProductNo: "private-product-no", arbitraryInternalKey: "not-for-users" }, enabled: true, eligible: true, eligibilityReason: "IN_PROGRESS", progressValue: 2, targetValue: 5, rewards: [{ type: "DEVICE", amount: 0, quantity: 1 }], results: [], userStatus: "AVAILABLE" };
}
it('seasonal BF20 keeps the whole hardware store and passes voucher context through detail and checkout',()=>{
  const value=detail();value.event.kind='seasonal';value.event.trackable=false;value.rules={voucherId:'BF20',promotionActivityId:'Pro upgrade'};
  const store=new URL(eventDetailHref(value),'https://app.test');
  expect(store.pathname).toBe('/pages/store/store');expect(store.searchParams.get('scope')).toBe('all');expect(store.searchParams.has('activityId')).toBe(false);
  const context=voucherEntryContext(queryValues(store.searchParams));
  const product=new URL(promotionDetailHref('ordinary sku',undefined,context),'https://app.test');
  const checkout=new URL(promotionCheckoutHref([{productNo:'ordinary sku',quantity:3}],undefined,voucherEntryContext(queryValues(product.searchParams))),'https://app.test');
  expect(checkout.searchParams.get('voucherId')).toBe('BF20');expect(checkout.searchParams.get('upgradeActivityId')).toBe('Pro upgrade');expect(checkout.searchParams.has('activityId')).toBe(false);
  expect(JSON.parse(checkout.searchParams.get('items')!)).toEqual([{productNo:'ordinary sku',quantity:3}]);
});
it('parses actual voucher states and provides localized unavailable reasons without opening checkout',()=>{
  const voucher={voucherId:'BF20',percent:20,applicableSkus:[],grantStatus:'USED',claimable:false,usable:false,singleSkuOnly:true,singleUse:true,claimSurface:'store'};
  for(const reason of ['VOUCHER_UNAVAILABLE','VOUCHER_NOT_STARTED','VOUCHER_EXPIRED','VOUCHER_ALREADY_USED','VOUCHER_EXHAUSTED'] as const){
    const value=parseEventDetail({...detail(),eligible:false,eligibilityReason:reason,voucher});expect(value.voucher).toEqual(voucher);expect(eventDetailAction(value)).toBeNull();
    for(const copy of Object.values(eventDetailCopy))expect(copy.eligibility[reason]).toBeTruthy();
  }
  for(const patch of [{percent:'20'},{singleUse:false},{claimable:1},{applicableSkus:[null]}])expect(()=>parseEventDetail({...detail(),voucher:{...voucher,...patch}})).toThrow('EVENT_DETAIL_INVALID');
});
it.each(Object.values(eventDetailCopy))("only renders known public rule labels and real reward quantities", copy => {
  const value = detail(); const rows = eventDetailRules(value.rules, copy);
  expect(rows).toEqual([{ label: copy.labels.targetInvites, value: "5" }, { label: copy.labels.windowDays, value: "7" }]);
  expect(eventDetailReward(value.rewards[0], copy)).toContain(copy.device);
  expect(eventDetailRules({ weekdays: [6, 7], regions: [{ name: "SEA", countries: ["VN"] }] }, copy)).toEqual([
    { label: copy.labels.weekdays, value: `${copy.weekdays[5]} · ${copy.weekdays[6]}` }, { label: copy.labels.regions, value: "SEA" },
  ]);
});
it("offers only actions permitted by current event eligibility and state", () => {
  const value = detail(); expect(eventDetailAction(value)).toBe("join");
  value.userStatus = "JOINED"; expect(eventDetailAction(value)).toBe("open");
  value.userStatus = "CLAIMABLE"; expect(eventDetailAction(value)).toBe("claim");
  value.userStatus = "JOINED";
  for (const reason of ["DISABLED", "NOT_STARTED", "ENDED", "NOT_ELIGIBLE", "CLAIMED"] as const) expect(eventDetailAction({ ...value, eligibilityReason: reason })).toBeNull();
  expect(eventDetailAction({ ...value, enabled: false })).toBeNull();
  expect(eventDetailAction({ ...value, eligible: false })).toBeNull();
  expect(eventDetailAction({ ...value, event: { ...value.event, state: "ended" } })).toBeNull();
  expect(eventDetailAction({ ...value, event: { ...value.event, state: "upcoming" }, reminderSubscribed: false })).toBe("remind");
  expect(eventDetailAction({ ...value, event: { ...value.event, state: "upcoming" }, reminderSubscribed: true })).toBeNull();
});
it("labels shared pools and scopes repeat rewards to the individual underlying transaction", () => {
  expect(eventDetailReward({ type: "USDT", amount: 5000, pool: true }, eventDetailCopy.zh)).toContain("奖池");
  expect(eventClaimCommandKey("reinvest", ["position-a"])).not.toBe(eventClaimCommandKey("reinvest", ["position-b"]));
  expect(eventClaimCommandKey("referral", ["ONCE"])).toBe("h4-event-claim:referral");
});
it("rejects missing eligibility, corrupt money/progress and mismatched event identity", async () => {
  const value = detail(); expect(parseEventDetail(value)).toEqual(value);
  for (const patch of [{ eligible: null }, { eligibilityReason: "engine-secret" }, { progressValue: -1 }, { rewards: [{ type: "USDT", amount: "NaN" }] }, { results: [{}], rules: null }]) expect(() => parseEventDetail({ ...value, ...patch })).toThrow();
  const request = vi.fn().mockResolvedValue(value);
  const api = createEventDetailApi({ request } as unknown as ApiClient);
  await expect(api.detail("wrong-event", "zh")).rejects.toThrow("EVENT_DETAIL_SCOPE_MISMATCH");
  expect(request.mock.calls[0][0].path).toBe("/api/events/wrong-event/detail?locale=zh");
});

it("keeps earned rewards claimable after closure or expiry without reopening participation", () => {
  const value = detail();
  for (const enabled of [true, false]) {
    const ended = { ...value, enabled, eligible: true, eligibilityReason: "READY" as const, userStatus: "CLAIMABLE" as const, event: { ...value.event, state: "ended" as const } };
    expect(eventDetailAction(ended)).toBe("claim");
    expect(eventDetailAction({ ...ended, eligible: false })).toBeNull();
    expect(eventDetailAction({ ...ended, userStatus: "AVAILABLE" })).toBeNull();
    expect(eventDetailAction({ ...ended, userStatus: "JOINED" })).toBeNull();
    expect(eventDetailAction({ ...ended, userStatus: "CLAIMED" })).toBeNull();
  }
});
