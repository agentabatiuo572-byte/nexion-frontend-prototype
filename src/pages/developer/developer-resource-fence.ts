import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import type { RemoteAccountRequest } from "@/lib/remote-account-epoch";

export interface DeveloperResourceFence {
  accountKey: string;
  accountScope: RemoteAccountRequest;
  generation: number;
  runScope: RuntimeRevisionScope;
}

export interface DeveloperResourceFenceReader {
  capture(): DeveloperResourceFence;
  isCurrent(fence: DeveloperResourceFence): boolean;
}

/**
 * Binds an async developer-resource operation to the account and mounted
 * resource-generation that created it.  The page owns generation changes;
 * this small dependency-free helper keeps the stale-response rule testable.
 */
export function createDeveloperResourceFenceReader(
  getAccountKey: () => string,
  getGeneration: () => number,
  getRunScope: () => RuntimeRevisionScope = captureRuntimeRevision,
  isRunScopeCurrent: (scope: RuntimeRevisionScope) => boolean = isCurrentRuntimeRevision,
  getAccountScope: () => RemoteAccountRequest = captureAccountScope,
  isAccountScopeCurrent: (scope: RemoteAccountRequest) => boolean = isCurrentAccountScope,
): DeveloperResourceFenceReader {
  return {
    capture: () => ({ accountKey: getAccountKey(), accountScope: getAccountScope(), generation: getGeneration(), runScope: getRunScope() }),
    isCurrent: (fence) => fence.accountKey === getAccountKey()
      && fence.generation === getGeneration()
      && isAccountScopeCurrent(fence.accountScope)
      && isRunScopeCurrent(fence.runScope),
  };
}
