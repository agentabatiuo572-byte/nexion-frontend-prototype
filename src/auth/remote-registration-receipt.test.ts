import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRemoteRegistrationReceipt,
  consumeRemoteRegistrationReceipt,
  stageRemoteRegistrationReceipt,
} from "./remote-registration-receipt";

describe("remote registration receipt", () => {
  beforeEach(() => clearRemoteRegistrationReceipt());

  it("is one-shot memory state and never persists gift facts locally", () => {
    const receipt = {
      sponsorCode: "NXAB12CD34EF",
      sponsorDisplayName: "A•••",
      sourceEnvironment: "PRODUCTION" as const,
      giftStatus: "PENDING_REVIEW" as const,
      giftUsdt: 1.25,
      giftNex: 20,
    };
    stageRemoteRegistrationReceipt(receipt);
    expect(consumeRemoteRegistrationReceipt()).toEqual(receipt);
    expect(consumeRemoteRegistrationReceipt()).toBeNull();
  });

  it("drops a receipt when the active account changed before the success page", () => {
    stageRemoteRegistrationReceipt({
      sponsorCode: "NXAB12CD34EF", sponsorDisplayName: "A•••", sourceEnvironment: "PRODUCTION",
      giftStatus: "PENDING_REVIEW", giftUsdt: 1.25, giftNex: 20,
    }, "user:7101");
    expect(consumeRemoteRegistrationReceipt("user:7102")).toBeNull();
  });
});
