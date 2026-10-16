import { reactive } from "vue";
import { ApiError } from "@/api/errors";
import { buildLegalTermsRoute } from "./legal-terms-gate";
import { createAuthenticatedPageObservationReporter, type AuthenticatedPageObservation } from "./authenticated-page-observation";
import type { RemoteAccountRequest } from "./remote-account-epoch";

export type DayOneObservationReason = "onboarding" | "terms" | "unconfirmed";
export interface DayOneObservationIdentity {
  scope: RemoteAccountRequest;
  questCode: string;
  instanceKey: string;
}
export interface DayOneObservationRequest extends DayOneObservationIdentity,
  Omit<AuthenticatedPageObservation<{ recorded: boolean }>, "subject" | "accepted" | "rejected"> {
  currentInstance(): string | undefined;
}
export function observationRejectionReason(error: unknown): DayOneObservationReason {
  if (error instanceof ApiError && error.kind === "http" && error.status === 428 && error.code === 428) {
    if (error.message === "USER_ONBOARDING_REQUIRED") return "onboarding";
    if (error.message === "LEGAL_TERMS_ACK_REQUIRED") return "terms";
  }
  return "unconfirmed";
}
export function observationRecoveryRoute(reason: DayOneObservationReason, web: boolean, taskRoute: string): string {
  if (reason === "onboarding") return web ? "/pages/register/success?setup=1" : "/pages/onboarding/estimator";
  if (reason === "terms") return buildLegalTermsRoute(taskRoute);
  return taskRoute;
}
export function createDayOneObservationRecovery(reporter = createAuthenticatedPageObservationReporter()) {
  const failures = reactive(new Map<string, DayOneObservationReason>());
  const key = (identity: DayOneObservationIdentity) =>
    JSON.stringify([identity.scope.accountKey, identity.scope.epoch, identity.instanceKey, identity.questCode]);
  const subject = (identity: DayOneObservationIdentity) => `day-one:${identity.questCode}:${identity.instanceKey}`;
  function notice(identity: DayOneObservationIdentity): DayOneObservationReason | undefined {
    return failures.get(key(identity));
  }
  async function report(input: DayOneObservationRequest): Promise<void> {
    const current = () => input.isCurrent(input.scope) && input.currentInstance() === input.instanceKey;
    if (!input.instanceKey || !current()) return;
    // Prune prior account/instance notices, without touching transport keys.
    for (const existing of failures.keys()) {
      const [account, epoch, instance] = JSON.parse(existing);
      if (account !== input.scope.accountKey || epoch !== input.scope.epoch || instance !== input.instanceKey) failures.delete(existing);
    }
    await reporter.report({
      ...input, subject: subject(input),
      isCurrent: () => current(),
      accepted(result) {
        if (current()) {
          if (result.recorded) failures.delete(key(input));
          else if (failures.has(key(input))) failures.set(key(input), "unconfirmed");
        }
        return result.recorded;
      },
      rejected(error) { if (current()) failures.set(key(input), observationRejectionReason(error)); },
    });
  }
  function retry(identity: DayOneObservationIdentity): void {
    // Only an explicit current-task action reopens a failed transport slot.
    reporter.retryFailed(identity.scope, subject(identity));
  }
  return { report, notice, retry };
}
export const dayOneObservationRecovery = createDayOneObservationRecovery();
