import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import type { RemoteAccountEpoch, RemoteAccountRequest } from "./remote-account-epoch";

export interface RemotePageRequestScope {
  account: RemoteAccountRequest;
  generation: number;
  runtime: RuntimeRevisionScope;
}

/** Page-local fence for read-only account projections such as Events and Missions. */
export function createRemotePageRequestFence(
  accountEpoch: RemoteAccountEpoch,
  isMounted: () => boolean,
) {
  let generation = 0;

  return {
    capture(): RemotePageRequestScope {
      generation += 1;
      return {
        account: accountEpoch.snapshot(),
        generation,
        runtime: captureRuntimeRevision(),
      };
    },
    invalidate(): void {
      generation += 1;
    },
    isCurrent(scope: RemotePageRequestScope): boolean {
      return isMounted()
        && scope.generation === generation
        && accountEpoch.isCurrent(scope.account)
        && isCurrentRuntimeRevision(scope.runtime);
    },
  };
}
