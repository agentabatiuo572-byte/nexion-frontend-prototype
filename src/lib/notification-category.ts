import type { Notification } from "@/store/notifications";

export type NotificationCategory = "finance" | "device" | "team" | "rewards" | "system";

/** Display groups are independent of the six persisted notification preferences. */
export function notificationCategory(notification: Pick<Notification, "kind" | "rawKind">): NotificationCategory {
  const kind = (notification.rawKind ?? notification.kind).toLowerCase();
  switch (kind) {
    case "wallet": case "payment_method": case "withdrawal": case "order":
    case "commission": case "staking": case "market":
    case "nova_commission": case "nova_staking": case "nova_market": case "nova_staking_event": case "nova_market_event":
      return "finance";
    case "device": case "dailysummary": case "nova_dailysummary":
    case "nova_upgrade": case "nova_tradein":
      return "device";
    case "team": case "nova_team": case "nova_team_event":
      return "team";
    case "genesis": case "nova_genesis": case "reward": case "nova_eventclaim": case "nova_quest": case "nova_tasklockmonthly":
      return "rewards";
    default:
      return "system";
  }
}
