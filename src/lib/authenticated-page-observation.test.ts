import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedPageObservationReporter, shanghaiIsoWeekKey } from "./authenticated-page-observation";

const session = { accessToken: "access", user: { userId: 7 } };
const scope = { accountKey: "user:7", epoch: 3 };

describe("authenticated page observation reporter", () => {
  it("submits an eligible visible subject once despite duplicate page triggers", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const reporter = createAuthenticatedPageObservationReporter();
    const input = {
      subject: "product:stellarbox-pro", scope, session, visible: () => true,
      isCurrent: () => true, submit,
    };

    await Promise.all([reporter.report(input), reporter.report(input)]);

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit for a hidden page, a mismatched bearer session, or stale account scope", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const reporter = createAuthenticatedPageObservationReporter();

    await reporter.report({ subject: "market", scope, session, visible: () => false, isCurrent: () => true, submit });
    await reporter.report({ subject: "market", scope, session: { ...session, user: { userId: 8 } }, visible: () => true, isCurrent: () => true, submit });
    await reporter.report({ subject: "market", scope, session, visible: () => true, isCurrent: () => false, submit });

    expect(submit).not.toHaveBeenCalled();
  });

  it("starts a new client-suppression slot at the Asia/Shanghai ISO-week boundary", async () => {
    let now = Date.parse("2026-09-06T15:59:59.000Z"); // Sunday 23:59:59 Asia/Shanghai, W36.
    const submit = vi.fn().mockResolvedValue(undefined);
    const reporter = createAuthenticatedPageObservationReporter({ now: () => now });
    const input = { subject: "market", scope, session, visible: () => true, isCurrent: () => true, submit };

    await reporter.report(input);
    now = Date.parse("2026-09-06T16:00:00.000Z"); // Monday 00:00:00 Asia/Shanghai, W37.
    await reporter.report(input);

    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("uses one date-normalized ISO key for the 2027 new-year first week", () => {
    expect(shanghaiIsoWeekKey(Date.parse("2027-01-04T00:00:00.000Z"))).toBe("WEEK:2027-W01");
    expect(shanghaiIsoWeekKey(Date.parse("2027-01-10T15:59:59.000Z"))).toBe("WEEK:2027-W01");
  });

  it("allows a later page revisit after a failed request's bounded cooldown without scheduling retries", async () => {
    let now = Date.parse("2026-09-01T00:00:00.000Z");
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const reporter = createAuthenticatedPageObservationReporter({ now: () => now });
    const input = { subject: "market", scope, session, visible: () => true, isCurrent: () => true, submit };

    await reporter.report(input);
    await reporter.report(input);
    now += 30_000;
    await reporter.report(input);

    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("treats a resolved server no-op as a short cooldown and only caches a recorded fact", async () => {
    let now = Date.parse("2026-09-01T00:00:00.000Z");
    const submit = vi.fn()
      .mockResolvedValueOnce({ recorded: false })
      .mockResolvedValueOnce({ recorded: true });
    const reporter = createAuthenticatedPageObservationReporter({ now: () => now });
    const input = {
      subject: "day-one:visit-store", scope, session, visible: () => true, isCurrent: () => true, submit,
      accepted: (result: { recorded: boolean }) => result.recorded,
    };

    await reporter.report(input);
    await reporter.report(input);
    now += 30_000;
    await reporter.report(input);
    now += 1_000;
    await reporter.report(input);

    expect(submit).toHaveBeenCalledTimes(2);
  });
});
