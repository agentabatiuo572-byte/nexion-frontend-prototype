import type { RuntimeRevisionScope } from "@/api/order-api";

export interface BinaryPageReadScope {
  accountKey: string;
  accountBindingEpoch: number;
  runtime: RuntimeRevisionScope;
}

function sameScope(left: BinaryPageReadScope, right: BinaryPageReadScope): boolean {
  return left.accountKey === right.accountKey
    && left.accountBindingEpoch === right.accountBindingEpoch
    && left.runtime.runId === right.runtime.runId
    && left.runtime.epoch === right.runtime.epoch;
}

/** Coalesces a page's F3 and member reads, without crossing account or runtime scopes. */
export function createScopedReadCoalescer() {
  let inFlight: { scope: BinaryPageReadScope; request: Promise<void> } | null = null;

  function run(scope: BinaryPageReadScope, read: () => Promise<void>): Promise<void> {
    if (inFlight && sameScope(inFlight.scope, scope)) return inFlight.request;

    let request: Promise<void>;
    try {
      request = read();
    } catch (cause) {
      request = Promise.reject(cause);
    }
    request = request.finally(() => {
      if (inFlight?.request === request) inFlight = null;
    });
    inFlight = { scope, request };
    return request;
  }

  return { run };
}
