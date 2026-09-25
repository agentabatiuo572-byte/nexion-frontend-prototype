import type { Messages } from "@/i18n/messages/en";
import type { OrderStatus } from "@/store/orders";

const STATUS_KEYS: Record<OrderStatus, keyof Messages["orders"]> = {
  placed: "statusPlaced",
  paid: "statusPaid",
  provisioning: "statusProvisioning",
  activated: "statusActivated",
  cancelled: "cancelStatus",
  payment_failed: "statusPaymentFailed",
  expired: "statusExpired",
  provisioning_failed: "statusProvisioningFailed",
  refunded: "statusRefunded",
  chargeback: "statusChargeback",
};

export function orderStatusText(copy: Messages["orders"], status: OrderStatus): string {
  return copy[STATUS_KEYS[status]] ?? copy.refreshFailed;
}
