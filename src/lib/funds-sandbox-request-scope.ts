import {
  captureCommerceSandboxRun,
  isCurrentCommerceSandboxScope,
  type CommerceSandboxRunScope,
} from "@/api/order-api";

export interface FundsSandboxRequestScope {
  accountKey: string;
  commerceRun: CommerceSandboxRunScope;
  generation: number;
}

export function captureFundsSandboxRequestScope(accountKey: string, generation: number): FundsSandboxRequestScope {
  return { accountKey, commerceRun: captureCommerceSandboxRun(), generation };
}

export function isCurrentFundsSandboxRequestScope(
  scope: FundsSandboxRequestScope,
  currentAccountKey: string,
  currentGeneration: number,
): boolean {
  return scope.accountKey === currentAccountKey
    && scope.generation === currentGeneration
    && isCurrentCommerceSandboxScope(scope.commerceRun);
}

export function fundsSandboxStaleRequestError(): Error {
  return new Error("FUNDS_SANDBOX_STALE_REQUEST");
}

export function isFundsSandboxStaleRequestError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  return message === "FUNDS_SANDBOX_STALE_REQUEST"
    || message === "FUNDS_SANDBOX_ACCOUNT_CHANGED"
    || message === "FUNDS_SANDBOX_RUN_ID_MISMATCH";
}
