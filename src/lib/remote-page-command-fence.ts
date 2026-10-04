import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import type { RemoteAccountEpoch, RemoteAccountRequest } from "./remote-account-epoch";

export interface RemotePageCommandScope {
  account: RemoteAccountRequest;
  pageEpoch: number;
  runtime: RuntimeRevisionScope;
}

/**
 * Page-local fence for mutations. Unlike a read fence, refreshes do not
 * advance it: an acknowledged command may safely refresh its own projection.
 */
export function createRemotePageCommandFence(
  accountEpoch: RemoteAccountEpoch,
  isPageVisible: () => boolean,
) {
  let pageEpoch = 0;

  return {
    capture(): RemotePageCommandScope {
      return {
        account: accountEpoch.snapshot(),
        pageEpoch,
        runtime: captureRuntimeRevision(),
      };
    },
    invalidate(): void {
      pageEpoch += 1;
    },
    isCurrent(scope: RemotePageCommandScope): boolean {
      return isPageVisible()
        && scope.pageEpoch === pageEpoch
        && accountEpoch.isCurrent(scope.account)
        && isCurrentRuntimeRevision(scope.runtime);
    },
  };
}
