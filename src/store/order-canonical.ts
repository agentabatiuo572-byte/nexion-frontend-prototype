import { orderApi, remoteApiEnabled } from "@/api/runtime";
import { useContentCopy } from "@/store/content-copy";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import { captureRuntimeRevision, isCurrentRuntimeRevision } from "@/api/order-api";

let refreshInFlight: Promise<boolean> | null = null;

/**
 * The client never reports a click, amount, or locally inferred purchase as a
 * conversion. It reads server-canonical orders and forwards only their order
 * numbers for the backend to validate again.
 */
export function refreshCanonicalOrders(force = false): Promise<boolean> {
  if (!remoteApiEnabled) return Promise.resolve(true);
  if (!force && refreshInFlight) return refreshInFlight;
  const accountScope = remoteAccountScope.snapshot();
  const runScope = captureRuntimeRevision();
  const request = orderApi.list()
    .then((snapshot) => {
      if (!remoteAccountScope.isCurrent(accountScope) || !isCurrentRuntimeRevision(runScope)) return false;
      const orderNos = snapshot.orders
        .filter((order) => ["paid", "provisioning", "activated"].includes(order.canonicalStatus))
        .map((order) => order.orderNo);
      void useContentCopy().reportOrderConversions(orderNos, accountScope);
      return true;
    })
    .catch(() => false)
    .finally(() => { if (refreshInFlight === request) refreshInFlight = null; });
  refreshInFlight = request;
  return request;
}
