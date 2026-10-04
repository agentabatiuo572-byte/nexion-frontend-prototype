import { expect, test } from "vitest";
import { ApiError } from "@/api/errors";
import { leadershipPoolFailureState } from "./leadership-pool-state";
test("only the explicit settlement hold is a business hold, not any network failure", () => {
  expect(leadershipPoolFailureState(new ApiError({ kind: "business", code: 503, message: "F4_LEADERSHIP_POOL_HOLD" }))).toBe("hold");
  expect(leadershipPoolFailureState(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }))).toBe("error");
  expect(leadershipPoolFailureState(new Error("F4_LEADERSHIP_POOL_HOLD"))).toBe("error");
});
