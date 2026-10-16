import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createDayOneObservationRecovery, observationRejectionReason, observationRecoveryRoute } from "./day-one-observation-recovery";
const failure = (message = "USER_ONBOARDING_REQUIRED", status = 428, code = 428) =>
  new ApiError({ kind: "http", status, code, message });
function fixture() {
  let instance = "DAY_ONE:one"; let current = true;
  const scope = { accountKey: "user:7", epoch: 3 };
  const recovery = createDayOneObservationRecovery();
  const input = { scope, instanceKey: instance, questCode: "visit_earn",
    session: { accessToken: "access", user: { userId: 7 } }, visible: () => true,
    isCurrent: () => current, currentInstance: () => instance, submit: vi.fn().mockRejectedValue(failure()) };
  return { recovery, input, changeInstance: (value: string) => { instance = value; }, revoke: () => { current = false; } };
}
describe("day-one observation recovery", () => {
  it.each([["USER_ONBOARDING_REQUIRED", "onboarding"], ["LEGAL_TERMS_ACK_REQUIRED", "terms"]])(
    "classifies the precise HTTP rejection %s", async (message, reason) => {
      const f = fixture(); f.input.submit.mockRejectedValue(failure(message));
      await f.recovery.report(f.input);
      expect(f.recovery.notice(f.input)).toBe(reason);
    });
  it.each([failure("SOMETHING_ELSE"), failure("USER_ONBOARDING_REQUIRED", 503),
    failure("USER_ONBOARDING_REQUIRED", 428, 999), new ApiError({kind:"network", message:"USER_ONBOARDING_REQUIRED"}),
    new Error("LEGAL_TERMS_ACK_REQUIRED")])("does not infer a precondition from %s", error => {
      expect(observationRejectionReason(error)).toBe("unconfirmed");
    });
  it("retries only on explicit navigation, preserves pending/accepted dedup and clears a confirmed notice", async () => {
    const f = fixture();
    await f.recovery.report(f.input); await f.recovery.report(f.input);
    expect(f.input.submit).toHaveBeenCalledTimes(1);
    f.recovery.retry(f.input); expect(f.input.submit).toHaveBeenCalledTimes(1);
    f.input.submit.mockResolvedValue({recorded:true});
    await f.recovery.report(f.input); expect(f.recovery.notice(f.input)).toBeUndefined();
    f.recovery.retry(f.input); await f.recovery.report(f.input);
    expect(f.input.submit).toHaveBeenCalledTimes(2);
  });
  it.each(["account", "instance"])("ignores a late rejection after %s changes", async changed => {
    const f = fixture(); let reject!: (cause: unknown) => void;
    f.input.submit.mockImplementation(() => new Promise((_, no) => { reject = no; }));
    const pending = f.recovery.report(f.input);
    if (changed === "account") f.revoke(); else f.changeInstance("DAY_ONE:two");
    reject(failure()); await pending;
    expect(f.recovery.notice(f.input)).toBeUndefined();
  });
  it("does not reuse a successful same-week request for another frozen instance", async () => {
    const f = fixture(); f.input.submit.mockResolvedValue({recorded:true});
    await f.recovery.report(f.input);
    f.changeInstance("DAY_ONE:two");
    await f.recovery.report({...f.input, instanceKey:"DAY_ONE:two"});
    expect(f.input.submit).toHaveBeenCalledTimes(2);
  });
  it.each(["USER_ONBOARDING_REQUIRED", "LEGAL_TERMS_ACK_REQUIRED"])("isolates notices and clears obsolete %s guidance after a successful no-op", async (message) => {
    const f = fixture(); f.input.submit.mockRejectedValue(failure(message)); await f.recovery.report(f.input);
    expect(f.recovery.notice({...f.input, scope:{...f.input.scope,epoch:4}})).toBeUndefined();
    expect(f.recovery.notice({...f.input, questCode:"visit_store"})).toBeUndefined();
    expect(f.recovery.notice({...f.input, instanceKey:"DAY_ONE:two"})).toBeUndefined();
    f.recovery.retry(f.input); f.input.submit.mockResolvedValue({recorded:false});
    await f.recovery.report(f.input); expect(f.recovery.notice(f.input)).toBe("unconfirmed");
    f.recovery.retry(f.input); f.input.submit.mockResolvedValue({recorded:true});
    await f.recovery.report(f.input); expect(f.input.submit).toHaveBeenCalledTimes(3);
    expect(f.recovery.notice(f.input)).toBeUndefined();
  });
  it("keeps a pending request fenced even when retry is pressed", async () => {
    const f = fixture(); let resolve!: (value: {recorded:boolean}) => void;
    f.input.submit.mockImplementation(() => new Promise(ok => {resolve=ok;}));
    const pending=f.recovery.report(f.input); f.recovery.retry(f.input); await f.recovery.report(f.input);
    expect(f.input.submit).toHaveBeenCalledTimes(1); resolve({recorded:true}); await pending;
  });
  it("uses normal setup flows and returns from terms to the original task without issuing a write", () => {
    const target="/pages/store/detail?id=stellarbox-s1";
    expect(observationRecoveryRoute("onboarding",false,target)).toBe("/pages/onboarding/estimator");
    expect(observationRecoveryRoute("onboarding",true,target)).toBe("/pages/register/success?setup=1");
    expect(observationRecoveryRoute("terms",false,target)).toBe("/pages/onboarding/terms?return="+encodeURIComponent(target));
    expect(observationRecoveryRoute("unconfirmed",false,target)).toBe(target);
  });
});
