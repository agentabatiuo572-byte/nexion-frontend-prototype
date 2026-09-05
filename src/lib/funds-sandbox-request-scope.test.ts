import { beforeEach, describe, expect, it } from "vitest";
import { setCurrentCommerceSandboxRun } from "@/api/order-api";
import {
  captureFundsSandboxRequestScope,
  fundsSandboxStaleRequestError,
  isCurrentFundsSandboxRequestScope,
  isFundsSandboxStaleRequestError,
} from "./funds-sandbox-request-scope";

beforeEach(() => setCurrentCommerceSandboxRun(null));

describe("funds sandbox request scope", () => {
  it("requires the captured account, generation, and commerce run", () => {
    setCurrentCommerceSandboxRun("funds-run-20260816");
    const scope = captureFundsSandboxRequestScope("user:1", 3);
    expect(isCurrentFundsSandboxRequestScope(scope, "user:1", 3)).toBe(true);
    expect(isCurrentFundsSandboxRequestScope(scope, "user:2", 3)).toBe(false);
    expect(isCurrentFundsSandboxRequestScope(scope, "user:1", 4)).toBe(false);

    setCurrentCommerceSandboxRun("funds-run-20260817");
    expect(isCurrentFundsSandboxRequestScope(scope, "user:1", 3)).toBe(false);
  });

  it("marks stale responses as silent UI drops", () => {
    expect(isFundsSandboxStaleRequestError(fundsSandboxStaleRequestError())).toBe(true);
    expect(isFundsSandboxStaleRequestError(new Error("FUNDS_SANDBOX_RUN_ID_MISMATCH"))).toBe(true);
    expect(isFundsSandboxStaleRequestError(new Error("NETWORK_TIMEOUT"))).toBe(false);
  });
});
