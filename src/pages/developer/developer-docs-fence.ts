import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import type { RemoteAccountRequest } from "@/lib/remote-account-epoch";

export interface DeveloperDocsFence {
  accountKey: string;
  accountScope: RemoteAccountRequest;
  localeCode: string;
  generation: number;
  runScope: RuntimeRevisionScope;
}

export interface DeveloperDocsFenceReader {
  capture(): DeveloperDocsFence;
  isCurrent(fence: DeveloperDocsFence): boolean;
}

/** Prevent a resumed page from publishing docs from a prior account, locale, or runtime. */
export function createDeveloperDocsFenceReader(
  getAccountKey: () => string,
  getLocaleCode: () => string,
  getGeneration: () => number,
  getAccountScope: () => RemoteAccountRequest = captureAccountScope,
  isAccountScopeCurrent: (scope: RemoteAccountRequest) => boolean = isCurrentAccountScope,
  getRunScope: () => RuntimeRevisionScope = captureRuntimeRevision,
  isRunScopeCurrent: (scope: RuntimeRevisionScope) => boolean = isCurrentRuntimeRevision,
): DeveloperDocsFenceReader {
  return {
    capture: () => ({
      accountKey: getAccountKey(),
      accountScope: getAccountScope(),
      localeCode: getLocaleCode(),
      generation: getGeneration(),
      runScope: getRunScope(),
    }),
    isCurrent: (fence) => fence.accountKey === getAccountKey()
      && fence.localeCode === getLocaleCode()
      && fence.generation === getGeneration()
      && isAccountScopeCurrent(fence.accountScope)
      && isRunScopeCurrent(fence.runScope),
  };
}
