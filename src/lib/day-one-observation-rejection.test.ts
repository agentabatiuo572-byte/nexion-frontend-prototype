import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createAuthenticatedPageObservationReporter } from "./authenticated-page-observation";
const scope = { accountKey: "user:7", epoch: 3 };
const input = () => ({ subject: "day-one:visit-earn:DAY_ONE:one", scope,
  session: { accessToken: "access", user: { userId: 7 } }, visible: () => true, isCurrent: () => true });
describe("task observation rejection callback", () => {
  it("exposes the exact rejection once and permits a deliberate retry of only that failed slot", async () => {
    const reporter = createAuthenticatedPageObservationReporter();
    const error = new ApiError({ kind: "http", status: 428, code: 428, message: "LEGAL_TERMS_ACK_REQUIRED" });
    const rejected = vi.fn(); const submit = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const request = { ...input(), submit, rejected };
    await reporter.report(request);
    expect(rejected).toHaveBeenCalledExactlyOnceWith(error);
    await reporter.report(request); expect(submit).toHaveBeenCalledTimes(1);
    reporter.retryFailed(scope, request.subject);
    await reporter.report(request); expect(submit).toHaveBeenCalledTimes(2);
    reporter.retryFailed(scope, request.subject);
    await reporter.report(request); expect(submit).toHaveBeenCalledTimes(2);
  });
  it("does not deliver a late error into a changed account", async () => {
    let reject!: (e: unknown) => void; let current = true;
    const rejected = vi.fn(); const reporter = createAuthenticatedPageObservationReporter();
    const result = reporter.report({ ...input(), isCurrent: () => current, rejected,
      submit: () => new Promise((_, failure) => { reject = failure; }) });
    current = false; reject(new Error("late")); await result;
    expect(rejected).not.toHaveBeenCalled();
  });
});
