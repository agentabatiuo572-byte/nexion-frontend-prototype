import { ApiError } from "@/api/errors";

function isAuthorizationDenial(cause: ApiError): boolean {
  return cause.status === 401 || cause.status === 403 || cause.code === 401 || cause.code === 403;
}

export function isHttpReadRateLimit(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && cause.kind === "http" && !isAuthorizationDenial(cause)
    && (cause.status === 429 || (cause.status === undefined && cause.code === 429));
}

/** Only explicit temporary read failures may retain already-confirmed display. */
export function isTransientReadFailure(cause: unknown): boolean {
  if (!(cause instanceof ApiError) || isAuthorizationDenial(cause)) return false;
  return cause.kind === "network" || (cause.kind === "http"
    && ((cause.status !== undefined && cause.status >= 500 && cause.status <= 599) || isHttpReadRateLimit(cause)));
}
