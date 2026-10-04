import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { questClaimNoticeFor } from "./quest-claim-notice";

describe("quest claim rejection notices", () => {
  it.each([
    ["QUEST_ALREADY_CLAIMED", "alreadyClaimed"],
    ["QUEST_INSTANCE_NOT_FOUND", "instanceNotFound"],
    ["QUEST_DEFINITION_INACTIVE", "definitionInactive"],
    ["QUEST_EXPIRED", "expired"],
    ["QUEST_NOT_COMPLETED", "notCompleted"],
  ] as const)("maps %s to a safe display notice", (message, expected) => {
    expect(questClaimNoticeFor(new ApiError({ kind: "business", message, code: 409 }))).toBe(expected);
  });

  it("does not turn an unknown or transport failure into a claim-state message", () => {
    expect(questClaimNoticeFor(new Error("QUEST_SOMETHING_ELSE"))).toBeNull();
    expect(questClaimNoticeFor(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }))).toBeNull();
  });
});
