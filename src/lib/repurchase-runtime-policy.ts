import type { ApiEnvironment } from "@/api/runtime-config";

export type RepurchaseRuntimePolicy = {
  serverAuthoritative: boolean;
  localMock: boolean;
  unavailable: boolean;
};

/**
 * Both supported application environments use the Java service as authority.
 * Internal SANDBOX/PRODUCTION response provenance is validated by the store,
 * not selected as a frontend runtime mode.
 */
export function resolveRepurchaseRuntimePolicy(_environment: ApiEnvironment): RepurchaseRuntimePolicy {
  return { serverAuthoritative: true, localMock: false, unavailable: false };
}
