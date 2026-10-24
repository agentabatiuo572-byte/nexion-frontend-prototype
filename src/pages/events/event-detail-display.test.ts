import { expect, it, vi } from "vitest";
import { createEventDetailApi, parseEventDetail, type EventDetail } from "@/api/event-detail-api";
import type { ApiClient } from "@/api/api-client";
import { eventDetailCopy } from "@/i18n/event-detail";
import { eventDetailAction, eventDetailRules, eventDetailReward, eventClaimCommandKey } from "./event-detail-display";

function detail(): EventDetail {
  return { event: { eventCode: "evt-1", kind: "referral", state: "ongoing", title: "Invite", subtitle: "Invite friends", rewardName: "Device", rewardType: "DEVICE", rewardAmount: 1, featured: false, trackable: true, targetValue: 5, progressValue: 2, userStatus: "AVAILABLE", geo: "", href: "/pages/team/team", startsAt: null, endsAt: null },
    rules: { targetInvites: 5, windowDays: 7, deviceBudget: 20, giftProductNo: "private-product-no", arbitraryInternalKey: "not-for-users" }, enabled: true, eligible: true, eligibilityReason: "IN_PROGRESS", progressValue: 2, targetValue: 5, rewards: [{ type: "DEVICE", amount: 0, quantity: 1 }], results: [], userStatus: "AVAILABLE" };
}
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
